import { describe, expect, it } from "vitest";
import { clusterBoxes } from "../../src/detect/cluster.js";
import type { Rect } from "../../src/detect/path-bbox.js";

const r = (startX: number, startY: number, endX: number, endY: number): Rect => ({
  startX,
  startY,
  endX,
  endY,
});

describe("clusterBoxes", () => {
  it("merges overlapping and near boxes into one", () => {
    const boxes = [r(0, 0, 20, 20), r(18, 0, 40, 20), r(41, 0, 60, 20)];
    const out = clusterBoxes(boxes, { gap: 4, minArea: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(r(0, 0, 60, 20));
  });

  it("keeps distant boxes separate", () => {
    const boxes = [r(0, 0, 20, 20), r(500, 500, 520, 520)];
    const out = clusterBoxes(boxes, { gap: 4, minArea: 1 });
    expect(out).toHaveLength(2);
  });

  it("drops sub-min-area slivers", () => {
    const boxes = [r(0, 0, 2, 2), r(100, 100, 160, 160)];
    const out = clusterBoxes(boxes, { gap: 4, minArea: 100 });
    expect(out).toHaveLength(1);
  });

  it("is stable under repeated adjacency (chain collapses to one)", () => {
    const boxes = Array.from({ length: 10 }, (_, i) => r(i * 10, 0, i * 10 + 12, 10));
    const out = clusterBoxes(boxes, { gap: 4, minArea: 1 });
    expect(out).toHaveLength(1);
  });
});
