import { describe, expect, it, vi } from "vitest";
import type { PositionedEdge, PositionedNode } from "../src/graph/graph-layout.js";
import { renderGraphSvg } from "../src/graph/graph-svg.js";

// Regression: the visible edge line is only 1.5px, so clicking an edge to
// select it was hit-or-miss. buildEdge now lays a wide transparent
// `.graph-edge-hit` stroke over the same polyline as the real click target;
// the click bubbles to the <g> handler. Pins that the band exists, is wide,
// and that clicking it fires onEdgeClick.

const node = (id: string, x: number): PositionedNode => ({
  id,
  label: id,
  category: "c",
  specId: null,
  x,
  y: 0,
  width: 40,
  height: 24,
});

const edge: PositionedEdge = {
  id: "e1",
  from: "a",
  to: "b",
  label: "go",
  guard: null,
  role: null,
  specId: null,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
};

function render(
  handlers = { onNodeClick: vi.fn(), onEdgeClick: vi.fn(), onBackgroundClick: vi.fn() },
) {
  const view = renderGraphSvg(
    { nodes: [node("a", 0), node("b", 100)], edges: [edge], width: 120, height: 40 },
    handlers,
  );
  return { view, handlers };
}

describe("renderGraphSvg -- edge hit area", () => {
  it("lays a wide transparent hit stroke over each edge", () => {
    const { view } = render();
    const hit = view.svg.querySelector(".graph-edge-hit") as SVGPathElement | null;
    expect(hit).not.toBeNull();
    expect(hit?.getAttribute("stroke")).toBe("transparent");
    // Comfortably wider than the 1.5px visible line.
    expect(Number(hit?.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(10);
  });

  it("clicking the hit band selects the edge", () => {
    const { view, handlers } = render();
    const hit = view.svg.querySelector(".graph-edge-hit") as SVGPathElement;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(handlers.onEdgeClick).toHaveBeenCalledTimes(1);
    expect(handlers.onEdgeClick).toHaveBeenCalledWith(edge);
    expect(handlers.onBackgroundClick).not.toHaveBeenCalled();
  });
});
