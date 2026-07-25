import type { ScreensConfig } from "@specpin/spec-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import type { ApproveTarget } from "../src/background/approve-captured.js";
import {
  approveCapturedTransition,
  discardCapturedTransition,
} from "../src/background/approve-captured.js";
import { appendCaptured, getBuffer } from "../src/background/capture-buffer.js";
import type { CaptureBufferEntry } from "../src/shared/messaging.js";

beforeEach(() => {
  fakeBrowser.reset();
});

function entry(id: string): Omit<CaptureBufferEntry, "project" | "capturedAt"> {
  return {
    transition: {
      id,
      from: "home",
      to: "checkout",
      trigger: { en: "navigation" },
      source: "auto-captured",
    },
    from: { id: "home", urlGlob: "/", name: "Home" },
    to: { id: "checkout", urlGlob: "/checkout", name: "Checkout" },
  };
}

/** An in-memory ApproveTarget: no sidecar, no storage.local -- just a mutable
 *  ScreensConfig plus a write counter, so tests assert on write COUNT (an
 *  aborted merge must never call writeScreens) without any browser API mocks. */
function fakeTarget(initial: ScreensConfig): ApproveTarget & { writes: ScreensConfig[] } {
  let current = initial;
  const writes: ScreensConfig[] = [];
  return {
    writes,
    getScreens: async () => current,
    writeScreens: async (config) => {
      current = config;
      writes.push(config);
    },
  };
}

const emptyScreens: ScreensConfig = { version: "1.0", screens: [], transitions: [] };

describe("approveCapturedTransition", () => {
  it("merges the entry into the target, writes it back, and drops the buffer entry", async () => {
    await appendCaptured("proj-a", entry("t1"));
    const target = fakeTarget(emptyScreens);

    const result = await approveCapturedTransition("proj-a", "t1", target);

    expect(result.ok).toBe(true);
    expect(target.writes).toHaveLength(1);
    expect(target.writes[0]?.screens.map((s) => s.id)).toEqual(["home", "checkout"]);
    expect(target.writes[0]?.transitions[0]).toMatchObject({ id: "t1", source: "auto-captured" });
    expect(await getBuffer("proj-a")).toEqual([]);
  });

  it("does not clobber an existing manual/imported screen or transition", async () => {
    await appendCaptured("proj-a", entry("t1"));
    const existing: ScreensConfig = {
      version: "1.0",
      screens: [{ id: "home", name: { en: "Home (manual)" }, urlGlob: "/" }],
      transitions: [
        { id: "manual-1", from: "home", to: "other", trigger: { en: "Go" }, source: "manual" },
      ],
    };
    const target = fakeTarget(existing);

    const result = await approveCapturedTransition("proj-a", "t1", target);

    expect(result.ok).toBe(true);
    const written = target.writes[0] as ScreensConfig;
    expect(written.screens.find((s) => s.id === "home")?.name).toEqual({ en: "Home (manual)" });
    expect(written.transitions.find((t) => t.id === "manual-1")).toEqual(existing.transitions[0]);
  });

  it("is idempotent on re-approve (dedupes by transition id, no duplicate)", async () => {
    await appendCaptured("proj-a", entry("t1"));
    const target = fakeTarget(emptyScreens);
    const first = await approveCapturedTransition("proj-a", "t1", target);
    expect(first.ok).toBe(true);

    // Re-buffer the SAME entry (e.g. observed again before the panel refreshed)
    // and approve again: still one committed transition, one screen pair.
    await appendCaptured("proj-a", entry("t1"));
    const second = await approveCapturedTransition("proj-a", "t1", target);

    expect(second.ok).toBe(true);
    const written = target.writes[1] as ScreensConfig;
    expect(written.transitions.filter((t) => t.id === "t1")).toHaveLength(1);
    expect(written.screens.filter((s) => s.id === "checkout")).toHaveLength(1);
  });

  it("aborts with NO write when the merge is refused (id owned by a different source)", async () => {
    await appendCaptured("proj-a", entry("t1"));
    const existing: ScreensConfig = {
      version: "1.0",
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" },
      ],
      transitions: [
        {
          id: "t1",
          from: "home",
          to: "checkout",
          trigger: { en: "Manual edge" },
          source: "manual",
        },
      ],
    };
    const target = fakeTarget(existing);

    const result = await approveCapturedTransition("proj-a", "t1", target);

    expect(result.ok).toBe(false);
    expect(target.writes).toHaveLength(0);
    // The buffer entry is left in place -- nothing was approved.
    expect((await getBuffer("proj-a")).map((e) => e.transition.id)).toEqual(["t1"]);
  });

  it("reports an error and writes nothing when the entry is not in the buffer", async () => {
    const target = fakeTarget(emptyScreens);
    const result = await approveCapturedTransition("proj-a", "missing", target);
    expect(result.ok).toBe(false);
    expect(target.writes).toHaveLength(0);
  });
});

describe("discardCapturedTransition", () => {
  it("removes only the targeted entry, leaving other entries (same or other project) untouched", async () => {
    await appendCaptured("proj-a", entry("t1"));
    await appendCaptured("proj-a", entry("t2"));
    await appendCaptured("proj-b", entry("t1"));

    const result = await discardCapturedTransition("proj-a", "t1");

    expect(result.ok).toBe(true);
    expect((await getBuffer("proj-a")).map((e) => e.transition.id)).toEqual(["t2"]);
    expect((await getBuffer("proj-b")).map((e) => e.transition.id)).toEqual(["t1"]);
  });

  it("is a no-op (still ok) when the entry is already gone", async () => {
    const result = await discardCapturedTransition("proj-a", "gone");
    expect(result.ok).toBe(true);
  });
});
