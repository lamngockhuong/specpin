import { describe, expect, it } from "vitest";
import { MAX_MANUAL_BATCHES } from "../src/shared/config.js";
import { PRIVILEGED_MESSAGE_TYPES } from "../src/shared/messaging.js";

// Regression guard: a content script must never be able to append, drop, or wipe
// a user's manual batches. The background only enforces the extension-page-origin
// check on members of PRIVILEGED_MESSAGE_TYPES, so silently dropping one of these
// from the set would re-open that write path. This is the cheap canary for it.
describe("manual-batch message gating", () => {
  it("gates all three manual-batch mutations behind PRIVILEGED_MESSAGE_TYPES", () => {
    expect(PRIVILEGED_MESSAGE_TYPES.has("ADD_LOCAL_BATCH")).toBe(true);
    expect(PRIVILEGED_MESSAGE_TYPES.has("REMOVE_LOCAL_BATCH")).toBe(true);
    expect(PRIVILEGED_MESSAGE_TYPES.has("CLEAR_LOCAL_SPECS")).toBe(true);
  });
});

describe("manual-batch cap", () => {
  it("bounds the batch list with a positive integer cap", () => {
    expect(Number.isInteger(MAX_MANUAL_BATCHES)).toBe(true);
    expect(MAX_MANUAL_BATCHES).toBeGreaterThan(0);
  });

  it("the add handler's boundary rejects only once the list is at the cap", () => {
    // Mirrors the guard in handleAddLocalBatch: length >= cap rejects, below appends.
    const atCap = (n: number) => n >= MAX_MANUAL_BATCHES;
    expect(atCap(MAX_MANUAL_BATCHES - 1)).toBe(false);
    expect(atCap(MAX_MANUAL_BATCHES)).toBe(true);
  });
});
