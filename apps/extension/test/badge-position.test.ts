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
});
