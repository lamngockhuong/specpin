import { afterEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "../src/graph/config-to-graph.js";
import { renderGraphTable } from "../src/graph/graph-table.js";
import { must } from "./test-utils.js";

// Regression: in table view, clicking a row to arm it for Add edge / Delete
// left the row unstyled (the edit selection only ever reached the hidden SVG),
// so the reader could not tell which rows were selected. renderGraphTable now
// returns a setSelected handle and tags rows so the caller can highlight them.

const graph: Graph = {
  nodes: [
    { id: "a", label: "Draft", category: "Application", specId: null },
    { id: "b", label: "Submitted", category: "Application", specId: "spec-1" },
    { id: "c", label: "Home", category: "screens", specId: null },
  ],
  edges: [],
};

function rowById(container: HTMLElement, id: string): HTMLTableRowElement {
  return must(container.querySelector<HTMLTableRowElement>(`tbody tr[data-node-id="${id}"]`));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderGraphTable selection", () => {
  it("tags each row with its node id and marks none selected by default", () => {
    const container = document.createElement("div");
    renderGraphTable(container, graph, new Set(), { onNodeClick: () => {} });
    expect(container.querySelectorAll("tbody tr").length).toBe(3);
    expect(container.querySelectorAll("tbody tr.selected").length).toBe(0);
    expect(rowById(container, "a").getAttribute("aria-selected")).toBe("false");
  });

  it("setSelected highlights exactly the given rows and clears the rest", () => {
    const container = document.createElement("div");
    const view = renderGraphTable(container, graph, new Set(), { onNodeClick: () => {} });

    view.setSelected(new Set(["a", "b"]));
    expect(rowById(container, "a").classList.contains("selected")).toBe(true);
    expect(rowById(container, "b").classList.contains("selected")).toBe(true);
    expect(rowById(container, "c").classList.contains("selected")).toBe(false);
    expect(rowById(container, "a").getAttribute("aria-selected")).toBe("true");

    // Re-selecting a different set clears the previously-armed rows.
    view.setSelected(new Set(["c"]));
    expect(rowById(container, "a").classList.contains("selected")).toBe(false);
    expect(rowById(container, "c").classList.contains("selected")).toBe(true);
  });

  it("re-applies the initial selection on (re-)render, so a filter change keeps the highlight", () => {
    const container = document.createElement("div");
    renderGraphTable(container, graph, new Set(), { onNodeClick: () => {} }, new Set(["b"]));
    expect(rowById(container, "b").classList.contains("selected")).toBe(true);
    expect(rowById(container, "a").classList.contains("selected")).toBe(false);
  });

  it("clicking a row reports its node (the click path that arms selection)", () => {
    const container = document.createElement("div");
    const onNodeClick = vi.fn();
    renderGraphTable(container, graph, new Set(), { onNodeClick });
    rowById(container, "b").click();
    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });
});
