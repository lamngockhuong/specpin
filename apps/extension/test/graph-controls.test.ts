import { describe, expect, it, vi } from "vitest";
import type { Graph } from "../src/graph/config-to-graph.js";
import {
  computeGraphVisibility,
  deriveCategories,
  mountGraphControls,
} from "../src/graph/graph-controls.js";
import { must } from "./test-utils.js";

const graph: Graph = {
  nodes: [
    { id: "a", label: "Draft", category: "Application", specId: null },
    { id: "b", label: "Submitted", category: "Application", specId: "spec-1" },
    { id: "c", label: "Home", category: "screens", specId: null },
  ],
  edges: [
    { id: "e1", from: "a", to: "b", label: "Submit", guard: null, role: null, specId: null },
    { id: "e2", from: "b", to: "c", label: "Go home", guard: null, role: null, specId: null },
  ],
};

describe("deriveCategories", () => {
  it("counts nodes per category, plus an 'all' bucket for every node", () => {
    const categories = deriveCategories(graph);
    expect(categories).toEqual([
      { id: "all", count: 3 },
      { id: "Application", count: 2 },
      { id: "screens", count: 1 },
    ]);
  });
});

describe("computeGraphVisibility", () => {
  it("hides nodes outside the selected category, and any edge touching a hidden node", () => {
    const vis = computeGraphVisibility(graph, {
      category: "screens",
      query: "",
      focusNodeId: null,
    });
    expect(vis.hiddenNodeIds).toEqual(new Set(["a", "b"]));
    // Both edges touch a hidden node ('a' or 'b'), so both are hidden too.
    expect(vis.hiddenEdgeIds).toEqual(new Set(["e1", "e2"]));
  });

  it("hides nothing when category is 'all'", () => {
    const vis = computeGraphVisibility(graph, { category: "all", query: "", focusNodeId: null });
    expect(vis.hiddenNodeIds.size).toBe(0);
    expect(vis.hiddenEdgeIds.size).toBe(0);
  });

  it("highlights nodes whose label matches the search query (case-insensitive)", () => {
    const vis = computeGraphVisibility(graph, { category: "all", query: "sub", focusNodeId: null });
    expect(vis.highlightedNodeIds).toEqual(new Set(["b"]));
  });

  it("dims every node/edge not adjacent to the focused node, and never dims the focus node itself", () => {
    const vis = computeGraphVisibility(graph, { category: "all", query: "", focusNodeId: "b" });
    // 'b' is adjacent to 'a' (via e1) and 'c' (via e2): nothing is dimmed here
    // since every node is within one hop in this small graph.
    expect(vis.dimmedNodeIds.has("b")).toBe(false);
    expect(vis.dimmedNodeIds.has("a")).toBe(false);
    expect(vis.dimmedNodeIds.has("c")).toBe(false);
  });

  it("dims a node with no path to the focused node", () => {
    const disconnected: Graph = {
      nodes: [...graph.nodes, { id: "d", label: "Orphan", category: "x", specId: null }],
      edges: graph.edges,
    };
    const vis = computeGraphVisibility(disconnected, {
      category: "all",
      query: "",
      focusNodeId: "b",
    });
    expect(vis.dimmedNodeIds.has("d")).toBe(true);
    expect(vis.dimmedNodeIds.has("a")).toBe(false);
  });

  it("applies no dimming when no node is focused", () => {
    const vis = computeGraphVisibility(graph, { category: "all", query: "", focusNodeId: null });
    expect(vis.dimmedNodeIds.size).toBe(0);
    expect(vis.dimmedEdgeIds.size).toBe(0);
  });
});

describe("mountGraphControls edit toggle", () => {
  function mount() {
    const container = document.createElement("div");
    const onEditModeChange = vi.fn();
    const handle = mountGraphControls(container, graph, {
      onFilterChange: () => {},
      onViewChange: () => {},
      onEditModeChange,
    });
    const editBtn = must(container.querySelector<HTMLButtonElement>(".graph-edit-toggle"));
    return { handle, editBtn, onEditModeChange };
  }

  it("setEditMode(false) clears the toggle's active state without re-firing the callback", () => {
    const { handle, editBtn, onEditModeChange } = mount();
    // Enter edit mode via the button (as a user would): it lights up + fires.
    editBtn.click();
    expect(editBtn.classList.contains("active")).toBe(true);
    expect(onEditModeChange).toHaveBeenCalledTimes(1);

    // Programmatic exit (the project/dataset-switch path in main.ts) must clear
    // the lit state so the toggle never contradicts the hidden edit-bar...
    handle.setEditMode(false);
    expect(editBtn.classList.contains("active")).toBe(false);
    // ...and must NOT re-fire onEditModeChange (main.ts already toggled the wiring).
    expect(onEditModeChange).toHaveBeenCalledTimes(1);
  });

  it("setEditMode(true) lights the toggle without firing the callback", () => {
    const { handle, editBtn, onEditModeChange } = mount();
    handle.setEditMode(true);
    expect(editBtn.classList.contains("active")).toBe(true);
    expect(onEditModeChange).not.toHaveBeenCalled();
  });
});
