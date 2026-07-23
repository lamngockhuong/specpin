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

/** Build the table body into `container`, replacing any prior content. `hidden`
 *  is the current category-filter result (graph-controls.ts): matching the SVG
 *  view, a category filter actually removes rows rather than dimming them. */
export function renderGraphTable(
  container: HTMLElement,
  graph: Graph,
  hiddenNodeIds: ReadonlySet<string>,
  handlers: GraphTableHandlers,
): void {
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

  const tbody = document.createElement("tbody");
  const visible = graph.nodes.filter((n) => !hiddenNodeIds.has(n.id));
  for (const node of visible) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
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
  }
  table.appendChild(tbody);

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "graph-table-empty";
    empty.textContent = t("graph.noMatch");
    container.appendChild(empty);
    return;
  }
  container.appendChild(table);
}
