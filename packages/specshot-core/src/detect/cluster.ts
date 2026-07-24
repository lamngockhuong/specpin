/**
 * Cluster many small node bboxes into a bounded set of candidate element boxes.
 * Figma outlines text into dozens of tiny <path>s; naive per-node boxes are
 * noise. We merge boxes that overlap or sit within `gap` px of each other,
 * repeating until stable, then drop anything below `minArea`.
 *
 * Pure and deterministic — the unit test asserts a real SVG collapses from
 * ~70 nodes to a workable low count.
 */
import type { Rect } from "./path-bbox.js";

export interface ClusterOptions {
  /** Boxes within this many px (in image space) merge together. */
  gap?: number;
  /** Drop boxes whose area is below this (removes slivers/dots). */
  minArea?: number;
}

const DEFAULTS: Required<ClusterOptions> = { gap: 8, minArea: 24 };

function area(r: Rect): number {
  return Math.max(0, r.endX - r.startX) * Math.max(0, r.endY - r.startY);
}

/** True when two rects overlap or lie within `gap` of each other. */
function near(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.startX - gap <= b.endX &&
    b.startX - gap <= a.endX &&
    a.startY - gap <= b.endY &&
    b.startY - gap <= a.endY
  );
}

function union(a: Rect, b: Rect): Rect {
  return {
    startX: Math.min(a.startX, b.startX),
    startY: Math.min(a.startY, b.startY),
    endX: Math.max(a.endX, b.endX),
    endY: Math.max(a.endY, b.endY),
  };
}

/** One pass: greedily fold each box into an existing near cluster or start one. */
function mergePass(boxes: Rect[], gap: number): Rect[] {
  const clusters: Rect[] = [];
  for (const box of boxes) {
    let merged = false;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      if (cluster && near(cluster, box, gap)) {
        clusters[i] = union(cluster, box);
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ ...box });
  }
  return clusters;
}

/** Cluster node bboxes into candidate element boxes. */
export function clusterBoxes(boxes: Rect[], opts: ClusterOptions = {}): Rect[] {
  const { gap, minArea } = { ...DEFAULTS, ...opts };
  let current = boxes.filter((b) => area(b) >= minArea);

  // Repeat until the count stops shrinking (a merge can create new adjacencies).
  let prev = current.length + 1;
  let guard = 0;
  while (current.length < prev && guard++ < 20) {
    prev = current.length;
    current = mergePass(current, gap);
  }
  return current.filter((b) => area(b) >= minArea);
}
