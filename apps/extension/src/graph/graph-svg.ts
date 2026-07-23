import type { PositionedEdge, PositionedNode } from "./graph-layout.js";

// Hand-drawn SVG renderer: <g> nodes, <path> edges, <text> labels, built with
// createElementNS/textContent only -- never innerHTML with interpolated text,
// since node/edge labels are user (spec-author) content (the phase's CSP risk
// note). Dim/highlight state is applied as CSS classes on the already-built
// nodes rather than rebuilding the DOM, so a ~200-node graph re-filters
// instantly instead of re-rendering every element.

const SVG_NS = "http://www.w3.org/2000/svg";

export interface GraphSvgHandlers {
  onNodeClick(node: PositionedNode): void;
  onEdgeClick(edge: PositionedEdge): void;
  /** Fires on a click that hit neither a node nor an edge (empty canvas), so
   *  the caller can clear focus. */
  onBackgroundClick(): void;
}

export interface GraphSvgView {
  svg: SVGSVGElement;
  /** The single group pan-zoom transforms (holds every node/edge). */
  root: SVGGElement;
  setDimmed(nodeIds: ReadonlySet<string>, edgeIds: ReadonlySet<string>): void;
  setHighlighted(nodeIds: ReadonlySet<string>): void;
  setHidden(nodeIds: ReadonlySet<string>, edgeIds: ReadonlySet<string>): void;
}

/** Deterministic hue from a category label: the same category always paints
 *  the same color across a render without a hand-maintained palette table. */
function categoryHue(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
}

function buildNode(node: PositionedNode, handlers: GraphSvgHandlers): SVGGElement {
  const g = svgEl("g");
  g.dataset.nodeId = node.id;
  g.setAttribute("class", node.specId ? "graph-node has-spec" : "graph-node");
  const hue = categoryHue(node.category);

  const rect = svgEl("rect");
  rect.setAttribute("x", String(node.x - node.width / 2));
  rect.setAttribute("y", String(node.y - node.height / 2));
  rect.setAttribute("width", String(node.width));
  rect.setAttribute("height", String(node.height));
  rect.setAttribute("rx", "8");
  rect.setAttribute("fill", `hsl(${hue} 55% 94%)`);
  rect.setAttribute("stroke", `hsl(${hue} 45% 55%)`);
  rect.setAttribute("stroke-width", node.kind === "terminal" ? "2.5" : "1.5");
  g.appendChild(rect);

  const text = svgEl("text");
  text.setAttribute("x", String(node.x));
  text.setAttribute("y", String(node.y));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute("font-size", "12");
  text.setAttribute("fill", "#0f172a");
  text.textContent = node.label;
  g.appendChild(text);

  g.addEventListener("click", (e) => {
    e.stopPropagation();
    handlers.onNodeClick(node);
  });
  return g;
}

function buildEdge(edge: PositionedEdge, handlers: GraphSvgHandlers): SVGGElement {
  const g = svgEl("g");
  g.dataset.edgeId = edge.id;
  g.setAttribute("class", edge.specId ? "graph-edge has-spec" : "graph-edge");

  const path = svgEl("path");
  path.setAttribute("d", pointsToPath(edge.points));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#94a3b8");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("marker-end", "url(#graph-arrow)");
  g.appendChild(path);

  if (edge.points.length > 0) {
    const mid = edge.points[Math.floor(edge.points.length / 2)];
    const text = svgEl("text");
    text.setAttribute("x", String(mid.x));
    text.setAttribute("y", String(mid.y - 4));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "#475569");
    text.textContent = edge.label;
    g.appendChild(text);
  }

  g.addEventListener("click", (e) => {
    e.stopPropagation();
    handlers.onEdgeClick(edge);
  });
  return g;
}

/** Arrowhead marker, defined once and referenced by every edge's `marker-end`. */
function arrowMarkerDefs(): SVGDefsElement {
  const defs = svgEl("defs");
  const marker = svgEl("marker");
  marker.setAttribute("id", "graph-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const path = svgEl("path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", "#94a3b8");
  marker.appendChild(path);
  defs.appendChild(marker);
  return defs;
}

/** Build the full SVG for a laid-out graph. */
export function renderGraphSvg(
  layout: { nodes: PositionedNode[]; edges: PositionedEdge[]; width: number; height: number },
  handlers: GraphSvgHandlers,
): GraphSvgView {
  const svg = svgEl("svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.appendChild(arrowMarkerDefs());
  svg.addEventListener("click", () => handlers.onBackgroundClick());

  const root = svgEl("g");
  root.setAttribute("class", "graph-root");

  const edgeLayer = svgEl("g");
  for (const edge of layout.edges) edgeLayer.appendChild(buildEdge(edge, handlers));
  const nodeLayer = svgEl("g");
  for (const node of layout.nodes) nodeLayer.appendChild(buildNode(node, handlers));

  root.append(edgeLayer, nodeLayer);
  svg.appendChild(root);

  function eachLayerChild(
    layer: SVGGElement,
    datasetKey: "nodeId" | "edgeId",
    apply: (el: SVGGElement, id: string) => void,
  ): void {
    for (const child of Array.from(layer.children) as SVGGElement[]) {
      apply(child, child.dataset[datasetKey] ?? "");
    }
  }

  // Toggle one CSS class across nodes (and optionally edges) by id-membership.
  // Backs setDimmed/setHidden (nodes + edges) and setHighlighted (nodes only).
  function toggleClass(
    cls: string,
    nodeIds: ReadonlySet<string>,
    edgeIds?: ReadonlySet<string>,
  ): void {
    eachLayerChild(nodeLayer, "nodeId", (el, id) => el.classList.toggle(cls, nodeIds.has(id)));
    if (edgeIds) {
      eachLayerChild(edgeLayer, "edgeId", (el, id) => el.classList.toggle(cls, edgeIds.has(id)));
    }
  }

  return {
    svg,
    root,
    setDimmed: (nodeIds, edgeIds) => toggleClass("dimmed", nodeIds, edgeIds),
    setHighlighted: (nodeIds) => toggleClass("highlighted", nodeIds),
    setHidden: (nodeIds, edgeIds) => toggleClass("hidden", nodeIds, edgeIds),
  };
}
