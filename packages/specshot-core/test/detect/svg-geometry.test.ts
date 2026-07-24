import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { svgIntrinsicSize } from "../../src/detect/image-source.js";
import { detectFromSvg, parseSvgSafely } from "../../src/detect/svg-geometry.js";
import { parseMarkDoc } from "../../src/model/mark-doc.js";

// Resolve from the vitest root (the package directory) rather than
// import.meta.url: happy-dom's polyfilled URL breaks fileURLToPath on Windows.
const svgPath = join(process.cwd(), "test/fixtures/test.svg");
const svgText = readFileSync(svgPath, "utf-8");

const W = 1280;
const H = 972;

describe("parseSvgSafely", () => {
  it("parses a valid SVG and strips <script>", () => {
    const svg = parseSvgSafely(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>',
    );
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("script")).toBeNull();
  });
  it("strips on* event-handler attributes", () => {
    const svg = parseSvgSafely(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="x()" /></svg>',
    );
    expect(svg?.querySelector("rect")?.hasAttribute("onload")).toBe(false);
  });
});

describe("detectFromSvg on the real skill fixture (62 paths + 7 rects)", () => {
  const draft = detectFromSvg(svgText, W, H);

  it("collapses ~70 nodes into a workable element count (not per-path noise)", () => {
    expect(draft.length).toBeGreaterThanOrEqual(3);
    expect(draft.length).toBeLessThanOrEqual(40);
  });

  it("returns a valid MarkDoc numbered flat 1..N in reading order", () => {
    expect(parseMarkDoc(draft).ok).toBe(true);
    expect(draft.map((i) => i.itemNo)).toEqual(
      Array.from({ length: draft.length }, (_, i) => String(i + 1)),
    );
  });

  it("keeps every box within the image bounds and drops the full-canvas background", () => {
    const imageArea = W * H;
    for (const item of draft) {
      const { startX, startY, endX, endY } = item.position;
      expect(startX).toBeGreaterThanOrEqual(0);
      expect(startY).toBeGreaterThanOrEqual(0);
      expect(endX).toBeLessThanOrEqual(W);
      expect(endY).toBeLessThanOrEqual(H);
      const area = (endX - startX) * (endY - startY);
      expect(area).toBeLessThan(imageArea * 0.9);
    }
  });
});

describe("svgIntrinsicSize", () => {
  it("reads width/height from the fixture", () => {
    expect(svgIntrinsicSize(svgText)).toEqual({ width: 1280, height: 972 });
  });
});
