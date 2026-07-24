import { describe, expect, it } from "vitest";
import { markDocToSvg } from "../../src/export/to-svg.js";
import type { MarkDoc } from "../../src/model/mark-doc.js";

const doc: MarkDoc = [
  { itemNo: "1", position: { startX: 10, startY: 40, endX: 100, endY: 80 } },
  { itemNo: "6.10", position: { startX: 0, startY: 0, endX: 30, endY: 20 } },
];

describe("markDocToSvg", () => {
  const svg = markDocToSvg(doc, "data:image/png;base64,AAAA", 1280, 972);

  it("produces a well-formed, self-contained SVG root with the embedded image", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 1280 972"');
    expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("draws a rect + label per mark", () => {
    expect((svg.match(/<rect /g) ?? []).length).toBe(4); // 1 box + 1 label bg per mark
    expect((svg.match(/<text /g) ?? []).length).toBe(2);
    expect(svg).toContain(">6.10<");
  });

  it("parses back into a real SVG DOM (renders standalone)", () => {
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelectorAll("rect").length).toBe(4);
  });
});
