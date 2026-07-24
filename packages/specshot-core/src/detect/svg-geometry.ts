/**
 * Best-effort element detection from SVG geometry — an ASSIST, never truth.
 * Figma outlines text into dozens of tiny paths, so we compute a bbox per
 * drawable node, drop full-canvas backgrounds, cluster nearby boxes into
 * candidate elements, and hand back a draft MarkDoc the user cleans up.
 *
 * Security: the SVG is parsed for geometry only. We strip <script>,
 * <foreignObject> and event-handler attributes and never render or execute it.
 */
import type { MarkDoc, MarkItem, Position } from "../model/mark-doc.js";
import { readingOrderSort } from "../model/numbering.js";
import { type ClusterOptions, clusterBoxes } from "./cluster.js";
import { parsePathBBox, pointsBBox, type Rect } from "./path-bbox.js";

const num = (el: Element, attr: string, fallback = 0): number => {
  const v = Number.parseFloat(el.getAttribute(attr) ?? "");
  return Number.isFinite(v) ? v : fallback;
};

/** Compute a node's bbox in the SVG's own coordinate space, or null. */
function nodeBBox(el: Element): Rect | null {
  switch (el.tagName.toLowerCase()) {
    case "rect":
      return rectFrom(num(el, "x"), num(el, "y"), num(el, "width"), num(el, "height"));
    case "circle": {
      const r = num(el, "r");
      return rectFrom(num(el, "cx") - r, num(el, "cy") - r, r * 2, r * 2);
    }
    case "ellipse": {
      const rx = num(el, "rx");
      const ry = num(el, "ry");
      return rectFrom(num(el, "cx") - rx, num(el, "cy") - ry, rx * 2, ry * 2);
    }
    case "line":
      return norm(num(el, "x1"), num(el, "y1"), num(el, "x2"), num(el, "y2"));
    case "polygon":
    case "polyline":
      return pointsBBox(el.getAttribute("points") ?? "");
    case "path":
      return parsePathBBox(el.getAttribute("d") ?? "");
    default:
      return null;
  }
}

function rectFrom(x: number, y: number, w: number, h: number): Rect {
  return { startX: x, startY: y, endX: x + w, endY: y + h };
}
function norm(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    startX: Math.min(x1, x2),
    startY: Math.min(y1, y2),
    endX: Math.max(x1, x2),
    endY: Math.max(y1, y2),
  };
}
function area(r: Rect): number {
  return Math.max(0, r.endX - r.startX) * Math.max(0, r.endY - r.startY);
}

/** Strip active/script content and parse to an <svg> DOM (geometry only). */
export function parseSvgSafely(svgText: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  for (const n of svg.querySelectorAll("script, foreignObject")) n.remove();
  for (const el of svg.querySelectorAll("*")) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
  return svg as unknown as SVGSVGElement;
}

/** viewBox → image-space scale/offset so detected boxes land in image pixels. */
function viewBoxTransform(svg: Element, imageWidth: number, imageHeight: number) {
  const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const vw = vb[2];
  const vh = vb[3];
  if (vb.length === 4 && vw !== undefined && vh !== undefined && vw > 0 && vh > 0) {
    return {
      sx: imageWidth / vw,
      sy: imageHeight / vh,
      ox: vb[0] ?? 0,
      oy: vb[1] ?? 0,
    };
  }
  return { sx: 1, sy: 1, ox: 0, oy: 0 };
}

/**
 * Detect candidate element boxes from SVG markup and return a draft MarkDoc
 * numbered flat (1..N) in reading order. `opts` tunes clustering thresholds.
 */
export interface DetectOptions extends ClusterOptions {
  /**
   * Drop nodes whose area is at least this fraction of the image — large
   * structural containers (full-page/panel backgrounds) that would otherwise
   * bridge every content box into one blob under proximity merge. The user
   * re-adds container marks manually. Default 0.15.
   */
  maxAreaRatio?: number;
}

export function detectFromSvg(
  svgText: string,
  imageWidth: number,
  imageHeight: number,
  opts: DetectOptions = {},
): MarkDoc {
  const svg = parseSvgSafely(svgText);
  if (!svg) throw new Error("Could not parse SVG");
  const { sx, sy, ox, oy } = viewBoxTransform(svg, imageWidth, imageHeight);
  const imageArea = imageWidth * imageHeight;
  const maxAreaRatio = opts.maxAreaRatio ?? 0.15;

  const boxes: Rect[] = [];
  for (const el of svg.querySelectorAll("rect, circle, ellipse, line, polygon, polyline, path")) {
    const b = nodeBBox(el);
    if (!b) continue;
    const mapped: Rect = {
      startX: (b.startX - ox) * sx,
      startY: (b.startY - oy) * sy,
      endX: (b.endX - ox) * sx,
      endY: (b.endY - oy) * sy,
    };
    // Drop large structural containers — they'd swallow all content boxes.
    if (area(mapped) >= imageArea * maxAreaRatio) continue;
    boxes.push(mapped);
  }

  const clustered = clusterBoxes(boxes, opts);
  const items: MarkItem[] = clustered.map((r, i) => ({
    itemNo: String(i + 1),
    position: roundRect(r),
  }));
  return readingOrderSort(items).map((item, i) => ({ ...item, itemNo: String(i + 1) }));
}

function roundRect(r: Rect): Position {
  return {
    startX: Math.round(r.startX),
    startY: Math.round(r.startY),
    endX: Math.round(r.endX),
    endY: Math.round(r.endY),
  };
}
