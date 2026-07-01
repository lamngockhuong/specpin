import { describe, expect, it } from "vitest";
import { scopeSpecs } from "../src/shared/surface-data.js";

const specs = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("scopeSpecs", () => {
  it("keeps only specs in the match set when scope is 'page'", () => {
    const matched = new Set(["a", "c"]);
    expect(scopeSpecs(specs, "page", matched).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list when the page pins none (empty match set)", () => {
    expect(scopeSpecs(specs, "page", new Set())).toEqual([]);
  });

  it("returns the full list when scope is 'all', ignoring the match set", () => {
    expect(scopeSpecs(specs, "all", new Set(["a"]))).toBe(specs);
  });

  it("falls back to the full list when the match set is unknown (null)", () => {
    // No content script could report matches: 'page' scope must not blank the list.
    expect(scopeSpecs(specs, "page", null)).toBe(specs);
    expect(scopeSpecs(specs, "all", null)).toBe(specs);
  });
});
