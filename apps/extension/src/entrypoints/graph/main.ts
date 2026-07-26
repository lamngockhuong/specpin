import type { Graph, GraphEdge, GraphNode } from "../../graph/config-to-graph.js";
import { flowsToGraph, screensToGraph } from "../../graph/config-to-graph.js";
import type { CaptureRecordingHandle } from "../../graph/graph-capture-recording.js";
import { wireCaptureRecording } from "../../graph/graph-capture-recording.js";
import {
  computeGraphVisibility,
  focusNode,
  type GraphFilterState,
  mountGraphControls,
} from "../../graph/graph-controls.js";
import { type EditWiringHandle, wireEditMode } from "../../graph/graph-edit-wiring.js";
import { overlayGhostBuffer } from "../../graph/graph-ghost.js";
import { createGhostController } from "../../graph/graph-ghost-controller.js";
import { mountGhostPanel } from "../../graph/graph-ghost-panel.js";
import { type GhostReviewHandle, wireGhostReview } from "../../graph/graph-ghost-review.js";
import { createHighlightController, parseOriginTabId } from "../../graph/graph-highlight.js";
import { layoutGraph } from "../../graph/graph-layout.js";
import {
  confirmOrphanShots,
  confirmLeaveIfDirty as guardConfirmLeaveIfDirty,
} from "../../graph/graph-leave-guard.js";
import { type Dataset, wireProjectPicker } from "../../graph/graph-project-picker.js";
import { renderGraphSvg } from "../../graph/graph-svg.js";
import { renderGraphTable } from "../../graph/graph-table.js";
import { attachPanZoom, type PanZoomController } from "../../graph/pan-zoom.js";
import { hydrateI18n, initI18n, resolveUiLocale, t } from "../../i18n/index.js";
import { getLocale, getUiLocale } from "../../shared/config.js";
import type { FlowsScreensResult, ProjectFlowsScreens } from "../../shared/messaging.js";
import { sendToBackground } from "../../shared/messaging.js";
import { applyStoredTheme } from "../../shared/theme.js";
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";

// The graph panel: fetches every connected project's flows/screens, lets the
// reader pick a project + dataset, and renders it as an SVG graph (dagre) or a
// flat table. Orchestration only -- the graph math lives in src/graph/*.ts.

const canvasEl = document.getElementById("canvas") as HTMLElement;
const tableEl = document.getElementById("table") as HTMLElement;
const hintEl = document.getElementById("hint") as HTMLElement;
const controlsEl = document.getElementById("controls") as HTMLElement;
const projectSelect = document.getElementById("project-select") as HTMLSelectElement;
const datasetSelect = document.getElementById("dataset-select") as HTMLSelectElement;
const ghostPanelEl = document.getElementById("ghost-panel") as HTMLElement;
const captureBannerEl = document.getElementById("capture-banner") as HTMLElement;
const editFormEl = document.getElementById("edit-form") as HTMLElement;

const originTabId = parseOriginTabId(new URLSearchParams(location.search).get("originTab"));
const highlight = createHighlightController(hintEl, originTabId);

let projects: ProjectFlowsScreens[] = [];
let projectIdx = 0;
let dataset: Dataset = "flows";
let contentLocale = "en";
let graph: Graph = { nodes: [], edges: [] };
let view: "graph" | "table" = "graph";
let filterState: GraphFilterState = { category: "all", query: "", focusNodeId: null };
let panZoom: PanZoomController | null = null;
let svgView: ReturnType<typeof renderGraphSvg> | null = null;
let controls: ReturnType<typeof mountGraphControls> | null = null;
let ghostReview: GhostReviewHandle | null = null;
let captureRecording: CaptureRecordingHandle | null = null;
let editWiring: EditWiringHandle | null = null;
const ghostController = createGhostController();

function applyFilter(): void {
  const vis = computeGraphVisibility(graph, filterState);
  if (view === "graph" && svgView) {
    svgView.setHidden(vis.hiddenNodeIds, vis.hiddenEdgeIds);
    svgView.setDimmed(vis.dimmedNodeIds, vis.dimmedEdgeIds);
    svgView.setHighlighted(vis.highlightedNodeIds);
  } else if (view === "table") {
    renderGraphTable(tableEl, graph, vis.hiddenNodeIds, {
      onNodeClick: (n) => void handleNodeClick(n),
    });
  }
}

async function handleNodeClick(node: GraphNode): Promise<void> {
  if (editWiring?.handleNodeClick(node)) return;
  filterState = focusNode(filterState, node.id);
  applyFilter();
  if (node.specId) {
    await highlight.attempt(projects[projectIdx]?.connectionId, node.specId, node.urlGlob);
  }
}

async function handleEdgeClick(edge: GraphEdge): Promise<void> {
  if (editWiring?.handleEdgeClick(edge)) return;
  if (edge.pending) {
    ghostReview?.show(edge);
    return;
  }
  if (edge.specId)
    await highlight.attempt(projects[projectIdx]?.connectionId, edge.specId, undefined);
}

function renderCanvas(): void {
  panZoom?.destroy();
  canvasEl.replaceChildren();
  if (graph.nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "graph-empty";
    empty.textContent = t("graph.noData");
    canvasEl.appendChild(empty);
    svgView = null;
    panZoom = null;
    applyFilter();
    return;
  }
  svgView = renderGraphSvg(layoutGraph(graph), {
    onNodeClick: (n) => void handleNodeClick(n),
    onEdgeClick: (e) => void handleEdgeClick(e),
    onBackgroundClick: () => {
      filterState = { ...filterState, focusNodeId: null };
      ghostReview?.hide();
      editWiring?.clearSelection();
      applyFilter();
    },
  });
  canvasEl.appendChild(svgView.svg);
  panZoom = attachPanZoom(svgView.svg, svgView.root);
  applyFilter();
}

// Shared onChanged for ghostReview + editWiring (both re-fetch on write).
function applyRefreshedProjects(list: ProjectFlowsScreens[] | null): void {
  if (list) projects = list;
  refreshAll();
}

// Re-fetch the projects list (its per-project recordEnabled just changed) and
// re-render. Used by the capture banner's record on/off toggle.
async function refreshProjects(): Promise<void> {
  const result = await sendToBackground<FlowsScreensResult>({ type: "GET_FLOWS_SCREENS" });
  applyRefreshedProjects(result.projects);
}

function toggleEditMode(enabled: boolean): void {
  editWiring?.setEnabled(enabled);
  refreshAll();
}

// C3's confirm-discard guard: shared by the edit-mode toggle (turning OFF) and
// the project/dataset picker (either switch also exits edit mode), both of
// which call this BEFORE applying the change. See graph-leave-guard.ts for the
// actual confirm flow; `beforeunload` (below) uses editWiring directly since
// the browser's own prompt there needs no Save option.
function confirmLeaveIfDirty(): Promise<boolean> {
  return guardConfirmLeaveIfDirty({
    isDirty: () => editWiring?.isDirty() ?? false,
    save: () => editWiring?.save() ?? Promise.resolve(false),
  });
}

function setView(next: "graph" | "table"): void {
  view = next;
  canvasEl.hidden = next !== "graph";
  tableEl.hidden = next !== "table";
  applyFilter();
}

function deriveGraph(project: ProjectFlowsScreens | undefined): Graph {
  if (!project) return { nodes: [], edges: [] };
  if (editWiring?.isEnabled()) return editWiring.getGraph(contentLocale);
  if (dataset === "flows") return flowsToGraph(project.flows, contentLocale);
  const buffer = ghostController.forProject(project.connectionId);
  return overlayGhostBuffer(screensToGraph(project.screens, contentLocale), buffer, contentLocale);
}

function refreshAll(): void {
  ghostReview?.hide();
  const project = projects[projectIdx];
  graph = deriveGraph(project);
  filterState = { category: "all", query: "", focusNodeId: null };

  if (controls) controls.setGraph(graph);
  else {
    controls = mountGraphControls(controlsEl, graph, {
      onFilterChange: (s) => {
        filterState = s;
        applyFilter();
      },
      onViewChange: setView,
      onEditModeChange: toggleEditMode,
      canLeaveEditMode: confirmLeaveIfDirty,
    });
  }
  // renderCanvas() applies the (freshly reset) filter exactly once -- for the
  // non-empty graph after building the SVG, or in its empty-graph branch.
  renderCanvas();
  captureRecording?.refresh();
}

const picker = wireProjectPicker(
  projectSelect,
  datasetSelect,
  (choice) => {
    projectIdx = choice.projectIdx;
    dataset = choice.dataset;
    toggleEditMode(false);
  },
  confirmLeaveIfDirty,
);

// C3's beforeunload guard: browsers show only their own generic leave/stay
// prompt here (no custom Save/Discard buttons possible synchronously), so this
// is a plainer backstop than confirmLeaveIfDirty -- it protects a closed tab
// or reload, which the in-app guard above cannot.
window.addEventListener("beforeunload", (e) => {
  if (!editWiring?.isDirty()) return;
  e.preventDefault();
  e.returnValue = "";
});

async function init(): Promise<void> {
  await applyStoredTheme();
  initI18n(resolveUiLocale(await getUiLocale()));
  hydrateI18n(document);
  contentLocale = (await getLocale()) ?? "en";
  ghostReview = wireGhostReview(mountGhostPanel(ghostPanelEl), ghostController, {
    currentProject: () => projects[projectIdx],
    onChanged: applyRefreshedProjects,
  });
  captureRecording = wireCaptureRecording(captureBannerEl, ghostController, {
    currentProjectId: () => projects[projectIdx]?.connectionId,
    currentRecordEnabled: () => projects[projectIdx]?.recordEnabled ?? false,
    onCleared: () => refreshAll(),
    onRecordChanged: refreshProjects,
  });
  editWiring = wireEditMode(controlsEl, editFormEl, {
    currentProject: () => projects[projectIdx],
    currentDataset: () => dataset,
    applySelection: (nodeIds, edgeIds) => svgView?.setSelected(nodeIds, edgeIds),
    onChanged: applyRefreshedProjects,
    locale: () => contentLocale,
    confirmOrphanShots,
  });

  const result = await sendToBackground<FlowsScreensResult>({ type: "GET_FLOWS_SCREENS" });
  projects = result.projects;
  await ghostController.refresh();
  const initial = picker.populate(projects);
  if (!initial) {
    canvasEl.textContent = t("graph.noData");
    captureRecording.refresh();
    return;
  }
  projectIdx = initial.projectIdx;
  dataset = initial.dataset;
  refreshAll();
}

void init();
