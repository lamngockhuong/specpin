/**
 * Compute an approximate bounding box for an SVG path's `d` attribute WITHOUT a
 * renderer, so detection is unit-testable in node/happy-dom (getBBox is
 * unavailable there). Control points are treated as extremes, so curved paths
 * get a box that is never smaller than the true one — fine for the best-effort
 * clustering that a human cleans up afterward.
 */
import type { Position } from "../model/mark-doc.js";

/** A minimal rect in a coordinate space; reused as a pre-normalized Position. */
export type Rect = Position;

const NUM = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

/** Args consumed per path command letter (uppercase); Z consumes none. */
const ARG_COUNT: Record<string, number> = {
  M: 2,
  L: 2,
  T: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  A: 7,
};

/**
 * Parse a path `d` string into a bbox. Tracks the current point through
 * relative/absolute commands and records every coordinate the path touches
 * (endpoints + control points). Returns null when no coordinates are found.
 */
export function parsePathBBox(d: string): Rect | null {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g);
  if (!tokens) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let cx = 0;
  let cy = 0;
  const seen = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  let i = 0;
  let cmd = "";
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === undefined) break;
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd.toUpperCase() === "Z") continue;
    }
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const n = ARG_COUNT[up] ?? 2;
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some((v) => Number.isNaN(v))) break;
    i += n;

    if (up === "H") {
      const a0 = args[0] ?? 0;
      cx = rel ? cx + a0 : a0;
      seen(cx, cy);
    } else if (up === "V") {
      const a0 = args[0] ?? 0;
      cy = rel ? cy + a0 : a0;
      seen(cx, cy);
    } else if (up === "A") {
      // arc: endpoint is the last two args; radii/flags ignored for bbox
      const a5 = args[5] ?? 0;
      const a6 = args[6] ?? 0;
      const ex = rel ? cx + a5 : a5;
      const ey = rel ? cy + a6 : a6;
      seen(ex, ey);
      cx = ex;
      cy = ey;
    } else {
      // M/L/T (1 pt), Q/S (2 pts), C (3 pts): args are x,y pairs
      for (let k = 0; k < n; k += 2) {
        const ak = args[k] ?? 0;
        const ak1 = args[k + 1] ?? 0;
        const px = rel ? cx + ak : ak;
        const py = rel ? cy + ak1 : ak1;
        seen(px, py);
        if (k + 2 >= n) {
          cx = px;
          cy = py;
        }
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { startX: minX, startY: minY, endX: maxX, endY: maxY };
}

/** Extract all numbers from a `points` list (polygon/polyline) into a bbox. */
export function pointsBBox(points: string): Rect | null {
  const nums = points.match(NUM)?.map(Number);
  if (!nums || nums.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let k = 0; k + 1 < nums.length; k += 2) {
    const nx = nums[k];
    const ny = nums[k + 1];
    if (nx === undefined || ny === undefined) continue;
    minX = Math.min(minX, nx);
    maxX = Math.max(maxX, nx);
    minY = Math.min(minY, ny);
    maxY = Math.max(maxY, ny);
  }
  return { startX: minX, startY: minY, endX: maxX, endY: maxY };
}
