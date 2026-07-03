import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { BADGE_NUMBERING_KEY, getBadgeNumbering, setBadgeNumbering } from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("badge-numbering storage", () => {
  it("defaults to off on a fresh profile", async () => {
    expect(await getBadgeNumbering()).toBe(false);
  });

  it("round-trips the on state", async () => {
    await setBadgeNumbering(true);
    expect(await getBadgeNumbering()).toBe(true);
  });

  it("drops the key when set back to off (default profile carries nothing)", async () => {
    await setBadgeNumbering(true);
    await setBadgeNumbering(false);
    expect(await getBadgeNumbering()).toBe(false);
    const stored = await fakeBrowser.storage.local.get(BADGE_NUMBERING_KEY);
    expect(stored[BADGE_NUMBERING_KEY]).toBeUndefined();
  });
});
