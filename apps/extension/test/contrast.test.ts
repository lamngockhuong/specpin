import { describe, expect, it } from "vitest";
import { isValidBadgeColor, readableGlyph, relativeLuminance } from "../src/shared/contrast.js";

const DARK_INK = "#04221E";
const WHITE = "#FFFFFF";

describe("isValidBadgeColor", () => {
  it("accepts a 6-digit hex (either case)", () => {
    expect(isValidBadgeColor("#2DD4BF")).toBe(true);
    expect(isValidBadgeColor("#ffffff")).toBe(true);
  });

  it("rejects non-hex, wrong length, and non-strings", () => {
    expect(isValidBadgeColor("red")).toBe(false);
    expect(isValidBadgeColor("#FFF")).toBe(false);
    expect(isValidBadgeColor("2DD4BF")).toBe(false);
    expect(isValidBadgeColor(null)).toBe(false);
    expect(isValidBadgeColor(undefined)).toBe(false);
    expect(isValidBadgeColor(123)).toBe(false);
  });
});

describe("readableGlyph", () => {
  it("uses dark ink on light backgrounds", () => {
    expect(readableGlyph("#FFFFFF")).toBe(DARK_INK);
    expect(readableGlyph("#FFD400")).toBe(DARK_INK); // bright yellow
    expect(readableGlyph("#2DD4BF")).toBe(DARK_INK); // brand teal (light)
  });

  it("uses white on dark backgrounds", () => {
    expect(readableGlyph("#000000")).toBe(WHITE);
    expect(readableGlyph("#1E3A8A")).toBe(WHITE); // deep blue
    expect(readableGlyph("#B8232C")).toBe(WHITE); // editorial red
  });
});

describe("relativeLuminance", () => {
  it("spans black (0) to white (1)", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("returns 0 for a malformed input (guard)", () => {
    expect(relativeLuminance("nope")).toBe(0);
  });
});
