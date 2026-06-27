import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getDisplayMode, setDisplayMode } from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("display-mode storage", () => {
  it("defaults to null (per-spec mode)", async () => {
    expect(await getDisplayMode()).toBeNull();
  });

  it("round-trips a forced mode", async () => {
    await setDisplayMode("sidebar");
    expect(await getDisplayMode()).toBe("sidebar");
  });

  it("clears the override back to per-spec when set to null", async () => {
    await setDisplayMode("modal");
    await setDisplayMode(null);
    expect(await getDisplayMode()).toBeNull();
  });
});
