import { describe, expect, it } from "vitest";
import type { Graph } from "../src/graph/config-to-graph.js";
import { layoutGraph } from "../src/graph/graph-layout.js";

describe("layoutGraph", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", label: "Draft", category: "Application", kind: "initial", specId: null },
      { id: "b", label: "Submitted", category: "Application", specId: "app-submit-btn" },
      { id: "c", label: "Approved", category: "Application", kind: "terminal", specId: null },
    ],
    edges: [
      {
        id: "t1",
        from: "a",
        to: "b",
        label: "Submit",
        guard: null,
        role: null,
        specId: "app-submit-btn",
      },
      {
        id: "t2",
        from: "b",
        to: "c",
        label: "Approve",
        guard: "role == admin",
        role: "admin",
        specId: null,
      },
    ],
  };

  it("assigns every node a finite x/y position and its estimated box size", () => {
    const result = layoutGraph(graph);
    expect(result.nodes).toHaveLength(3);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
    // Left-to-right ranking: a draft -> b submitted -> c approved should advance
    // rank (x) at each step for a simple linear chain.
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const [a, b, c] = ["a", "b", "c"].map((id) => {
      const node = byId.get(id);
      expect(node).toBeDefined();
      return node as (typeof result.nodes)[number];
    });
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  it("routes every edge to a non-empty polyline and preserves its original fields", () => {
    const result = layoutGraph(graph);
    expect(result.edges).toHaveLength(2);
    for (const edge of result.edges) {
      expect(edge.points.length).toBeGreaterThan(0);
    }
    const t2 = result.edges.find((e) => e.id === "t2");
    expect(t2).toMatchObject({
      from: "b",
      to: "c",
      label: "Approve",
      guard: "role == admin",
      role: "admin",
    });
  });

  it("routes two parallel edges between the same pair of nodes independently (multigraph)", () => {
    const parallel: Graph = {
      nodes: [
        { id: "a", label: "A", category: "x", specId: null },
        { id: "b", label: "B", category: "x", specId: null },
      ],
      edges: [
        { id: "e1", from: "a", to: "b", label: "One", guard: null, role: null, specId: null },
        { id: "e2", from: "a", to: "b", label: "Two", guard: null, role: null, specId: null },
      ],
    };
    const result = layoutGraph(parallel);
    expect(result.edges).toHaveLength(2);
    expect(result.edges.map((e) => e.label).sort()).toEqual(["One", "Two"]);
  });

  it("reports a positive overall canvas size", () => {
    const result = layoutGraph(graph);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
