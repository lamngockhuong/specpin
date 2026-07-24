import { describe, expect, it } from "vitest";
import { parsePathBBox, pointsBBox } from "../../src/detect/path-bbox.js";

describe("parsePathBBox", () => {
  it("computes a bbox from absolute M/L commands", () => {
    expect(parsePathBBox("M10 20 L50 80 L30 40 Z")).toEqual({
      startX: 10,
      startY: 20,
      endX: 50,
      endY: 80,
    });
  });
  it("handles relative commands", () => {
    // M0 0 then l10 10 -> (10,10), then l-5 20 -> (5,30)
    expect(parsePathBBox("M0 0 l10 10 l-5 20")).toEqual({
      startX: 0,
      startY: 0,
      endX: 10,
      endY: 30,
    });
  });
  it("handles H and V", () => {
    expect(parsePathBBox("M5 5 H50 V40")).toEqual({ startX: 5, startY: 5, endX: 50, endY: 40 });
  });
  it("includes cubic bezier control points as extremes", () => {
    const b = parsePathBBox("M0 0 C10 100 90 100 100 0");
    expect(b).not.toBeNull();
    expect(b?.startX).toBe(0);
    expect(b?.endX).toBe(100);
    expect(b?.endY).toBe(100);
  });
  it("returns null for empty/garbage", () => {
    expect(parsePathBBox("")).toBeNull();
    expect(parsePathBBox("Z")).toBeNull();
  });
});

describe("pointsBBox", () => {
  it("bounds a polygon points list", () => {
    expect(pointsBBox("10,10 50,30 20,90")).toEqual({
      startX: 10,
      startY: 10,
      endX: 50,
      endY: 90,
    });
  });
  it("returns null when too few numbers", () => {
    expect(pointsBBox("10")).toBeNull();
  });
});
