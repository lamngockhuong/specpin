import { describe, expect, it } from "vitest";
import {
  clampScale,
  fitToContainer,
  imageLenToScreen,
  imageToScreen,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  screenToImage,
  type Viewport,
  zoomAt,
} from "../../src/canvas/viewport.js";

const vps: Viewport[] = [
  { scale: 1, offsetX: 0, offsetY: 0 },
  { scale: 2, offsetX: 30, offsetY: -15 },
  { scale: 0.5, offsetX: -100, offsetY: 250 },
  { scale: 3.75, offsetX: 12.5, offsetY: 7.25 },
];

const pts = [
  { x: 0, y: 0 },
  { x: 10, y: 20 },
  { x: 1280, y: 972 },
  { x: 637.5, y: 111.25 },
];

describe("viewport round-trip", () => {
  it("screenToImage(imageToScreen(p)) ≈ p across scales/offsets", () => {
    for (const vp of vps) {
      for (const p of pts) {
        const back = screenToImage(vp, imageToScreen(vp, p));
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });
});

describe("imageToScreen", () => {
  it("applies scale then offset", () => {
    expect(imageToScreen({ scale: 2, offsetX: 5, offsetY: 10 }, { x: 3, y: 4 })).toEqual({
      x: 11,
      y: 18,
    });
  });
  it("handles scale < 1 (zoom out)", () => {
    const result = imageToScreen({ scale: 0.5, offsetX: 0, offsetY: 0 }, { x: 100, y: 100 });
    expect(result).toEqual({ x: 50, y: 50 });
  });
  it("handles negative offsets", () => {
    const result = imageToScreen({ scale: 1, offsetX: -50, offsetY: -100 }, { x: 100, y: 100 });
    expect(result).toEqual({ x: 50, y: 0 });
  });
  it("handles origin (0,0)", () => {
    const result = imageToScreen({ scale: 2, offsetX: 10, offsetY: 20 }, { x: 0, y: 0 });
    expect(result).toEqual({ x: 10, y: 20 });
  });
});

describe("imageLenToScreen", () => {
  it("scales a length", () => {
    expect(imageLenToScreen({ scale: 2, offsetX: 99, offsetY: 99 }, 10)).toBe(20);
  });
});

describe("zoomAt", () => {
  it("keeps the image point under the anchor fixed", () => {
    const vp: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    const anchor = { x: 100, y: 80 };
    const before = screenToImage(vp, anchor);
    const zoomed = zoomAt(vp, anchor, 2);
    const after = screenToImage(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBe(2);
  });
  it("clamps scale to bounds", () => {
    const vp: Viewport = { scale: MAX_SCALE, offsetX: 0, offsetY: 0 };
    expect(zoomAt(vp, { x: 0, y: 0 }, 10).scale).toBe(MAX_SCALE);
    const vp2: Viewport = { scale: MIN_SCALE, offsetX: 0, offsetY: 0 };
    expect(zoomAt(vp2, { x: 0, y: 0 }, 0.01).scale).toBe(MIN_SCALE);
  });
  it("handles zoom out (factor < 1)", () => {
    const vp: Viewport = { scale: 2, offsetX: 0, offsetY: 0 };
    const anchor = { x: 100, y: 100 };
    const before = screenToImage(vp, anchor);
    const zoomed = zoomAt(vp, anchor, 0.5); // zoom out to 1x
    const after = screenToImage(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBe(1);
  });
  it("handles zoom at viewport origin (0,0)", () => {
    const vp: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    const anchor = { x: 0, y: 0 };
    const before = screenToImage(vp, anchor);
    const zoomed = zoomAt(vp, anchor, 2);
    const after = screenToImage(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
  it("preserves anchor invariant with large offsets", () => {
    const vp: Viewport = { scale: 1, offsetX: 500, offsetY: -200 };
    const anchor = { x: 600, y: 100 };
    const before = screenToImage(vp, anchor);
    const zoomed = zoomAt(vp, anchor, 3);
    const after = screenToImage(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe("panBy", () => {
  it("shifts offsets and preserves scale", () => {
    expect(panBy({ scale: 2, offsetX: 5, offsetY: 5 }, 10, -3)).toEqual({
      scale: 2,
      offsetX: 15,
      offsetY: 2,
    });
  });
  it("handles large positive offsets", () => {
    const vp = panBy({ scale: 1, offsetX: 0, offsetY: 0 }, 1000, 1000);
    expect(vp.offsetX).toBe(1000);
    expect(vp.offsetY).toBe(1000);
  });
  it("handles large negative offsets", () => {
    const vp = panBy({ scale: 1, offsetX: 0, offsetY: 0 }, -500, -500);
    expect(vp.offsetX).toBe(-500);
    expect(vp.offsetY).toBe(-500);
  });
  it("preserves scale through panning", () => {
    const vp = { scale: 3.5, offsetX: 10, offsetY: 20 };
    const panned = panBy(vp, 100, -50);
    expect(panned.scale).toBe(3.5);
  });
});

describe("clampScale", () => {
  it("bounds the scale", () => {
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
  });
});

describe("fitToContainer", () => {
  it("centers and fits within padding, never above 1x", () => {
    const vp = fitToContainer(1280, 972, 800, 600, 20);
    expect(vp.scale).toBeLessThanOrEqual(1);
    // image should be centered: equal margins
    const right = vp.offsetX + 1280 * vp.scale;
    expect(vp.offsetX).toBeCloseTo(800 - right, 6);
  });
  it("handles a zero-size image gracefully", () => {
    expect(fitToContainer(0, 0, 800, 600)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
  it("handles negative image dimensions (clamps to default)", () => {
    expect(fitToContainer(-100, 100, 800, 600)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(fitToContainer(100, -100, 800, 600)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
  it("fits a portrait image (tall, narrow)", () => {
    const vp = fitToContainer(400, 800, 1000, 600, 20);
    expect(vp.scale).toBeLessThanOrEqual(1);
    expect(vp.scale).toBeGreaterThan(0);
    // Image fits within container
    const fittedHeight = 800 * vp.scale;
    expect(fittedHeight).toBeLessThanOrEqual(600);
  });
  it("fits a landscape image (wide, short)", () => {
    const vp = fitToContainer(1600, 300, 1000, 600, 20);
    expect(vp.scale).toBeLessThanOrEqual(1);
    expect(vp.scale).toBeGreaterThan(0);
    const fittedWidth = 1600 * vp.scale;
    expect(fittedWidth).toBeLessThanOrEqual(1000);
  });
  it("handles very small container with large padding", () => {
    const vp = fitToContainer(500, 500, 100, 100, 80);
    // Available space: max(1, 100 - 160) = 1
    expect(vp.scale).toBeLessThanOrEqual(1);
    expect(vp.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });
  it("centers image horizontally and vertically", () => {
    const vp = fitToContainer(400, 400, 800, 800, 0);
    // Scale clamped to max 1x (never upscales). Image fits at 1x.
    expect(vp.scale).toBe(1);
    // Offsets should center: (800 - 400*1) / 2 = 200
    expect(vp.offsetX).toBeCloseTo(200, 1);
    expect(vp.offsetY).toBeCloseTo(200, 1);
  });
});
