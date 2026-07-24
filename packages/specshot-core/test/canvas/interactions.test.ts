import { describe, expect, it } from "vitest";
import {
  applyDrag,
  applyResize,
  boxFromPoints,
  clampToImage,
  defaultBoxAt,
  normalize,
} from "../../src/canvas/interactions.js";

const pos = { startX: 10, startY: 20, endX: 60, endY: 80 };

describe("normalize", () => {
  it("orders corners so start <= end", () => {
    expect(normalize({ startX: 60, startY: 80, endX: 10, endY: 20 })).toEqual({
      startX: 10,
      startY: 20,
      endX: 60,
      endY: 80,
    });
  });
});

describe("applyDrag", () => {
  it("shifts all corners by the delta", () => {
    expect(applyDrag(pos, 5, -10)).toEqual({ startX: 15, startY: 10, endX: 65, endY: 70 });
  });
});

describe("applyResize", () => {
  it("moves only the handled edges", () => {
    expect(applyResize(pos, "se", { x: 100, y: 100 })).toEqual({
      startX: 10,
      startY: 20,
      endX: 100,
      endY: 100,
    });
    expect(applyResize(pos, "nw", { x: 0, y: 0 })).toEqual({
      startX: 0,
      startY: 0,
      endX: 60,
      endY: 80,
    });
  });
  it("flips (normalizes) when dragged past the opposite edge", () => {
    const r = applyResize(pos, "e", { x: 0, y: 0 });
    expect(r.startX).toBeLessThanOrEqual(r.endX);
  });
});

describe("boxFromPoints", () => {
  it("builds a normalized box regardless of point order", () => {
    expect(boxFromPoints({ x: 50, y: 50 }, { x: 10, y: 10 })).toEqual({
      startX: 10,
      startY: 10,
      endX: 50,
      endY: 50,
    });
  });
});

describe("defaultBoxAt", () => {
  it("centers a square box on the point", () => {
    const b = defaultBoxAt({ x: 100, y: 100 }, 40);
    expect(b).toEqual({ startX: 80, startY: 80, endX: 120, endY: 120 });
  });
});

describe("clampToImage", () => {
  it("keeps a box inside the image, preserving size when it fits", () => {
    const b = clampToImage({ startX: -10, startY: -10, endX: 40, endY: 40 }, 200, 200);
    expect(b).toEqual({ startX: 0, startY: 0, endX: 50, endY: 50 });
  });
  it("clamps the far edge to the image bound", () => {
    const b = clampToImage({ startX: 180, startY: 180, endX: 260, endY: 260 }, 200, 200);
    expect(b.endX).toBeLessThanOrEqual(200);
    expect(b.endY).toBeLessThanOrEqual(200);
  });
  it("handles box entirely outside image (left/top) by moving it to the corner", () => {
    // Box width=90, height=90 positioned at -100,-100. Clamped to 0,0 with size preserved.
    const b = clampToImage({ startX: -100, startY: -100, endX: -10, endY: -10 }, 200, 200);
    expect(b.startX).toBe(0);
    expect(b.startY).toBe(0);
    // Width/height preserved: 90
    expect(b.endX - b.startX).toBe(90);
    expect(b.endY - b.startY).toBe(90);
  });
  it("handles box entirely outside image (right/bottom) by repositioning near boundary", () => {
    // Box width=90, height=90 positioned at 210,210. Clamped to fit within 200x200.
    const b = clampToImage({ startX: 210, startY: 210, endX: 300, endY: 300 }, 200, 200);
    // Width/height preserved: 90
    expect(b.endX - b.startX).toBe(90);
    expect(b.endY - b.startY).toBe(90);
    // But constrained within bounds
    expect(b.endX).toBeLessThanOrEqual(200);
    expect(b.endY).toBeLessThanOrEqual(200);
  });
  it("handles box perfectly on image boundary", () => {
    const b = clampToImage({ startX: 0, startY: 0, endX: 200, endY: 200 }, 200, 200);
    expect(b).toEqual({ startX: 0, startY: 0, endX: 200, endY: 200 });
  });
});

describe("normalize (edge cases)", () => {
  it("handles equal start and end (degenerate box)", () => {
    expect(normalize({ startX: 50, startY: 50, endX: 50, endY: 50 })).toEqual({
      startX: 50,
      startY: 50,
      endX: 50,
      endY: 50,
    });
  });
  it("handles negative coordinates", () => {
    expect(normalize({ startX: -100, startY: -200, endX: -10, endY: -20 })).toEqual({
      startX: -100,
      startY: -200,
      endX: -10,
      endY: -20,
    });
  });
  it("flips inverted x coordinates", () => {
    expect(normalize({ startX: 100, startY: 10, endX: 20, endY: 30 })).toEqual({
      startX: 20,
      startY: 10,
      endX: 100,
      endY: 30,
    });
  });
});

describe("defaultBoxAt (edge cases)", () => {
  it("handles sizing at origin", () => {
    const b = defaultBoxAt({ x: 0, y: 0 }, 50);
    expect(b.startX).toBe(-25);
    expect(b.startY).toBe(-25);
    expect(b.endX).toBe(25);
    expect(b.endY).toBe(25);
  });
  it("handles different sizes", () => {
    const b1 = defaultBoxAt({ x: 100, y: 100 }, 10);
    const b2 = defaultBoxAt({ x: 100, y: 100 }, 20);
    const size1 = (b1.endX - b1.startX) * (b1.endY - b1.startY);
    const size2 = (b2.endX - b2.startX) * (b2.endY - b2.startY);
    expect(size2).toBeGreaterThan(size1);
  });
});
