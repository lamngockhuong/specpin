import { graphlib, layout as runDagreLayout } from "@dagrejs/dagre";
import type { Graph, GraphEdge, GraphNode } from "./config-to-graph.js";

// dagre adapter: {nodes, edges} -> geometry. One adapter serves both the flows
// and screens graphs (config-to-graph already reduced both to the same shape),
// so this file never imports @specpin/spec-schema. Pure aside from constructing
// dagre's own graph object -- no DOM, so it is unit-testable in Node.

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends GraphEdge {
  /** dagre's routed polyline for this edge (already includes the endpoints). */
  points: { x: number; y: number }[];
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  /** Overall canvas size the layout occupies, so the SVG viewBox/pan bounds can
   *  be sized without a second measuring pass. */
  width: number;
  height: number;
}

const NODE_HEIGHT = 40;
const MIN_NODE_WIDTH = 72;
const CHAR_WIDTH = 7;
const LABEL_PADDING = 28;
const CANVAS_MARGIN = 48;

/** A node's box width is estimated from its label length (no DOM measurement
 *  available in this pure module) -- generous enough that the SVG renderer's
 *  actual text never overflows the drawn box for the font this extension ships. */
function estimateNodeWidth(label: string): number {
  return Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + LABEL_PADDING);
}

/** Lay out a {nodes, edges} graph left-to-right with dagre. Edges use their
 *  stable `id` as the multigraph edge name, so two edges sharing the same
 *  from/to (e.g. two triggers between the same pair of states) route and
 *  retrieve independently instead of one clobbering the other. */
export function layoutGraph(graph: Graph): LayoutResult {
  const g = new graphlib.Graph({ directed: true, multigraph: true });
  g.setGraph({
    rankdir: "LR",
    nodesep: 32,
    ranksep: 72,
    marginx: CANVAS_MARGIN,
    marginy: CANVAS_MARGIN,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: estimateNodeWidth(node.label), height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to, {}, edge.id);
  }

  runDagreLayout(g);

  const nodes: PositionedNode[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, x: pos.x, y: pos.y, width: pos.width, height: pos.height };
  });
  const edges: PositionedEdge[] = graph.edges.map((edge) => {
    const pos = g.edge(edge.from, edge.to, edge.id);
    return { ...edge, points: pos?.points ?? [] };
  });

  const label = g.graph() ?? {};
  return {
    nodes,
    edges,
    width: (label.width ?? 0) + CANVAS_MARGIN * 2,
    height: (label.height ?? 0) + CANVAS_MARGIN * 2,
  };
}
