import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { sendToTab } from "../src/shared/messaging.js";

// sendToTab wraps browser.tabs.sendMessage (backed by fakeBrowser in tests, per
// wxt/testing). fakeBrowser has no real content-script receiver to dispatch to,
// so this stubs tabs.sendMessage directly to control the resolved response and
// assert propagation: HIGHLIGHT_SPEC_ON_TAB's content-script handler answers
// with a boolean (found + highlighted vs. not-on-this-page), and the graph page
// (Phase 5) reads sendToTab's resolved value to decide whether to show its hint.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendToTab", () => {
  it("propagates an explicit false response (e.g. spec not matched on this page)", async () => {
    vi.spyOn(fakeBrowser.tabs, "sendMessage").mockResolvedValue(false);
    const result = await sendToTab(1, {
      type: "HIGHLIGHT_SPEC_ON_TAB",
      specId: "s1",
      connectionId: "c1",
    });
    expect(result).toBe(false);
  });

  it("propagates an explicit true response (found + highlighted)", async () => {
    vi.spyOn(fakeBrowser.tabs, "sendMessage").mockResolvedValue(true);
    const result = await sendToTab(1, {
      type: "HIGHLIGHT_SPEC_ON_TAB",
      specId: "s1",
      connectionId: "c1",
    });
    expect(result).toBe(true);
  });

  it("treats an undefined response (fire-and-forget message types) as delivered", async () => {
    vi.spyOn(fakeBrowser.tabs, "sendMessage").mockResolvedValue(undefined);
    const result = await sendToTab(1, { type: "START_CAPTURE" });
    expect(result).toBe(true);
  });

  it("resolves false when the send rejects (closed/navigated tab, no content script)", async () => {
    vi.spyOn(fakeBrowser.tabs, "sendMessage").mockRejectedValue(new Error("no receiver"));
    const result = await sendToTab(1, { type: "START_CAPTURE" });
    expect(result).toBe(false);
  });
});
