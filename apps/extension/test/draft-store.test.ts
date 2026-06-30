import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { clearDraft, loadDraft, saveDraft } from "../src/shared/draft-store.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("draft-store", () => {
  it("round-trips a stashed value through session storage", async () => {
    await saveDraft("k", { project: "Acme", open: true });
    expect(await loadDraft<{ project: string; open: boolean }>("k")).toEqual({
      project: "Acme",
      open: true,
    });
  });

  it("returns null for a key that was never written", async () => {
    expect(await loadDraft("absent")).toBeNull();
  });

  it("namespaces keys so two drafts do not collide", async () => {
    await saveDraft("a", "one");
    await saveDraft("b", "two");
    expect(await loadDraft("a")).toBe("one");
    expect(await loadDraft("b")).toBe("two");
  });

  it("clearDraft drops the value", async () => {
    await saveDraft("k", "v");
    await clearDraft("k");
    expect(await loadDraft("k")).toBeNull();
  });

  it("stores in session (not local) so a draft does not outlive the browser session", async () => {
    await saveDraft("k", "v");
    const local = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(local)).toHaveLength(0);
    const session = await fakeBrowser.storage.session.get(null);
    expect(session["specpin:draft:k"]).toBe("v");
  });
});
