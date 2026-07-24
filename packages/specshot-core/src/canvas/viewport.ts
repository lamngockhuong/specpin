/**
 * Viewport transform between ORIGINAL image pixel space and on-screen pixels.
 *
 * Coordinates in the MarkDoc are always image-space; the viewport is the only
 * place scale/pan is applied. This module is pure and unit-tested — the
 * round-trip screenToImage(imageToScreen(p)) === p is the correctness lynchpin
 * of the whole editor (a wrong transform makes every drag land off-target).
 */

export interface Point {
  x: number;
  y: number;
}

/** scale = screen px per image px; offset = screen px of image origin (0,0). */
export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 20;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Image-space point → screen-space point. */
export function imageToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.offsetX, y: p.y * vp.scale + vp.offsetY };
}

/** Screen-space point → image-space point (inverse of imageToScreen). */
export function screenToImage(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.offsetX) / vp.scale, y: (p.y - vp.offsetY) / vp.scale };
}

/** Convert an image-space length to a screen-space length. */
export function imageLenToScreen(vp: Viewport, len: number): number {
  return len * vp.scale;
}

/**
 * Zoom by `factor` around a screen-space anchor (e.g. the cursor), keeping the
 * image point under that anchor fixed. Returns a new viewport.
 */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  const newScale = clampScale(vp.scale * factor);
  const imagePt = screenToImage(vp, anchor);
  // Solve offset so imageToScreen(newScale, imagePt) === anchor.
  return {
    scale: newScale,
    offsetX: anchor.x - imagePt.x * newScale,
    offsetY: anchor.y - imagePt.y * newScale,
  };
}

/** Pan by a screen-space delta. */
export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, offsetX: vp.offsetX + dx, offsetY: vp.offsetY + dy };
}

/**
 * Fit an image of the given intrinsic size centered inside a container,
 * with a little padding. Never scales above 1 (avoid blowing up small images).
 */
export function fitToContainer(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 24,
): Viewport {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const availW = Math.max(1, containerWidth - padding * 2);
  const availH = Math.max(1, containerHeight - padding * 2);
  const scale = clampScale(Math.min(availW / imageWidth, availH / imageHeight, 1));
  const offsetX = (containerWidth - imageWidth * scale) / 2;
  const offsetY = (containerHeight - imageHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}
