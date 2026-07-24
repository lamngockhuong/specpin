import { describe, expect, it } from "vitest";
import type { MarkDoc } from "../../src/model/mark-doc.js";
import { marksReducer } from "../../src/state/marks-reducer.js";

const base: MarkDoc = [
  { itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 } },
  { itemNo: "2", position: { startX: 20, startY: 20, endX: 30, endY: 30 } },
];

describe("marksReducer", () => {
  it("add appends with the next top-level number", () => {
    const out = marksReducer(base, {
      type: "add",
      position: { startX: 5, startY: 5, endX: 8, endY: 8 },
    });
    expect(out).toHaveLength(3);
    expect(out[2]?.itemNo).toBe("3");
  });

  it("move/resize replaces the position of one item", () => {
    const moved = marksReducer(base, {
      type: "move",
      itemNo: "1",
      position: { startX: 100, startY: 100, endX: 110, endY: 110 },
    });
    expect(moved[0]?.position.startX).toBe(100);
    expect(moved[1]).toEqual(base[1]);
  });

  it("delete removes the item", () => {
    expect(marksReducer(base, { type: "delete", itemNo: "1" })).toHaveLength(1);
  });

  it("setLabel sets a label", () => {
    expect(marksReducer(base, { type: "setLabel", itemNo: "2", label: "x" })[1]?.label).toBe("x");
  });

  it("setLabel with empty string clears the label", () => {
    const withLabel = [
      { itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 }, label: "old" },
    ];
    const cleared = marksReducer(withLabel, { type: "setLabel", itemNo: "1", label: "" });
    expect(cleared[0]?.label).toBe("");
  });

  it("setLabel on non-existent item is a no-op", () => {
    const out = marksReducer(base, { type: "setLabel", itemNo: "999", label: "x" });
    expect(out).toEqual(base);
  });

  it("setItemNo renames unless it collides", () => {
    expect(marksReducer(base, { type: "setItemNo", itemNo: "1", next: "5" })[0]?.itemNo).toBe("5");
    // collision → no-op
    expect(marksReducer(base, { type: "setItemNo", itemNo: "1", next: "2" })).toEqual(base);
  });

  it("setItemNo on non-existent item is a no-op", () => {
    const out = marksReducer(base, { type: "setItemNo", itemNo: "999", next: "5" });
    expect(out).toEqual(base);
  });

  it("setDoc replaces the whole doc", () => {
    expect(marksReducer(base, { type: "setDoc", doc: [] })).toEqual([]);
  });

  it("setDoc with new items preserves all data", () => {
    const newDoc: MarkDoc = [
      { itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 }, label: "New" },
    ];
    const out = marksReducer(base, { type: "setDoc", doc: newDoc });
    expect(out).toEqual(newDoc);
  });

  it("move on non-existent item is a no-op", () => {
    const out = marksReducer(base, {
      type: "move",
      itemNo: "999",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 },
    });
    expect(out).toEqual(base);
  });

  it("delete on non-existent item is a no-op", () => {
    const out = marksReducer(base, { type: "delete", itemNo: "999" });
    expect(out).toEqual(base);
  });

  it("add with hierarchical itemNo gets the next flat number", () => {
    const hierarchical: MarkDoc = [
      { itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 } },
      { itemNo: "1.1", position: { startX: 5, startY: 5, endX: 8, endY: 8 } },
      { itemNo: "5.2.1", position: { startX: 15, startY: 15, endX: 25, endY: 25 } },
    ];
    const out = marksReducer(hierarchical, {
      type: "add",
      position: { startX: 30, startY: 30, endX: 40, endY: 40 },
    });
    expect(out[3]?.itemNo).toBe("6");
  });
});
