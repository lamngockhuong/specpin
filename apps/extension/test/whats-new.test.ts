import { describe, expect, it } from "vitest";
import { CHANGELOG_URL, parseVersion, shouldOpenChangelog } from "../src/shared/whats-new.js";

describe("parseVersion", () => {
  it("parses x.y.z", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("0.0.6")).toEqual([0, 0, 6]);
  });

  it("tolerates surrounding whitespace and extra segments", () => {
    expect(parseVersion(" 1.2.3 ")).toEqual([1, 2, 3]);
    expect(parseVersion("1.2.3.4")).toEqual([1, 2, 3]);
  });

  it("rejects malformed versions", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("v1.2.3")).toBeNull();
    expect(parseVersion("nope")).toBeNull();
  });
});

describe("shouldOpenChangelog", () => {
  it("opens on any forward move pre-1.0 (patch bumps carry features)", () => {
    expect(shouldOpenChangelog("0.0.5", "0.0.6")).toBe(true);
    expect(shouldOpenChangelog("0.0.6", "0.1.0")).toBe(true);
    expect(shouldOpenChangelog("0.1.0", "0.2.0")).toBe(true);
  });

  it("opens on minor or major bump at 1.0+", () => {
    expect(shouldOpenChangelog("1.0.0", "1.1.0")).toBe(true);
    expect(shouldOpenChangelog("1.2.0", "2.0.0")).toBe(true);
  });

  it("stays silent on a patch-only bump at 1.0+", () => {
    expect(shouldOpenChangelog("1.0.0", "1.0.1")).toBe(false);
    expect(shouldOpenChangelog("2.3.4", "2.3.5")).toBe(false);
  });

  it("opens when crossing from pre-1.0 to 1.0 (major increase)", () => {
    expect(shouldOpenChangelog("0.9.0", "1.0.0")).toBe(true);
  });

  it("never opens on equal or downgraded versions", () => {
    expect(shouldOpenChangelog("1.2.3", "1.2.3")).toBe(false);
    expect(shouldOpenChangelog("0.0.6", "0.0.6")).toBe(false);
    expect(shouldOpenChangelog("2.0.0", "1.9.9")).toBe(false);
    expect(shouldOpenChangelog("0.0.6", "0.0.5")).toBe(false);
  });

  it("never opens when either version is malformed", () => {
    expect(shouldOpenChangelog("", "1.0.0")).toBe(false);
    expect(shouldOpenChangelog("1.0.0", "")).toBe(false);
    expect(shouldOpenChangelog("garbage", "1.0.0")).toBe(false);
  });
});

describe("URLs", () => {
  it("changelog URL is the website /changelog route", () => {
    expect(CHANGELOG_URL).toBe("https://specpin.ohnice.app/changelog");
  });
});
