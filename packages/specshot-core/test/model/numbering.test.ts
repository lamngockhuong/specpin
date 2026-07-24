import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type MarkDoc, parseMarkDoc } from "../../src/model/mark-doc.js";
import {
  compareItemNo,
  contains,
  nextItemNo,
  readingOrderSort,
  reindexFlat,
  reindexHierarchical,
} from "../../src/model/numbering.js";

// Resolve from the vitest root (the package directory) rather than
// import.meta.url: happy-dom's polyfilled URL breaks fileURLToPath on Windows.
const fixturePath = join(process.cwd(), "test/fixtures/test-ui-item-bboxes.json");
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf-8"));

const doc = (): MarkDoc => {
  const res = parseMarkDoc(fixture);
  if (!res.ok) throw new Error(`fixture invalid: ${res.errors.join()}`);
  return res.data;
};

const box = (itemNo: string, x: number, y: number, w = 20, h = 20) => ({
  itemNo,
  position: { startX: x, startY: y, endX: x + w, endY: y + h },
});

describe("compareItemNo", () => {
  it("orders 6.10 after 6.9 numerically", () => {
    const sorted = ["6.10", "6.2", "6.1", "6.9"].sort(compareItemNo);
    expect(sorted).toEqual(["6.1", "6.2", "6.9", "6.10"]);
  });
  it("orders a parent before its children", () => {
    expect(compareItemNo("6", "6.1")).toBeLessThan(0);
    expect(compareItemNo("2", "1.1")).toBeGreaterThan(0);
  });
  it("returns 0 for identical itemNos", () => {
    expect(compareItemNo("6.10", "6.10")).toBe(0);
    expect(compareItemNo("1", "1")).toBe(0);
  });
  it("orders at depth 3 correctly", () => {
    const sorted = ["1.1.1", "1.1.2", "1.2.1", "2.1.1"].sort(compareItemNo);
    expect(sorted).toEqual(["1.1.1", "1.1.2", "1.2.1", "2.1.1"]);
  });
});

describe("readingOrderSort", () => {
  it("sorts top→bottom then left→right within a band", () => {
    const items = [box("a", 100, 10), box("b", 10, 12), box("c", 10, 200)];
    const order = readingOrderSort(items).map((i) => i.itemNo);
    expect(order).toEqual(["b", "a", "c"]);
  });
});

describe("nextItemNo", () => {
  it("returns 1 for an empty doc", () => {
    expect(nextItemNo([])).toBe("1");
  });
  it("returns one past the max top-level integer", () => {
    expect(nextItemNo([box("1", 0, 0), box("6.3", 0, 0), box("3", 0, 0)])).toBe("7");
  });
});

describe("reindexFlat", () => {
  it("numbers 1..N in reading order and preserves labels", () => {
    const items = [
      { ...box("9", 10, 200), label: "bottom" },
      { ...box("5", 10, 10), label: "top" },
    ];
    const out = reindexFlat(items);
    expect(out.map((i) => i.itemNo)).toEqual(["1", "2"]);
    expect(out[0]?.label).toBe("top");
    expect(out[1]?.label).toBe("bottom");
  });
  it("produces a valid doc from the real fixture", () => {
    const out = reindexFlat(doc());
    expect(out.map((i) => i.itemNo)).toEqual(
      Array.from({ length: out.length }, (_, i) => String(i + 1)),
    );
    expect(parseMarkDoc(out).ok).toBe(true);
  });
});

describe("contains", () => {
  it("detects a child mostly inside a strictly larger parent", () => {
    const parent = { startX: 0, startY: 0, endX: 100, endY: 100 };
    const child = { startX: 10, startY: 10, endX: 40, endY: 40 };
    expect(contains(parent, child)).toBe(true);
  });
  it("rejects equal-size boxes", () => {
    const a = { startX: 0, startY: 0, endX: 100, endY: 100 };
    expect(contains(a, { ...a })).toBe(false);
  });
  it("rejects child partially outside parent", () => {
    const parent = { startX: 0, startY: 0, endX: 100, endY: 100 };
    const child = { startX: 50, startY: 50, endX: 150, endY: 150 };
    expect(contains(parent, child)).toBe(false);
  });
  it("respects custom ratio threshold", () => {
    const parent = { startX: 0, startY: 0, endX: 100, endY: 100 };
    const child = { startX: 0, startY: 0, endX: 100, endY: 100 }; // 100% = 10000 area
    expect(contains(parent, child, 0.5)).toBe(false); // parent must be strictly larger
  });
  it("rejects zero-area child boxes", () => {
    const parent = { startX: 0, startY: 0, endX: 100, endY: 100 };
    const child = { startX: 10, startY: 10, endX: 10, endY: 10 };
    expect(contains(parent, child)).toBe(false);
  });
  it("rejects zero-area parent boxes", () => {
    const parent = { startX: 0, startY: 0, endX: 0, endY: 0 };
    const child = { startX: -1, startY: -1, endX: 1, endY: 1 };
    expect(contains(parent, child)).toBe(false);
  });
  it("correctly handles child at boundary (exactly 80% overlap)", () => {
    // Parent: 0–100, area 10000. Child with 8000 area (80%) should be contained.
    const parent = { startX: 0, startY: 0, endX: 100, endY: 100 };
    // Child from 0–100 on x, 0–80 on y = 8000 area (80% of parent 10000)
    const child = { startX: 0, startY: 0, endX: 100, endY: 80 };
    expect(contains(parent, child)).toBe(true);
  });
});

describe("reindexHierarchical", () => {
  it("nests children under a containing parent", () => {
    const items = [
      box("x", 0, 0, 200, 200), // container
      box("y", 10, 10, 30, 30), // inside
      box("z", 50, 10, 30, 30), // inside
      box("w", 400, 0, 20, 20), // outside
    ];
    const out = reindexHierarchical(items);
    const byOriginal = (startX: number) => {
      const found = out.find((i) => i.position.startX === startX);
      if (!found) throw new Error(`no item at startX=${startX}`);
      return found;
    };
    expect(byOriginal(0).itemNo).toBe("1"); // container
    expect(byOriginal(10).itemNo).toBe("1.1");
    expect(byOriginal(50).itemNo).toBe("1.2");
    expect(byOriginal(400).itemNo).toBe("2");
  });

  it("keeps the doc valid (unique itemNos, ≤ depth 3) on the real fixture", () => {
    const out = reindexHierarchical(doc());
    const res = parseMarkDoc(out);
    expect(res.ok).toBe(true);
    const nos = out.map((i) => i.itemNo);
    expect(new Set(nos).size).toBe(nos.length);
    for (const n of nos) expect(n.split(".").length).toBeLessThanOrEqual(3);
  });

  it("caps depth at 3 for deeply nested containment", () => {
    const items = [
      box("a", 0, 0, 400, 400),
      box("b", 10, 10, 300, 300),
      box("c", 20, 20, 200, 200),
      box("d", 30, 30, 100, 100),
      box("e", 40, 40, 50, 50),
    ];
    const out = reindexHierarchical(items);
    const nos = out.map((i) => i.itemNo);
    expect(new Set(nos).size).toBe(nos.length);
    for (const n of nos) expect(n.split(".").length).toBeLessThanOrEqual(3);
  });

  it("generates unique numbers for multiple depth-3 children under same parent", () => {
    // Create a structure: level1 > level2 > [level3a, level3b, level3c]
    const items = [
      box("l1", 0, 0, 400, 400),
      box("l2", 10, 10, 300, 300),
      box("l3a", 20, 20, 100, 100),
      box("l3b", 120, 20, 100, 100),
      box("l3c", 220, 20, 100, 100),
    ];
    const out = reindexHierarchical(items);
    const nos = out.map((i) => i.itemNo);
    // Should generate something like: 1, 1.1, 1.1.1, 1.1.2, 1.1.3
    expect(new Set(nos).size).toBe(nos.length); // all unique
    // At least some should be at depth 3
    expect(nos.some((n) => n.split(".").length === 3)).toBe(true);
  });

  it("enforces uniqueness across all reindex depth-capped siblings", () => {
    // Very deep nesting: 6+ levels all should be capped and still unique
    const items = [
      box("l1", 0, 0, 600, 600),
      box("l2", 10, 10, 550, 550),
      box("l3", 20, 20, 500, 500),
      box("l4", 30, 30, 450, 450),
      box("l5", 40, 40, 400, 400),
      box("l6", 50, 50, 350, 350),
    ];
    const out = reindexHierarchical(items);
    const nos = out.map((i) => i.itemNo);
    expect(new Set(nos).size).toBe(nos.length);
    for (const n of nos) expect(n.split(".").length).toBeLessThanOrEqual(3);
  });

  it("handles overlapping non-containing boxes correctly", () => {
    // Two boxes that overlap but don't contain each other should both be roots
    const items = [
      box("a", 0, 0, 100, 100),
      box("b", 50, 50, 150, 150), // overlaps a but doesn't contain it and isn't contained
    ];
    const out = reindexHierarchical(items);
    const nos = out.map((i) => i.itemNo);
    expect(nos).toContain("1");
    expect(nos).toContain("2");
  });

  it("maintains label during hierarchical reindexing", () => {
    const items = [
      { ...box("a", 0, 0, 200, 200), label: "Container" },
      { ...box("b", 10, 10, 50, 50), label: "Child" },
    ];
    const out = reindexHierarchical(items);
    const withLabel = out.find((i) => i.label === "Child");
    expect(withLabel?.itemNo).toBe("1.1");
  });
});
