/**
 * Pure placement solver for the on-page badge (the spec "S" badge and the
 * coverage "+" marker). Kept DOM-free so it can be unit-tested in isolation: the
 * renderer reads live rects and hands them here.
 *
 * The badge is centered on one of the target element's four corners (so it
 * overhangs outward by half its size and does not cover the element's content).
 * The default corner is top-left, matching the original look. When that corner
 * would clip off the *page* (elements flush against the document's top/left edge,
 * e.g. a header control or left-hand nav) or would land on top of a badge already
 * placed, the solver flips to another corner that stays visible and clear.
 *
 * Clamping is against the DOCUMENT, not the viewport, so it is scroll-independent:
 * a badge stays glued to its element and scrolls off-screen together with it,
 * instead of detaching to a viewport edge on scroll or resize, while still never
 * clipping off the page edges.
 */

/** A viewport-relative rect, as returned by getBoundingClientRect. */
export interface TargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Scroll offsets of the window the badge lives in, plus the scrollable document
 *  size used to keep a badge from clipping off the page's far edges. */
export interface Viewport {
  scrollX: number;
  scrollY: number;
  /** documentElement.scrollWidth. Omit (or 0) → the right edge is unbounded. */
  docWidth?: number;
  /** documentElement.scrollHeight. Omit (or 0) → the bottom edge is unbounded. */
  docHeight?: number;
}

/** Build the document-relative `Viewport` the solver expects from a window: scroll
 *  offsets plus the scrollable document size (for the far-edge clamp). Clamping
 *  against the document (not the viewport) is what keeps a badge glued to its
 *  element and scrolling off-screen with it, while staying on the page at edges. */
export function documentView(win: Window): Viewport {
  const root = win.document.documentElement;
  return {
    scrollX: win.scrollX,
    scrollY: win.scrollY,
    docWidth: root.scrollWidth,
    docHeight: root.scrollHeight,
  };
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
  /** Keep-clear margin from the page edges in px. */
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

// When max < min (document shorter than the badge + gutters) the outer Math.max
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

  // Bounds are DOCUMENT-relative (scroll-independent): near edges = page origin +
  // gutter; far edges = document size, or unbounded when unknown (0/undefined).
  const docWidth = view.docWidth || Number.POSITIVE_INFINITY;
  const docHeight = view.docHeight || Number.POSITIVE_INFINITY;
  const minLeft = gutter;
  const maxLeft = docWidth - width - gutter;
  const minTop = gutter;
  const maxTop = docHeight - size - gutter;

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
