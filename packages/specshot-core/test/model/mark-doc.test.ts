import { describe, expect, it } from "vitest";
import {
  ITEM_NO_PATTERN,
  isValidItemNo,
  type MarkDoc,
  parseMarkDoc,
  roundCoord,
  serializeMarkDoc,
  validateMarkDoc,
} from "../../src/model/mark-doc.js";

describe("ITEM_NO_PATTERN / isValidItemNo", () => {
  it("accepts valid hierarchical numbers up to depth 3", () => {
    for (const ok of ["1", "9", "10", "1.1", "6.10", "1.2.3", "12.34.56"]) {
      expect(ITEM_NO_PATTERN.test(ok)).toBe(true);
      expect(isValidItemNo(ok)).toBe(true);
    }
  });
  it("rejects depth 4, leading zeros, zero, and junk", () => {
    for (const bad of ["1.1.1.1", "0", "01", "1.0", "1.", ".1", "", "a", "1,2"]) {
      expect(isValidItemNo(bad)).toBe(false);
    }
  });
  it("trims surrounding whitespace before matching", () => {
    expect(isValidItemNo("  1.2  ")).toBe(true);
  });
});

describe("roundCoord", () => {
  it("rounds half-to-even, matching python int(round(v))", () => {
    // ties go to the even neighbour (banker's rounding), NOT half-up
    expect(roundCoord(0.5)).toBe(0);
    expect(roundCoord(1.5)).toBe(2);
    expect(roundCoord(2.5)).toBe(2);
    expect(roundCoord(3.5)).toBe(4);
    expect(roundCoord(-0.5)).toBe(0);
    expect(roundCoord(-1.5)).toBe(-2);
    // non-tie values round normally
    expect(roundCoord(1.4)).toBe(1);
    expect(roundCoord(10.6)).toBe(11);
    expect(roundCoord(10)).toBe(10);
  });
});

describe("parseMarkDoc", () => {
  it("parses a valid array doc", () => {
    const res = parseMarkDoc(
      '[{"itemNo":"1","position":{"startX":0,"startY":0,"endX":10,"endY":10}}]',
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(1);
  });

  it("accepts an object wrapper with an items array", () => {
    const res = parseMarkDoc({
      items: [{ itemNo: "1", position: { startX: 0, startY: 0, endX: 5, endY: 5 } }],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects object wrapper with items=null", () => {
    const res = parseMarkDoc({ items: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/array/);
  });

  it("rejects object wrapper with items=string (not array)", () => {
    const res = parseMarkDoc({ items: "not an array" });
    expect(res.ok).toBe(false);
  });

  it("rejects null input", () => {
    const res = parseMarkDoc(null);
    expect(res.ok).toBe(false);
  });

  it("rejects undefined input", () => {
    const res = parseMarkDoc(undefined);
    expect(res.ok).toBe(false);
  });

  it("parses an empty doc", () => {
    const res = parseMarkDoc("[]");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("rounds float coordinates to integers (half-to-even, python parity)", () => {
    const res = parseMarkDoc([
      { itemNo: "1", position: { startX: 0.5, startY: 1.4, endX: 10.6, endY: 20.5 } },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok)
      // 0.5→0 (even), 1.4→1, 10.6→11, 20.5→20 (even)
      expect(res.data[0]?.position).toEqual({ startX: 0, startY: 1, endX: 11, endY: 20 });
  });

  it("rejects a bad itemNo (depth 4)", () => {
    const res = parseMarkDoc([
      { itemNo: "1.1.1.1", position: { startX: 0, startY: 0, endX: 1, endY: 1 } },
    ]);
    expect(res.ok).toBe(false);
  });

  it("rejects leading-zero and zero itemNos", () => {
    expect(parseMarkDoc([{ itemNo: "01", position: p() }]).ok).toBe(false);
    expect(parseMarkDoc([{ itemNo: "0", position: p() }]).ok).toBe(false);
  });

  it("rejects inverted coordinates", () => {
    const res = parseMarkDoc([
      { itemNo: "1", position: { startX: 10, startY: 0, endX: 5, endY: 20 } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/startX <= endX/);
  });

  it("rejects duplicate itemNo", () => {
    const res = parseMarkDoc([
      { itemNo: "1", position: p() },
      { itemNo: "1", position: p() },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/Duplicate/);
  });

  it("rejects non-numeric / boolean coordinates", () => {
    expect(
      parseMarkDoc([{ itemNo: "1", position: { startX: true, startY: 0, endX: 1, endY: 1 } }]).ok,
    ).toBe(false);
    expect(
      parseMarkDoc([{ itemNo: "1", position: { startX: "0", startY: 0, endX: 1, endY: 1 } }]).ok,
    ).toBe(false);
  });

  it("allows zero-width or zero-height boxes (degenerate but valid)", () => {
    // startX == endX is allowed (zero width), same with Y
    expect(
      parseMarkDoc([{ itemNo: "1", position: { startX: 10, startY: 0, endX: 10, endY: 10 } }]).ok,
    ).toBe(true);
    expect(
      parseMarkDoc([{ itemNo: "1", position: { startX: 0, startY: 10, endX: 10, endY: 10 } }]).ok,
    ).toBe(true);
  });

  it("accepts negative coordinates", () => {
    const res = parseMarkDoc([
      { itemNo: "1", position: { startX: -10, startY: -20, endX: 0, endY: 5 } },
    ]);
    expect(res.ok).toBe(true);
  });

  it("rejects Infinity as a coordinate", () => {
    expect(
      parseMarkDoc([
        {
          itemNo: "1",
          position: { startX: Number.POSITIVE_INFINITY, startY: 0, endX: 1, endY: 1 },
        },
      ]).ok,
    ).toBe(false);
    expect(
      parseMarkDoc([
        {
          itemNo: "1",
          position: { startX: 0, startY: Number.NEGATIVE_INFINITY, endX: 1, endY: 1 },
        },
      ]).ok,
    ).toBe(false);
  });

  it("rejects NaN as a coordinate", () => {
    expect(
      parseMarkDoc([{ itemNo: "1", position: { startX: Number.NaN, startY: 0, endX: 1, endY: 1 } }])
        .ok,
    ).toBe(false);
  });

  it("rejects missing itemNo in an entry", () => {
    const res = parseMarkDoc([{ position: p() }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/missing a non-empty itemNo/);
  });

  it("rejects missing position object in an entry", () => {
    const res = parseMarkDoc([{ itemNo: "1" }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/missing a position/);
  });

  it("rejects label as non-string", () => {
    const res = parseMarkDoc([{ itemNo: "1", position: p(), label: 123 }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/label must be a string/);
  });

  it("collects multiple errors from a single invalid item", () => {
    const res = parseMarkDoc([
      { itemNo: "0", position: { startX: 10, startY: 0, endX: 5, endY: 10 } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid JSON text", () => {
    const res = parseMarkDoc("{not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/Invalid JSON/);
  });

  it("rejects a non-array, non-items value", () => {
    expect(parseMarkDoc('{"foo":1}').ok).toBe(false);
  });

  it("keeps an optional label", () => {
    const res = parseMarkDoc([{ itemNo: "1", position: p(), label: "Login button" }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]?.label).toBe("Login button");
  });

  it("preserves labels with special characters", () => {
    const res = parseMarkDoc([{ itemNo: "1", position: p(), label: 'Nút "Đăng nhập"' }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]?.label).toBe('Nút "Đăng nhập"');
  });
});

describe("serializeMarkDoc + round-trip", () => {
  it("round-trips a doc identically", () => {
    const doc: MarkDoc = [
      { itemNo: "1", position: { startX: 0, startY: 0, endX: 100, endY: 50 } },
      { itemNo: "1.1", position: { startX: 5, startY: 5, endX: 40, endY: 40 }, label: "x" },
    ];
    const json = serializeMarkDoc(doc);
    const res = parseMarkDoc(json);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(doc);
  });

  it("omits empty-string labels on serialize", () => {
    const json = serializeMarkDoc([{ itemNo: "1", position: p(), label: "" }]);
    expect(json).not.toMatch(/label/);
  });

  it("emits keys in the skill order (itemNo before position)", () => {
    const json = serializeMarkDoc([{ itemNo: "1", position: p() }]);
    expect(json.indexOf("itemNo")).toBeLessThan(json.indexOf("position"));
  });
});

describe("validateMarkDoc", () => {
  it("returns empty errors for a valid doc", () => {
    expect(validateMarkDoc([{ itemNo: "1", position: p() }])).toEqual([]);
  });
  it("returns errors for an invalid doc", () => {
    expect(validateMarkDoc([{ itemNo: "0", position: p() }]).length).toBeGreaterThan(0);
  });
});

function p() {
  return { startX: 0, startY: 0, endX: 10, endY: 10 };
}
