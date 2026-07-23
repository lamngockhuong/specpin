import type { Graph, GraphEdge, GraphNode } from "../../graph/config-to-graph.js";
import { flowsToGraph, screensToGraph } from "../../graph/config-to-graph.js";
import {
  computeGraphVisibility,
  focusNode,
  type GraphFilterState,
  mountGraphControls,
} from "../../graph/graph-controls.js";
import { layoutGraph } from "../../graph/graph-layout.js";
import type { Dataset } from "../../graph/graph-project-picker.js";
import { wireProjectPicker } from "../../graph/graph-project-picker.js";
import { renderGraphSvg } from "../../graph/graph-svg.js";
import { renderGraphTable } from "../../graph/graph-table.js";
import { attachPanZoom, type PanZoomController } from "../../graph/pan-zoom.js";
import { hydrateI18n, initI18n, resolveUiLocale, t } from "../../i18n/index.js";
import { getLocale, getUiLocale } from "../../shared/config.js";
import type { FlowsScreensResult, ProjectFlowsScreens } from "../../shared/messaging.js";
import { sendToBackground, sendToTab } from "../../shared/messaging.js";
import { applyStoredTheme } from "../../shared/theme.js";
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";

// The graph panel: fetches every connected project's flows/screens (Phase 4),
// lets the reader pick a project + dataset, and renders it as an SVG graph
// (dagre layout) or a flat table. Orchestration only -- the graph math lives in
// src/graph/*.ts, unit-tested independently of this DOM wiring.

const canvasEl = document.getElementById("canvas") as HTMLElement;
const tableEl = document.getElementById("table") as HTMLElement;
const hintEl = document.getElementById("hint") as HTMLElement;
const controlsEl = document.getElementById("controls") as HTMLElement;
const projectSelect = document.getElementById("project-select") as HTMLSelectElement;
const datasetSelect = document.getElementById("dataset-select") as HTMLSelectElement;

// Parses the "originTab" query param into a tab id, or null if absent/invalid.
// A plain `Number(...) || null` would misread tab id 0 as null; Number.isNaN
// keeps a valid 0 intact (tab ids start at 1 in practice, but this stays precise).
function parseOriginTabId(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// The tab this graph page was opened FROM (query param set by the popup/side
// panel launcher, see shared/open-graph-view.ts). Not the "active tab": once
// the graph tab has focus, the active tab IS this one, so specId clicks must
// target this remembered id directly via sendToTab, never sendToActiveTab.
const originTabId = parseOriginTabId(new URLSearchParams(location.search).get("originTab"));

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

function showHint(text: string): void {
  hintEl.textContent = text;
  hintEl.classList.add("visible");
}
function hideHint(): void {
  hintEl.classList.remove("visible");
}

async function attemptHighlight(specId: string, urlGlob: string | undefined): Promise<void> {
  const project = projects[projectIdx];
  if (originTabId === null || !project) {
    showHint(t("graph.notOnPage", { page: urlGlob ?? specId }));
    return;
  }
  const delivered = await sendToTab(originTabId, {
    type: "HIGHLIGHT_SPEC_ON_TAB",
    specId,
    connectionId: project.connectionId,
  });
  if (delivered) hideHint();
  else showHint(t("graph.notOnPage", { page: urlGlob ?? specId }));
}

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
  filterState = focusNode(filterState, node.id);
  applyFilter();
  if (node.specId) await attemptHighlight(node.specId, node.urlGlob);
}

async function handleEdgeClick(edge: GraphEdge): Promise<void> {
  if (edge.specId) await attemptHighlight(edge.specId, undefined);
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
      applyFilter();
    },
  });
  canvasEl.appendChild(svgView.svg);
  panZoom = attachPanZoom(svgView.svg, svgView.root);
  applyFilter();
}

function setView(next: "graph" | "table"): void {
  view = next;
  canvasEl.hidden = next !== "graph";
  tableEl.hidden = next !== "table";
  applyFilter();
}

function refreshAll(): void {
  const project = projects[projectIdx];
  graph = !project
    ? { nodes: [], edges: [] }
    : dataset === "flows"
      ? flowsToGraph(project.flows, contentLocale)
      : screensToGraph(project.screens, contentLocale);
  filterState = { category: "all", query: "", focusNodeId: null };

  if (controls) controls.setGraph(graph);
  else {
    controls = mountGraphControls(controlsEl, graph, {
      onFilterChange: (s) => {
        filterState = s;
        applyFilter();
      },
      onViewChange: setView,
    });
  }
  // renderCanvas() applies the (freshly reset) filter exactly once -- for the
  // non-empty graph after building the SVG, or in its empty-graph branch.
  renderCanvas();
}

const picker = wireProjectPicker(projectSelect, datasetSelect, (choice) => {
  projectIdx = choice.projectIdx;
  dataset = choice.dataset;
  refreshAll();
});

async function init(): Promise<void> {
  await applyStoredTheme();
  initI18n(resolveUiLocale(await getUiLocale()));
  hydrateI18n(document);
  contentLocale = (await getLocale()) ?? "en";

  const result = await sendToBackground<FlowsScreensResult>({ type: "GET_FLOWS_SCREENS" });
  projects = result.projects;
  const initial = picker.populate(projects);
  if (!initial) {
    canvasEl.textContent = t("graph.noData");
    return;
  }
  projectIdx = initial.projectIdx;
  dataset = initial.dataset;
  refreshAll();
}

void init();
