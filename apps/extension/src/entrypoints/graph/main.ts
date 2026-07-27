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
import type { GraphDirection } from "../../graph/graph-layout.js";
import { layoutGraph } from "../../graph/graph-layout.js";
import {
  confirmOrphanShots,
  confirmLeaveIfDirty as guardConfirmLeaveIfDirty,
} from "../../graph/graph-leave-guard.js";
import { fetchProjects, loadSidecarProjects } from "../../graph/graph-project-load.js";
import { type Dataset, wireProjectPicker } from "../../graph/graph-project-picker.js";
import { renderGraphSvg } from "../../graph/graph-svg.js";
import { renderGraphTable } from "../../graph/graph-table.js";
import { mountGraphViewToolbar } from "../../graph/graph-view-toolbar.js";
import { attachPanZoom, type PanZoomController } from "../../graph/pan-zoom.js";
import { hydrateI18n, initI18n, resolveUiLocale, t } from "../../i18n/index.js";
import { getLocale, getUiLocale } from "../../shared/config.js";
import { confirmDialog } from "../../shared/dialog.js";
import { createIconButton } from "../../shared/icons.js";
import type { ProjectFlowsScreens } from "../../shared/messaging.js";
import { applyStoredTheme } from "../../shared/theme.js";
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";
import "../../shared/icon-btn.css";

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
const editBarEl = document.getElementById("edit-bar") as HTMLElement;
const graphToolbarEl = document.getElementById("graph-toolbar") as HTMLElement;

const originTabId = parseOriginTabId(new URLSearchParams(location.search).get("originTab"));
const highlight = createHighlightController(hintEl, originTabId);

let projects: ProjectFlowsScreens[] = [];
let projectIdx = 0;
let dataset: Dataset = "flows";
let contentLocale = "en";
let graph: Graph = { nodes: [], edges: [] };
let view: "graph" | "table" = "graph";
let direction: GraphDirection = "LR";
let filterState: GraphFilterState = { category: "all", query: "", focusNodeId: null };
let panZoom: PanZoomController | null = null;
let svgView: ReturnType<typeof renderGraphSvg> | null = null;
let tableView: ReturnType<typeof renderGraphTable> | null = null;
// The current edit selection, cached so a table re-render (filter/search)
// re-applies the highlight. editWiring owns the authoritative selection; this
// is only the last set pushed through applySelection.
let selectedNodeIds: ReadonlySet<string> = new Set();
let controls: ReturnType<typeof mountGraphControls> | null = null;
// True while the second (network) load phase is in flight -- see
// loadSidecarProjects. Only flips the empty-canvas copy from "nothing
// configured" to "connecting", so a sidecar that is merely slow never reads as
// a missing config.
let connecting = false;
let ghostReview: GhostReviewHandle | null = null;
let captureRecording: CaptureRecordingHandle | null = null;
let editWiring: EditWiringHandle | null = null;
const ghostController = createGhostController();

/** What an empty canvas should say right now. Both empty-state paths (the
 *  styled placeholder in renderCanvas, the no-project bail in applyProjects)
 *  read it from here so their wording cannot drift apart. */
function emptyCopy(): string {
  return t(connecting ? "graph.connecting" : "graph.noData");
}

function applyFilter(): void {
  const vis = computeGraphVisibility(graph, filterState);
  if (view === "graph" && svgView) {
    svgView.setHidden(vis.hiddenNodeIds, vis.hiddenEdgeIds);
    svgView.setDimmed(vis.dimmedNodeIds, vis.dimmedEdgeIds);
    svgView.setHighlighted(vis.highlightedNodeIds);
  } else if (view === "table") {
    tableView = renderGraphTable(
      tableEl,
      graph,
      vis.hiddenNodeIds,
      { onNodeClick: (n) => void handleNodeClick(n) },
      selectedNodeIds,
    );
  }
  applyActiveArrows();
}

// Animate the arrows touching the "active" node(s) so it reads at a glance
// which node is picked and where it connects. One source of truth: the edit
// selection while editing, else the view-mode focus node. Re-derived from
// scratch on every filter/selection change so the animation never goes stale.
function applyActiveArrows(): void {
  if (view !== "graph" || !svgView) return;
  const nodes = editWiring?.isEnabled()
    ? selectedNodeIds
    : filterState.focusNodeId
      ? new Set([filterState.focusNodeId])
      : new Set<string>();
  const edgeIds = new Set<string>();
  if (nodes.size > 0) {
    for (const e of graph.edges) if (nodes.has(e.from) || nodes.has(e.to)) edgeIds.add(e.id);
  }
  svgView.setActiveArrows(edgeIds);
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

// Show the floating graph toolbar (layout direction + zoom) only when a real
// diagram is on screen -- hidden in the table view and for an empty graph,
// where there is nothing to orient or zoom.
function updateGraphToolbarVisibility(): void {
  graphToolbarEl.hidden = !(view === "graph" && svgView !== null);
}

function renderCanvas(): void {
  panZoom?.destroy();
  canvasEl.replaceChildren();
  if (graph.nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "graph-empty";
    empty.textContent = emptyCopy();
    canvasEl.appendChild(empty);
    svgView = null;
    panZoom = null;
    applyFilter();
    updateGraphToolbarVisibility();
    return;
  }
  svgView = renderGraphSvg(layoutGraph(graph, direction), {
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
  updateGraphToolbarVisibility();
}

// Shared onChanged for ghostReview + editWiring (both re-fetch on write).
function applyRefreshedProjects(list: ProjectFlowsScreens[] | null): void {
  if (list) projects = list;
  refreshAll();
}

// Re-fetch the projects list (its per-project recordEnabled just changed) and
// re-render. Used by the capture banner's record on/off toggle. A cached read is
// enough: the write path already refreshed the connection it touched.
async function refreshProjects(): Promise<void> {
  applyRefreshedProjects((await fetchProjects()).projects);
}

// Paint a freshly fetched projects list: re-populate the picker, then render.
// The picker restores the saved pick by connectionId, so a project arriving in
// the second load phase cannot steal the current selection. Shared by both
// phases -- unlike applyRefreshedProjects, which keeps the picker untouched
// because a write-back never changes which projects exist.
function applyProjects(list: ProjectFlowsScreens[]): void {
  projects = list;
  const initial = picker.populate(projects);
  if (!initial) {
    canvasEl.textContent = emptyCopy();
    captureRecording?.refresh();
    return;
  }
  projectIdx = initial.projectIdx;
  dataset = initial.dataset;
  refreshAll();
}

function toggleEditMode(enabled: boolean): void {
  editWiring?.setEnabled(enabled);
  // Keep the controls' edit toggle in sync -- switching project/dataset exits
  // edit mode here without going through the button's own click handler, so
  // without this the toggle would stay lit while the edit-bar is hidden.
  controls?.setEditMode(enabled);
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
  updateGraphToolbarVisibility();
  applyFilter();
}

function deriveGraph(project: ProjectFlowsScreens | undefined): Graph {
  if (!project) return { nodes: [], edges: [] };
  // The live edit draft when edit mode is on, else the committed config. Kept
  // as a nullable so the screens branch can overlay ghosts onto whichever base.
  const editGraph = editWiring?.isEnabled() ? editWiring.getGraph(contentLocale) : null;
  // Flows carry no auto-capture ghosts (overlayGhostBuffer is screens-only).
  if (dataset === "flows") return editGraph ?? flowsToGraph(project.flows, contentLocale);
  // Screens: overlay the auto-captured draft buffer in BOTH view and edit mode,
  // so recorded transitions stay on-screen while editing (they remain review-
  // only pending edges -- a click routes to the ghost-review panel). Without
  // this, toggling edit dropped the overlay and every recorded edge vanished,
  // reverting to the committed (or empty) diagram.
  const base = editGraph ?? screensToGraph(project.screens, contentLocale);
  const buffer = ghostController.forProject(project.connectionId);
  return overlayGhostBuffer(base, buffer, contentLocale);
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

// Header collapse toggle: folds away the whole top control stack (the #controls
// row, the capture-recording banner, and the edit toolbar) so the diagram gets
// their full height. Drives a body-level `controls-collapsed` class rather than
// each row's `hidden` -- the banner and edit-bar own their own hidden state
// (graph-capture-recording / graph-edit-wiring), so a CSS override keeps this
// gesture from fighting that state, and each row reappears per its own state
// when expanded. Session-only -- a "maximize this view now" gesture, not a
// persisted preference.
function mountControlsCollapse(): void {
  const header = document.querySelector("header");
  if (!header) return;
  const btn = createIconButton(
    document,
    "icon-btn",
    "chevronUp",
    t("graph.collapseControls"),
    () => {
      const collapsed = document.body.classList.toggle("controls-collapsed");
      btn.classList.toggle("collapsed", collapsed);
      const label = t(collapsed ? "graph.expandControls" : "graph.collapseControls");
      btn.title = label;
      btn.setAttribute("aria-label", label);
    },
  );
  btn.id = "controls-collapse";
  header.appendChild(btn);
}

async function init(): Promise<void> {
  // Three independent storage reads plus the two independent background reads
  // below, all issued together rather than chained -- this page's whole point is
  // that it paints without waiting on anything it does not have to.
  const [, uiLocale, locale] = await Promise.all([applyStoredTheme(), getUiLocale(), getLocale()]);
  initI18n(resolveUiLocale(uiLocale));
  hydrateI18n(document);
  mountControlsCollapse();
  contentLocale = locale ?? "en";
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
  // The on-canvas toolbar (layout direction + zoom): mounted once, kept across
  // re-renders. Zoom routes to whatever panZoom the latest render created; a
  // direction change re-lays-out the graph.
  mountGraphViewToolbar(graphToolbarEl, {
    onDirectionChange: (d) => {
      direction = d;
      renderCanvas();
    },
    initialDirection: direction,
    onZoomIn: () => panZoom?.zoomBy(1.2),
    onZoomOut: () => panZoom?.zoomBy(1 / 1.2),
    onZoomFit: () => panZoom?.reset(),
  });

  editWiring = wireEditMode(editBarEl, editFormEl, {
    currentProject: () => projects[projectIdx],
    currentDataset: () => dataset,
    // Push the edit selection to whichever view is showing. Cache the node ids
    // so a table re-render (applyFilter) can re-highlight the armed rows; the
    // table has no edge rows, so edges style the SVG only.
    applySelection: (nodeIds, edgeIds) => {
      selectedNodeIds = nodeIds;
      svgView?.setSelected(nodeIds, edgeIds);
      tableView?.setSelected(nodeIds);
      applyActiveArrows();
    },
    onChanged: applyRefreshedProjects,
    locale: () => contentLocale,
    confirmOrphanShots,
    // Switching the active flow mid-edit reuses the same save/discard guard as
    // leaving edit mode -- an unsaved draft is per-flow, so re-scoping to
    // another flow would drop it otherwise.
    confirmLeaveActiveFlow: confirmLeaveIfDirty,
    // Delete-selected (button + Delete key) confirms first; deleting a node
    // cascades to its connected edges, so its message says so.
    confirmDelete: (target) =>
      confirmDialog({
        message: t(
          target === "edge" ? "graph.edit.confirmDeleteEdge" : "graph.edit.confirmDeleteNode",
        ),
        okLabel: t("graph.edit.deleteConfirmOk"),
        danger: true,
      }),
  });

  // Two-phase load (see graph-project-load.ts): paint what needs no network
  // first, so a configured-but-down sidecar can no longer hold the whole panel
  // blank for the length of its request timeouts. Phase two runs only when the
  // background says sidecars are still unloaded -- a Manual-import-only setup
  // never goes near the network.
  const [result] = await Promise.all([fetchProjects(), ghostController.refresh()]);
  connecting = result.pending > 0;
  applyProjects(result.projects);
  if (!connecting) return;
  void loadSidecarProjects(projects, () => editWiring?.isDirty() ?? false).then((list) => {
    // Clear the placeholder BEFORE painting, so an empty canvas falls back to
    // "nothing configured" rather than staying stuck on "connecting".
    connecting = false;
    if (list) applyProjects(list);
  });
}

void init();
