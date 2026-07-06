import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import {
  addCoverageIgnore,
  COVERAGE_ENABLED_KEY,
  COVERAGE_IGNORE_KEY,
  getCoverageEnabled,
  getCoverageIgnore,
  removeCoverageIgnore,
  setCoverageEnabled,
} from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("coverage-enabled storage", () => {
  it("defaults to off on a fresh profile", async () => {
    expect(await getCoverageEnabled()).toBe(false);
  });

  it("round-trips the on state", async () => {
    await setCoverageEnabled(true);
    expect(await getCoverageEnabled()).toBe(true);
  });

  it("drops the key when set back to off", async () => {
    await setCoverageEnabled(true);
    await setCoverageEnabled(false);
    expect(await getCoverageEnabled()).toBe(false);
    const stored = await fakeBrowser.storage.local.get(COVERAGE_ENABLED_KEY);
    expect(stored[COVERAGE_ENABLED_KEY]).toBeUndefined();
  });
});

describe("coverage ignore-list (per origin, storage.sync)", () => {
  const origin = "https://app.example.com";
  const other = "https://other.example.com";

  it("is empty on a fresh profile", async () => {
    expect(await getCoverageIgnore(origin)).toEqual([]);
  });

  it("adds and reads back a gap key, idempotently", async () => {
    await addCoverageIgnore(origin, "#save");
    await addCoverageIgnore(origin, "#save"); // duplicate is a no-op
    await addCoverageIgnore(origin, "data-spec-id=cancel");
    expect(await getCoverageIgnore(origin)).toEqual(["#save", "data-spec-id=cancel"]);
  });

  it("scopes keys per origin (no cross-site collision)", async () => {
    await addCoverageIgnore(origin, "#save");
    expect(await getCoverageIgnore(other)).toEqual([]);
  });

  it("removes a key and drops the whole key when the map empties", async () => {
    await addCoverageIgnore(origin, "#save");
    await removeCoverageIgnore(origin, "#save");
    expect(await getCoverageIgnore(origin)).toEqual([]);
    const stored = await fakeBrowser.storage.sync.get(COVERAGE_IGNORE_KEY);
    expect(stored[COVERAGE_IGNORE_KEY]).toBeUndefined();
  });

  it("rejects a malformed origin on write", async () => {
    await expect(addCoverageIgnore("not a url", "#x")).rejects.toThrow();
    expect(await getCoverageIgnore("not a url")).toEqual([]);
  });
});
