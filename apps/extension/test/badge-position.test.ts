import { describe, expect, it } from "vitest";
import { type BadgeBox, resolveBadgePosition } from "../src/renderers/badge-position.js";

// A 1000x800 viewport, unscrolled, unless a test overrides it.
const view = { scrollX: 0, scrollY: 0, innerWidth: 1000, innerHeight: 800 };

// Badge is 16px, centered on a corner (±8 overhang); gutter is 2px.
describe("resolveBadgePosition", () => {
  it("keeps the top-left corner for a mid-screen element (no regression)", () => {
    const rect = { left: 400, top: 300, right: 500, bottom: 340 };
    expect(resolveBadgePosition(rect, view)).toEqual({ left: 392, top: 292 });
  });

  it("flips off the clipped left/top edge instead of going off-screen", () => {
    // Element flush against the viewport's left edge (like a left nav item).
    const rect = { left: 0, top: 200, right: 240, bottom: 240 };
    const pos = resolveBadgePosition(rect, view);
    // Top-left would be -8 (off-screen); solver flips to the right corner.
    expect(pos.left).toBeGreaterThanOrEqual(2);
    expect(pos.left + 16).toBeLessThanOrEqual(1000 - 2);
    expect(pos).toEqual({ left: 232, top: 192 }); // top-right: right-8, top-8
  });

  it("never lets a badge clip past any viewport edge", () => {
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

  it("respects scroll offsets (returns document-absolute coordinates)", () => {
    const scrolled = { scrollX: 0, scrollY: 1000, innerWidth: 1000, innerHeight: 800 };
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

    it("keeps a wide pill on-screen against the right edge (clamps by width, not size)", () => {
      // Element flush against the right edge; the top-right corner would push a
      // 30px-wide pill off-screen, so the left must clamp to innerWidth-width-gutter.
      const rect = { left: 760, top: 200, right: 1000, bottom: 240 };
      const pos = resolveBadgePosition(rect, view, [], { width: 30 });
      expect(pos.left + 30).toBeLessThanOrEqual(1000 - 2);
      expect(pos.left).toBeGreaterThanOrEqual(2);
    });
  });
});
