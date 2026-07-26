import { describe, expect, it } from "vitest";
import { matchesRecordExclude, transitionExcluded } from "../src/shared/record-exclude.js";

describe("matchesRecordExclude", () => {
  it("returns false for an absent or empty ignore-list (capture everything)", () => {
    expect(matchesRecordExclude(undefined, "/settings")).toBe(false);
    expect(matchesRecordExclude([], "/settings")).toBe(false);
  });

  it("matches an exact glob and honors ** / * wildcards", () => {
    expect(matchesRecordExclude(["/settings"], "/settings")).toBe(true);
    expect(matchesRecordExclude(["/settings/**"], "/settings/profile")).toBe(true);
    expect(matchesRecordExclude(["/settings/**"], "/settings/a/b")).toBe(true);
    expect(matchesRecordExclude(["/orders/*"], "/orders/list")).toBe(true);
    // single * does not cross a path segment
    expect(matchesRecordExclude(["/orders/*"], "/orders/123/items")).toBe(false);
  });

  it("does not match an unrelated route", () => {
    expect(matchesRecordExclude(["/settings/**"], "/checkout")).toBe(false);
  });

  it("matches when ANY glob in the list matches", () => {
    expect(matchesRecordExclude(["/help", "/settings/**"], "/settings/x")).toBe(true);
  });
});

describe("transitionExcluded", () => {
  it("drops the edge when the DESTINATION matches", () => {
    expect(transitionExcluded(["/settings/**"], "/home", "/settings/profile")).toBe(true);
  });

  it("drops the edge when the SOURCE matches (fully removes the ignored screen)", () => {
    expect(transitionExcluded(["/settings/**"], "/settings/profile", "/home")).toBe(true);
  });

  it("keeps the edge when neither endpoint matches", () => {
    expect(transitionExcluded(["/settings/**"], "/home", "/checkout")).toBe(false);
  });

  it("keeps everything when the ignore-list is empty", () => {
    expect(transitionExcluded([], "/settings", "/settings")).toBe(false);
  });
});
