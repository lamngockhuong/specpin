import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getWelcomeSeen, setWelcomeSeen, WELCOME_SEEN_KEY } from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("welcome-seen storage (first-run onboarding gate)", () => {
  it("defaults to false on a fresh profile", async () => {
    expect(await getWelcomeSeen()).toBe(false);
  });

  it("round-trips the seen state", async () => {
    await setWelcomeSeen(true);
    expect(await getWelcomeSeen()).toBe(true);
    const stored = await fakeBrowser.storage.local.get(WELCOME_SEEN_KEY);
    expect(stored[WELCOME_SEEN_KEY]).toBe(true);
  });
});
