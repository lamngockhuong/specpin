import { t } from "../i18n/index.js";
import type { Graph, GraphNode } from "./config-to-graph.js";

// The table view: a flat, filterable alternative to the SVG canvas. Same
// underlying Graph, same category/search filter state (computeGraphVisibility
// in graph-controls.ts), just rendered as rows instead of shapes -- useful when
// a reader wants to scan/search text rather than parse the diagram.

export interface GraphTableHandlers {
  /** A row's node is clicked -- same contract as the SVG's onNodeClick. */
  onNodeClick(node: GraphNode): void;
}

export interface GraphTableView {
  /** Track C (C1) edit-mode selection, mirroring GraphSvgView.setSelected: mark
   *  the selected rows so the reader can see which nodes are armed for Add edge
   *  / Delete (the SVG-only styling was invisible in table view). Edges are not
   *  rows, so this takes node ids only. */
  setSelected(nodeIds: ReadonlySet<string>): void;
}

/** Build the table body into `container`, replacing any prior content. `hidden`
 *  is the current category-filter result (graph-controls.ts): matching the SVG
 *  view, a category filter actually removes rows rather than dimming them.
 *  `selectedNodeIds` re-applies the current edit selection so a filter/search
 *  re-render keeps the armed rows highlighted (the SVG persists this too). */
export function renderGraphTable(
  container: HTMLElement,
  graph: Graph,
  hiddenNodeIds: ReadonlySet<string>,
  handlers: GraphTableHandlers,
  selectedNodeIds: ReadonlySet<string> = new Set(),
): GraphTableView {
  container.replaceChildren();
  const table = document.createElement("table");
  table.className = "graph-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers = [
    t("graph.colNode"),
    t("graph.colCategory"),
    t("graph.colKind"),
    t("graph.colSpec"),
  ];
  for (const label of headers) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Node id -> its row, so setSelected can toggle styling without a re-render
  // (the same incremental-update contract as GraphSvgView.setSelected).
  const rowsById = new Map<string, HTMLTableRowElement>();
  const tbody = document.createElement("tbody");
  const visible = graph.nodes.filter((n) => !hiddenNodeIds.has(n.id));
  for (const node of visible) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.dataset.nodeId = node.id;
    tr.setAttribute("aria-selected", "false");
    tr.addEventListener("click", () => handlers.onNodeClick(node));

    const labelCell = document.createElement("td");
    labelCell.textContent = node.label;
    const categoryCell = document.createElement("td");
    categoryCell.textContent = node.category;
    const kindCell = document.createElement("td");
    kindCell.textContent = node.kind ?? "";
    const specCell = document.createElement("td");
    specCell.textContent = node.specId ?? "";
    if (node.specId) specCell.className = "graph-table-spec";

    tr.append(labelCell, categoryCell, kindCell, specCell);
    tbody.appendChild(tr);
    rowsById.set(node.id, tr);
  }
  table.appendChild(tbody);

  function setSelected(nodeIds: ReadonlySet<string>): void {
    for (const [id, tr] of rowsById) {
      const on = nodeIds.has(id);
      tr.classList.toggle("selected", on);
      tr.setAttribute("aria-selected", String(on));
    }
  }
  // Fresh rows default to unselected (aria-selected="false", no class), so only
  // walk them when there is actually a selection to re-apply -- skips the loop
  // on the common empty-selection render (every filter/search keystroke).
  if (selectedNodeIds.size > 0) setSelected(selectedNodeIds);

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "graph-table-empty";
    empty.textContent = t("graph.noMatch");
    container.appendChild(empty);
  } else {
    container.appendChild(table);
  }
  return { setSelected };
}
