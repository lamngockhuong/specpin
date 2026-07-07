import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { BADGE_COLOR_KEY, getBadgeColor, setBadgeColor } from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("badge-color storage", () => {
  it("defaults to null on a fresh profile", async () => {
    expect(await getBadgeColor()).toBeNull();
  });

  it("round-trips a valid hex color", async () => {
    await setBadgeColor("#FF00AA");
    expect(await getBadgeColor()).toBe("#FF00AA");
  });

  it("drops the key when reset to null (default profile carries nothing)", async () => {
    await setBadgeColor("#123456");
    await setBadgeColor(null);
    expect(await getBadgeColor()).toBeNull();
    const stored = await fakeBrowser.storage.local.get(BADGE_COLOR_KEY);
    expect(stored[BADGE_COLOR_KEY]).toBeUndefined();
  });

  it("ignores a malformed value on write (no key stored)", async () => {
    await setBadgeColor("red" as unknown as string);
    expect(await getBadgeColor()).toBeNull();
    const stored = await fakeBrowser.storage.local.get(BADGE_COLOR_KEY);
    expect(stored[BADGE_COLOR_KEY]).toBeUndefined();
  });

  it("treats a tampered stored value as unset on read", async () => {
    await fakeBrowser.storage.local.set({ [BADGE_COLOR_KEY]: "javascript:alert(1)" });
    expect(await getBadgeColor()).toBeNull();
  });
});
