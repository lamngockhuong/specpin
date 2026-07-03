/**
 * Pure placement solver for the tooltip "S" badge. Kept DOM-free so it can be
 * unit-tested in isolation: the renderer reads live rects and hands them here.
 *
 * The badge is centered on one of the target element's four corners (so it
 * overhangs outward by half its size and does not cover the element's content).
 * The default corner is top-left, matching the original look. When that corner
 * would clip off-screen (elements flush against the viewport's left/top edge,
 * e.g. a left-hand nav) or would land on top of a badge already placed, the
 * solver flips to another corner that stays fully visible and clear.
 */

/** A viewport-relative rect, as returned by getBoundingClientRect. */
export interface TargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Scroll offsets + inner size of the window the badge lives in. */
export interface Viewport {
  scrollX: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
}

/** A document-absolute badge box (top-left origin), used for overlap tests. */
export interface BadgeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ResolveOptions {
  /** Badge diameter in px (the height, and the single-digit circle's width). */
  size?: number;
  /** Badge width in px, for a widened pill (2+ digits). Defaults to `size` (a
   *  square badge). The height always stays `size`; only the horizontal footprint
   *  and the corner-center offset use this. */
  width?: number;
  /** Keep-clear margin from the viewport edges in px. */
  gutter?: number;
}

/** Badge diameter in px. Shared so the CSS, the solver, and the box the renderer
 *  accumulates all agree on one number. */
export const BADGE_SIZE = 16;
const DEFAULT_GUTTER = 2;

// Corners of the target, each expressed as the viewport-relative point the badge
// centers on. Order is the placement priority: top-left first (original look),
// then the remaining corners as fallbacks.
type Corner = (r: TargetRect) => { cx: number; cy: number };
const CORNERS: Corner[] = [
  (r) => ({ cx: r.left, cy: r.top }), // top-left
  (r) => ({ cx: r.right, cy: r.top }), // top-right
  (r) => ({ cx: r.left, cy: r.bottom }), // bottom-left
  (r) => ({ cx: r.right, cy: r.bottom }), // bottom-right
];

// When max < min (viewport shorter than the badge + gutters) the outer Math.max
// yields min, so the badge pins to the near edge instead of jumping past it.
const clampAxis = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const overlaps = (a: BadgeBox, b: BadgeBox): boolean =>
  a.left < b.left + b.width &&
  a.left + a.width > b.left &&
  a.top < b.top + b.height &&
  a.top + a.height > b.top;

/**
 * Choose a document-absolute top-left for the badge of `rect`, avoiding
 * off-screen clipping and overlap with `placed` (already-positioned badges,
 * document-absolute). Returns coordinates ready to assign to style.left/top.
 */
export function resolveBadgePosition(
  rect: TargetRect,
  view: Viewport,
  placed: BadgeBox[] = [],
  opts: ResolveOptions = {},
): { left: number; top: number } {
  const size = opts.size ?? BADGE_SIZE;
  // Pill width for 2+ digits; defaults to a square badge. Height stays `size`.
  const width = opts.width ?? size;
  const gutter = opts.gutter ?? DEFAULT_GUTTER;
  const halfX = width / 2;
  const halfY = size / 2;

  const minLeft = view.scrollX + gutter;
  const maxLeft = view.scrollX + view.innerWidth - width - gutter;
  const minTop = view.scrollY + gutter;
  const maxTop = view.scrollY + view.innerHeight - size - gutter;

  // Seeded with an infinite penalty so the first corner always wins the tie and
  // becomes the initial best; corner order then breaks equal-penalty ties.
  let best = { left: minLeft, top: minTop, penalty: Number.POSITIVE_INFINITY };

  for (let i = 0; i < CORNERS.length; i++) {
    const { cx, cy } = CORNERS[i](rect);
    // Raw box, document-absolute, centered on the corner (width may exceed height
    // for a pill, so each axis uses its own half-extent).
    const rawLeft = cx + view.scrollX - halfX;
    const rawTop = cy + view.scrollY - halfY;
    const left = clampAxis(rawLeft, minLeft, maxLeft);
    const top = clampAxis(rawTop, minTop, maxTop);

    const moved = left !== rawLeft || top !== rawTop;
    const box: BadgeBox = { left, top, width, height: size };
    const collides = placed.some((p) => overlaps(box, p));

    // Lower is better: a free, unclamped corner beats a clamped one beats a
    // colliding one. Strict `<` keeps the earlier (higher-priority) corner on ties.
    const penalty = (collides ? 2 : 0) + (moved ? 1 : 0);
    if (penalty < best.penalty) {
      best = { left, top, penalty };
      if (penalty === 0) break; // ideal corner found, stop early
    }
  }

  return { left: best.left, top: best.top };
}
