import { describe, expect, it } from "vitest";
import { type BadgeBox, resolveBadgePosition } from "../src/renderers/badge-position.js";

// A 1000x800 document, unscrolled, unless a test overrides it.
const view = { scrollX: 0, scrollY: 0, docWidth: 1000, docHeight: 800 };

// Badge is 16px, centered on a corner (±8 overhang); gutter is 2px.
describe("resolveBadgePosition", () => {
  it("keeps the top-left corner for a mid-screen element (no regression)", () => {
    const rect = { left: 400, top: 300, right: 500, bottom: 340 };
    expect(resolveBadgePosition(rect, view)).toEqual({ left: 392, top: 292 });
  });

  it("flips off the clipped left/top edge instead of going off the page", () => {
    // Element flush against the document's left edge (like a left nav item).
    const rect = { left: 0, top: 200, right: 240, bottom: 240 };
    const pos = resolveBadgePosition(rect, view);
    // Top-left would be -8 (off-screen); solver flips to the right corner.
    expect(pos.left).toBeGreaterThanOrEqual(2);
    expect(pos.left + 16).toBeLessThanOrEqual(1000 - 2);
    expect(pos).toEqual({ left: 232, top: 192 }); // top-right: right-8, top-8
  });

  it("never lets a badge clip past any page edge", () => {
    // Tiny element jammed into the very top-left corner.
    const rect = { left: 0, top: 0, right: 4, bottom: 4 };
    const pos = resolveBadgePosition(rect, view);
    expect(pos.left).toBeGreaterThanOrEqual(2);
    expect(pos.top).toBeGreaterThanOrEqual(2);
  });

  it("flips to a free corner when the default corner overlaps a placed badge", () => {
    const rect = { left: 400, top: 300, right: 500, bottom: 340 };
    // Occupy exactly where the top-left badge would land.
    const placed: BadgeBox[] = [{ left: 392, top: 292, width: 16, height: 16 }];
    const pos = resolveBadgePosition(rect, view, placed);
    expect(pos).not.toEqual({ left: 392, top: 292 });
    // Chosen corner must not overlap the occupied box.
    const clear = pos.left + 16 <= 392 || pos.left >= 408 || pos.top + 16 <= 292 || pos.top >= 308;
    expect(clear).toBe(true);
  });

  // Clamping is document-relative (scroll-independent): a badge tracks its
  // element and scrolls off-screen with it, instead of pinning to a viewport edge.
  describe("document-relative clamp (glued to the element, on the page)", () => {
    it("keeps a badge at its element's document position when the element scrolls off", () => {
      // Viewport scrolled 1000px down; the element sits at document top 300
      // (rect.top = 300 - 1000 = -700), fully above the viewport.
      const scrolled = { scrollX: 0, scrollY: 1000 };
      const rect = { left: 400, top: -700, right: 500, bottom: -660 };
      // Tracks the element (doc top 300 - 8), NOT the viewport top (~1002) that
      // the old viewport clamp forced.
      expect(resolveBadgePosition(rect, scrolled)).toEqual({ left: 392, top: 292 });
    });

    it("keeps an edge element's badge on the page regardless of scroll", () => {
      // Element flush at the document's top-left origin, viewport scrolled far away.
      const scrolled = { scrollX: 0, scrollY: 1000 };
      const rect = { left: 0, top: -1000, right: 40, bottom: -980 }; // doc origin (0,0,40,20)
      const pos = resolveBadgePosition(rect, scrolled);
      // Placed on the page (a visible corner), not clipped off the page origin.
      expect(pos.left).toBeGreaterThanOrEqual(2);
      expect(pos.top).toBeGreaterThanOrEqual(2);
    });
  });

  // With the viewport size known, a badge whose element has scrolled fully out of
  // view follows the element off-screen instead of the clamp pinning it to a page
  // edge. This is what stops scrolled-off badges piling up inside an inner scroll
  // container (window.scrollY stays 0 while rows scroll away).
  describe("off-screen guard (element outside the viewport)", () => {
    const sized = {
      scrollX: 0,
      scrollY: 0,
      docWidth: 1000,
      docHeight: 5000,
      viewWidth: 1000,
      viewHeight: 800,
    };

    it("leaves the badge at its raw off-screen corner when the element is above the fold", () => {
      // Row scrolled above an inner container: window unscrolled, rect fully above.
      const rect = { left: 400, top: -300, right: 900, bottom: -260 };
      // Raw top-left (no clamp to gutter): would be 392 / -308, off the top edge.
      expect(resolveBadgePosition(rect, sized)).toEqual({ left: 392, top: -308 });
    });

    it("does not pile an above-the-fold badge at the top gutter", () => {
      const rect = { left: 400, top: -300, right: 900, bottom: -260 };
      // The clamp would have forced top to the gutter (2); the guard must not.
      expect(resolveBadgePosition(rect, sized).top).toBeLessThan(0);
    });

    it("still clamps an on-screen edge element onto the page", () => {
      // Element flush at the document's left edge and in view: clamp keeps it visible.
      const rect = { left: 0, top: 200, right: 240, bottom: 240 };
      const pos = resolveBadgePosition(rect, sized);
      expect(pos.left).toBeGreaterThanOrEqual(2);
      expect(pos.top).toBeGreaterThanOrEqual(2);
    });

    it("keeps a partially-visible element's badge on a visible corner", () => {
      // Tall element straddling the top edge (top above the fold, bottom in view):
      // the solver flips to the bottom corner rather than off-screen.
      const rect = { left: 400, top: -100, right: 500, bottom: 300 };
      const pos = resolveBadgePosition(rect, sized);
      expect(pos.top).toBeGreaterThanOrEqual(2);
    });
  });

  it("respects scroll offsets (returns document-absolute coordinates)", () => {
    const scrolled = { scrollX: 0, scrollY: 1000 };
    const rect = { left: 400, top: 100, right: 500, bottom: 140 };
    expect(resolveBadgePosition(rect, scrolled)).toEqual({ left: 392, top: 1092 });
  });

  // A widened pill (2+ digit ordinal): width exceeds the 16px height. The corner
  // offset, the reserved box, and the edge clamps must all use the true width.
  describe("wide pill (multi-digit ordinal)", () => {
    it("with width == size behaves identically to the default (single-digit parity)", () => {
      const rect = { left: 400, top: 300, right: 500, bottom: 340 };
      expect(resolveBadgePosition(rect, view, [], { width: 16 })).toEqual(
        resolveBadgePosition(rect, view),
      );
    });

    it("centers the corner using width/2 on the horizontal axis, size/2 on the vertical", () => {
      const rect = { left: 400, top: 300, right: 500, bottom: 340 };
      // width 30 -> halfX 15 (left = 400-15); height stays 16 -> halfY 8 (top = 300-8).
      expect(resolveBadgePosition(rect, view, [], { width: 30 })).toEqual({ left: 385, top: 292 });
    });

    it("reserves the full pill width when dodging a placed badge", () => {
      const rect = { left: 400, top: 300, right: 500, bottom: 340 };
      // Occupy the top-left pill's spot (left 385, width 30). The solver must flip.
      const placed: BadgeBox[] = [{ left: 385, top: 292, width: 30, height: 16 }];
      const pos = resolveBadgePosition(rect, view, placed, { width: 30 });
      expect(pos).not.toEqual({ left: 385, top: 292 });
      // Chosen corner's full-width box must not overlap the occupied one.
      const clear =
        pos.left + 30 <= 385 || pos.left >= 385 + 30 || pos.top + 16 <= 292 || pos.top >= 292 + 16;
      expect(clear).toBe(true);
    });

    it("keeps a wide pill on the page against the right edge (clamps by width, not size)", () => {
      // Element flush at the document's right edge (docWidth 1000). A 30px-wide
      // pill must stay within the page: its right edge clamps to docWidth-gutter.
      const rect = { left: 760, top: 200, right: 1000, bottom: 240 };
      const pos = resolveBadgePosition(rect, view, [], { width: 30 });
      expect(pos.left + 30).toBeLessThanOrEqual(1000 - 2);
      expect(pos.left).toBeGreaterThanOrEqual(2);
    });
  });
});
