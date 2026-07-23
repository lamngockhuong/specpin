import { t } from "../i18n/index.js";
import type { Graph } from "./config-to-graph.js";

// Graph controls: category filter tabs ("All 203 / AL 20 / ..."), text search
// (highlight, not hide), and focus-on-click (dim non-adjacent nodes/edges). The
// visibility math is a pure function (computeGraphVisibility) so it is
// unit-testable without a DOM; `mountGraphControls` is the thin DOM layer that
// calls it on every state change. The graph<->table toggle itself is a single
// button pair wired here but the table body is rendered by the caller
// (graph-table.ts), which the toggle callback triggers.

export interface CategoryCount {
  /** "all" is the synthetic bucket that always leads the list. */
  id: string;
  count: number;
}

/** One category per distinct `GraphNode.category`, in first-seen order, plus a
 *  leading "all" bucket counting every node. Mirrors the reference UX's
 *  "All 203 / AL 20 / ..." filter tabs. */
export function deriveCategories(graph: Graph): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) counts.set(node.category, (counts.get(node.category) ?? 0) + 1);
  return [
    { id: "all", count: graph.nodes.length },
    ...Array.from(counts, ([id, count]) => ({ id, count })),
  ];
}

export interface GraphFilterState {
  category: string;
  query: string;
  focusNodeId: string | null;
}

export interface GraphVisibility {
  hiddenNodeIds: Set<string>;
  hiddenEdgeIds: Set<string>;
  dimmedNodeIds: Set<string>;
  dimmedEdgeIds: Set<string>;
  highlightedNodeIds: Set<string>;
}

/** Nodes reachable from `focusNodeId` within one hop (either direction), plus
 *  itself. Anything outside this set is dimmed, not hidden -- focus is a
 *  contextual emphasis, unlike the category filter which actually removes
 *  non-matching nodes from view. */
function adjacentNodeIds(graph: Graph, focusNodeId: string): Set<string> {
  const adjacent = new Set([focusNodeId]);
  for (const edge of graph.edges) {
    if (edge.from === focusNodeId) adjacent.add(edge.to);
    if (edge.to === focusNodeId) adjacent.add(edge.from);
  }
  return adjacent;
}

/** Combine the three filter axes into one visibility result: category hides,
 *  search highlights, focus dims. All three can be active at once (e.g. a
 *  category-filtered view can still have a focused node). */
export function computeGraphVisibility(graph: Graph, state: GraphFilterState): GraphVisibility {
  const hiddenNodeIds = new Set<string>();
  if (state.category !== "all") {
    for (const node of graph.nodes)
      if (node.category !== state.category) hiddenNodeIds.add(node.id);
  }
  const hiddenEdgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (hiddenNodeIds.has(edge.from) || hiddenNodeIds.has(edge.to)) hiddenEdgeIds.add(edge.id);
  }

  const dimmedNodeIds = new Set<string>();
  const dimmedEdgeIds = new Set<string>();
  if (state.focusNodeId) {
    const keep = adjacentNodeIds(graph, state.focusNodeId);
    for (const node of graph.nodes) {
      if (!keep.has(node.id) && !hiddenNodeIds.has(node.id)) dimmedNodeIds.add(node.id);
    }
    for (const edge of graph.edges) {
      const touchesFocus = edge.from === state.focusNodeId || edge.to === state.focusNodeId;
      if (!touchesFocus && !hiddenEdgeIds.has(edge.id)) dimmedEdgeIds.add(edge.id);
    }
  }

  const highlightedNodeIds = new Set<string>();
  const query = state.query.trim().toLowerCase();
  if (query) {
    for (const node of graph.nodes) {
      if (!hiddenNodeIds.has(node.id) && node.label.toLowerCase().includes(query)) {
        highlightedNodeIds.add(node.id);
      }
    }
  }

  return { hiddenNodeIds, hiddenEdgeIds, dimmedNodeIds, dimmedEdgeIds, highlightedNodeIds };
}

export type GraphView = "graph" | "table";

export interface GraphControlsCallbacks {
  onFilterChange(state: GraphFilterState): void;
  onViewChange(view: GraphView): void;
}

export interface GraphControlsHandle {
  /** Re-derive + repaint the category tabs (e.g. after switching flows<->screens).
   *  Resets the filter state but does NOT re-render -- the caller re-renders the
   *  canvas right after (main.ts refreshAll), which applies the reset filter once. */
  setGraph(graph: Graph): void;
}

/** Build the control bar (view toggle, category tabs, search box) into
 *  `container`. DOM-only glue: all filtering math lives in
 *  computeGraphVisibility above, called by the caller (main.ts) on every
 *  onFilterChange to repaint the SVG/table. */
export function mountGraphControls(
  container: HTMLElement,
  graph: Graph,
  callbacks: GraphControlsCallbacks,
): GraphControlsHandle {
  let state: GraphFilterState = { category: "all", query: "", focusNodeId: null };
  let currentGraph = graph;

  const toggleRow = document.createElement("div");
  toggleRow.className = "graph-view-toggle";
  const graphBtn = document.createElement("button");
  graphBtn.type = "button";
  graphBtn.textContent = t("graph.toggleGraph");
  graphBtn.className = "active";
  const tableBtn = document.createElement("button");
  tableBtn.type = "button";
  tableBtn.textContent = t("graph.toggleTable");
  toggleRow.append(graphBtn, tableBtn);

  function setView(view: GraphView): void {
    graphBtn.classList.toggle("active", view === "graph");
    tableBtn.classList.toggle("active", view === "table");
    callbacks.onViewChange(view);
  }
  graphBtn.addEventListener("click", () => setView("graph"));
  tableBtn.addEventListener("click", () => setView("table"));

  const tabsRow = document.createElement("div");
  tabsRow.className = "graph-category-tabs";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = t("graph.searchPlaceholder");
  searchInput.className = "graph-search";
  searchInput.addEventListener("input", () => {
    state = { ...state, query: searchInput.value };
    callbacks.onFilterChange(state);
  });

  function renderTabs(): void {
    tabsRow.replaceChildren();
    for (const cat of deriveCategories(currentGraph)) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = `${cat.id === "all" ? t("graph.categoryAll") : cat.id} ${cat.count}`;
      tab.className = cat.id === state.category ? "active" : "";
      tab.addEventListener("click", () => {
        state = { ...state, category: cat.id };
        renderTabs();
        callbacks.onFilterChange(state);
      });
      tabsRow.appendChild(tab);
    }
  }
  renderTabs();

  container.append(toggleRow, tabsRow, searchInput);

  return {
    setGraph: (next) => {
      currentGraph = next;
      state = { category: "all", query: "", focusNodeId: null };
      searchInput.value = "";
      renderTabs();
    },
  };
}

/** Called by main.ts's node-click handler to focus a node (toggling off if the
 *  same node is clicked twice), then repaint via onFilterChange. Kept as a
 *  free function (not part of the handle) since main.ts owns the click wiring
 *  on the SVG, not this module. */
export function focusNode(state: GraphFilterState, nodeId: string): GraphFilterState {
  return { ...state, focusNodeId: state.focusNodeId === nodeId ? null : nodeId };
}
