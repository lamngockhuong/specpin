/**
 * Pure geometry for editing marks. All inputs/outputs are IMAGE-space so these
 * functions are viewport-independent and unit-testable. The canvas converts
 * pointer coords via screenToImage() before calling in.
 *
 * `HandleId` is defined here (not in a React layer — this package is headless)
 * so any UI (React or otherwise) can share the same resize-handle vocabulary.
 */
import type { Position } from "../model/mark-doc.js";
import type { Point } from "./viewport.js";

/** The eight-ish resize handles a UI may expose (corners + edges). */
export type HandleId = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

/** Normalize so startX<=endX and startY<=endY (keeps the doc always valid). */
export function normalize(pos: Position): Position {
  return {
    startX: Math.min(pos.startX, pos.endX),
    startY: Math.min(pos.startY, pos.endY),
    endX: Math.max(pos.startX, pos.endX),
    endY: Math.max(pos.startY, pos.endY),
  };
}

/** Move a box by an image-space delta. */
export function applyDrag(pos: Position, dx: number, dy: number): Position {
  return {
    startX: pos.startX + dx,
    startY: pos.startY + dy,
    endX: pos.endX + dx,
    endY: pos.endY + dy,
  };
}

/**
 * Resize by dragging `handle` to image-space point `p`. Edges not owned by the
 * handle stay put; the result is normalized so a handle dragged past the
 * opposite edge simply flips instead of inverting the box.
 */
export function applyResize(pos: Position, handle: HandleId, p: Point): Position {
  let { startX, startY, endX, endY } = pos;
  if (handle.includes("w")) startX = p.x;
  if (handle.includes("e")) endX = p.x;
  if (handle.includes("n")) startY = p.y;
  if (handle.includes("s")) endY = p.y;
  return normalize({ startX, startY, endX, endY });
}

/** Build a box from two image-space points (click-drag to add). */
export function boxFromPoints(a: Point, b: Point): Position {
  return normalize({ startX: a.x, startY: a.y, endX: b.x, endY: b.y });
}

/** A small default box (image px) for a plain click-to-add with no drag. */
export function defaultBoxAt(p: Point, size = 80): Position {
  return {
    startX: p.x - size / 2,
    startY: p.y - size / 2,
    endX: p.x + size / 2,
    endY: p.y + size / 2,
  };
}

/** Clamp a box to stay within the image bounds (used after drag/resize). */
export function clampToImage(pos: Position, width: number, height: number): Position {
  const w = pos.endX - pos.startX;
  const h = pos.endY - pos.startY;
  let sx = Math.max(0, Math.min(pos.startX, width - w));
  let sy = Math.max(0, Math.min(pos.startY, height - h));
  // If the box is larger than the image, just clamp edges independently.
  if (w > width) sx = pos.startX;
  if (h > height) sy = pos.startY;
  return {
    startX: Math.max(0, sx),
    startY: Math.max(0, sy),
    endX: Math.min(width, sx + w),
    endY: Math.min(height, sy + h),
  };
}
