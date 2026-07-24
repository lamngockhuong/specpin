import { describe, expect, it } from "vitest";
import {
  editorReducer,
  initialEditorState,
  itemNoSpecIdMap,
  unresolvedCount,
} from "../../src/state/editor-store.js";

describe("editorReducer", () => {
  it("assigns itemNos via core numbering when adding boxes", () => {
    const s1 = editorReducer(initialEditorState, {
      type: "add",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 },
    });
    const s2 = editorReducer(s1, {
      type: "add",
      position: { startX: 20, startY: 20, endX: 30, endY: 30 },
    });
    expect(s2.doc.map((it) => it.itemNo)).toEqual(["1", "2"]);
    // Every added item gets a distinct host key.
    expect(s2.doc[0]?._key).toBeTruthy();
    expect(s2.doc[0]?._key).not.toEqual(s2.doc[1]?._key);
  });

  it("keeps the itemNo -> specId association correct across a reindex", () => {
    // Two boxes, added in an order that a reading-order reindex will flip:
    // box A is added first (bottom) but sits ABOVE box B (top) on screen.
    let state = editorReducer(initialEditorState, {
      type: "add",
      position: { startX: 0, startY: 100, endX: 10, endY: 110 }, // itemNo "1", visually lower
    });
    state = editorReducer(state, {
      type: "add",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 }, // itemNo "2", visually higher
    });

    // Link itemNo "1" (the lower box) to spec "spec-lower" and itemNo "2"
    // (the higher box) to "spec-upper" BEFORE reindexing.
    state = editorReducer(state, { type: "assignSpec", itemNo: "1", specId: "spec-lower" });
    state = editorReducer(state, { type: "assignSpec", itemNo: "2", specId: "spec-upper" });

    // Flat reindex renumbers in reading order: the visually-higher box (was
    // "2") becomes "1", and the visually-lower box (was "1") becomes "2".
    state = editorReducer(state, { type: "reindex", mode: "flat" });
    expect(state.doc.map((it) => it.itemNo)).toEqual(["1", "2"]);

    const map = itemNoSpecIdMap(state);
    // The association must have followed the BOX, not the old itemNo label:
    // the box that was "1" (spec-lower) is now itemNo "2", and vice versa.
    expect(map.get("2")).toBe("spec-lower");
    expect(map.get("1")).toBe("spec-upper");
  });

  it("drops the spec association when its item is deleted", () => {
    let state = editorReducer(initialEditorState, {
      type: "add",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 },
    });
    state = editorReducer(state, { type: "assignSpec", itemNo: "1", specId: "spec-a" });
    expect(itemNoSpecIdMap(state).get("1")).toBe("spec-a");

    state = editorReducer(state, { type: "delete", itemNo: "1" });
    expect(state.doc).toHaveLength(0);
    expect(itemNoSpecIdMap(state).size).toBe(0);
  });

  it("unassignSpec removes only the targeted association", () => {
    let state = editorReducer(initialEditorState, {
      type: "add",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 },
    });
    state = editorReducer(state, { type: "assignSpec", itemNo: "1", specId: "spec-a" });
    state = editorReducer(state, { type: "unassignSpec", itemNo: "1" });
    expect(itemNoSpecIdMap(state).get("1")).toBeUndefined();
  });

  it("unresolvedCount reflects items still missing a linked spec", () => {
    let state = editorReducer(initialEditorState, {
      type: "add",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 },
    });
    state = editorReducer(state, {
      type: "add",
      position: { startX: 20, startY: 20, endX: 30, endY: 30 },
    });
    expect(unresolvedCount(state)).toBe(2);
    state = editorReducer(state, { type: "assignSpec", itemNo: "1", specId: "spec-a" });
    expect(unresolvedCount(state)).toBe(1);
  });

  it("setDoc (JSON import) resets the spec association and tags fresh keys", () => {
    let state = editorReducer(initialEditorState, {
      type: "add",
      position: { startX: 0, startY: 0, endX: 10, endY: 10 },
    });
    state = editorReducer(state, { type: "assignSpec", itemNo: "1", specId: "spec-a" });

    state = editorReducer(state, {
      type: "setDoc",
      doc: [{ itemNo: "1", position: { startX: 5, startY: 5, endX: 15, endY: 15 } }],
    });
    expect(state.specIds.size).toBe(0);
    expect(state.doc[0]?._key).toBeTruthy();
  });
});
