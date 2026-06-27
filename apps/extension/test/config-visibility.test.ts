import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import {
  getPersonalVisibility,
  setPersonalVisibility,
  VISIBILITY_KEY,
} from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("personal visibility storage (storage.sync)", () => {
  it("defaults to an empty override", async () => {
    expect(await getPersonalVisibility()).toEqual({ forceHide: [], forceShow: [] });
  });

  it("round-trips a non-empty override", async () => {
    const v = { forceHide: ["tag:auth"], forceShow: ["spec:login"] };
    await setPersonalVisibility(v);
    expect(await getPersonalVisibility()).toEqual(v);
    // Persisted in sync (cross-machine), not local.
    const stored = await fakeBrowser.storage.sync.get(VISIBILITY_KEY);
    expect(stored[VISIBILITY_KEY]).toEqual(v);
  });

  it("removes the key when the override is empty (keeps the payload small)", async () => {
    await setPersonalVisibility({ forceHide: ["tag:auth"], forceShow: [] });
    await setPersonalVisibility({ forceHide: [], forceShow: [] });
    const stored = await fakeBrowser.storage.sync.get(VISIBILITY_KEY);
    expect(stored[VISIBILITY_KEY]).toBeUndefined();
  });
});
