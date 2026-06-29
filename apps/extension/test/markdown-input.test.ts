import { describe, expect, it } from "vitest";
import { insertLink, prefixLines, toggleWrap } from "../src/shared/markdown-input.js";

describe("toggleWrap", () => {
  it("wraps the selection in the marker", () => {
    // "abc" with "b" selected (1..2)
    expect(toggleWrap("abc", 1, 2, "**")).toEqual({
      value: "a**b**c",
      selStart: 3,
      selEnd: 4,
    });
  });

  it("inserts an empty marker pair and drops the caret between them", () => {
    expect(toggleWrap("ab", 1, 1, "_")).toEqual({ value: "a__b", selStart: 2, selEnd: 2 });
  });

  it("unwraps when the markers sit just outside the selection (toggle off)", () => {
    // "a**b**c" with "b" selected (3..4)
    expect(toggleWrap("a**b**c", 3, 4, "**")).toEqual({
      value: "abc",
      selStart: 1,
      selEnd: 2,
    });
  });

  it("unwraps when the selection itself includes the markers", () => {
    // "**b**" fully selected (0..5)
    expect(toggleWrap("**b**", 0, 5, "**")).toEqual({
      value: "b",
      selStart: 0,
      selEnd: 1,
    });
  });
});

describe("insertLink", () => {
  it("wraps the selection as link text and selects the label", () => {
    // "see x" with "x" selected (4..5)
    const r = insertLink("see x", 4, 5, "https://a.com");
    expect(r.value).toBe("see [x](https://a.com)");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("x");
  });

  it("inserts a text placeholder when the selection is empty", () => {
    const r = insertLink("", 0, 0, "https://a.com");
    expect(r.value).toBe("[text](https://a.com)");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("text");
  });

  it("uses a url placeholder when no url is given", () => {
    const r = insertLink("x", 0, 1, "");
    expect(r.value).toBe("[x](url)");
  });
});

describe("prefixLines", () => {
  it("prefixes a single line with a bullet", () => {
    expect(prefixLines("one", 0, 3, "bullet").value).toBe("- one");
  });

  it("numbers each selected line in order", () => {
    expect(prefixLines("one\ntwo\nthree", 0, 13, "number").value).toBe("1. one\n2. two\n3. three");
  });

  it("expands a caret (empty selection) to its whole line", () => {
    // caret inside "two"
    const r = prefixLines("one\ntwo", 5, 5, "bullet");
    expect(r.value).toBe("one\n- two");
  });

  it("bullets every selected line", () => {
    expect(prefixLines("a\nb", 0, 3, "bullet").value).toBe("- a\n- b");
  });
});
