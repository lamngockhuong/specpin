import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import {
  appendCaptured,
  clearBuffer,
  getBuffer,
  MAX_CAPTURE_ENTRIES_PER_PROJECT,
} from "../src/background/capture-buffer.js";
import type { CaptureBufferEntry } from "../src/shared/messaging.js";

beforeEach(() => {
  fakeBrowser.reset();
});

function entry(id: string): Omit<CaptureBufferEntry, "project" | "capturedAt"> {
  return {
    transition: {
      id,
      from: `${id}-from`,
      to: `${id}-to`,
      trigger: { en: "navigation" },
      source: "auto-captured",
    },
    from: { id: `${id}-from`, urlGlob: `/${id}-from`, name: "From" },
    to: { id: `${id}-to`, urlGlob: `/${id}-to`, name: "To" },
  };
}

describe("appendCaptured", () => {
  it("stores an entry tagged with the project and a capture timestamp", async () => {
    await appendCaptured("proj-a", entry("t1"), 12345);
    const [stored] = await getBuffer("proj-a");
    expect(stored?.project).toBe("proj-a");
    expect(stored?.capturedAt).toBe(12345);
    expect(stored?.transition.id).toBe("t1");
  });

  it("dedupes repeats of the same transition id WITHIN a project", async () => {
    await appendCaptured("proj-a", entry("t1"));
    await appendCaptured("proj-a", entry("t1"));
    const stored = await getBuffer("proj-a");
    expect(stored).toHaveLength(1);
  });

  it("does not dedupe the same transition id ACROSS different projects", async () => {
    await appendCaptured("proj-a", entry("t1"));
    await appendCaptured("proj-b", entry("t1"));
    expect(await getBuffer("proj-a")).toHaveLength(1);
    expect(await getBuffer("proj-b")).toHaveLength(1);
  });

  it("enforces the per-project ring-buffer cap, dropping the oldest first", async () => {
    for (let i = 0; i < MAX_CAPTURE_ENTRIES_PER_PROJECT + 5; i += 1) {
      await appendCaptured("proj-a", entry(`t${i}`));
    }
    const stored = await getBuffer("proj-a");
    expect(stored).toHaveLength(MAX_CAPTURE_ENTRIES_PER_PROJECT);
    expect(stored[0]?.transition.id).toBe("t5");
    expect(stored.at(-1)?.transition.id).toBe(`t${MAX_CAPTURE_ENTRIES_PER_PROJECT + 4}`);
  });

  it("serializes concurrent appends without losing a write", async () => {
    await Promise.all([
      appendCaptured("proj-a", entry("a")),
      appendCaptured("proj-a", entry("b")),
      appendCaptured("proj-a", entry("c")),
    ]);
    expect(await getBuffer("proj-a")).toHaveLength(3);
  });
});

describe("getBuffer", () => {
  it("returns only the requested project's entries when scoped", async () => {
    await appendCaptured("proj-a", entry("a"));
    await appendCaptured("proj-b", entry("b"));
    expect((await getBuffer("proj-a")).map((e) => e.transition.id)).toEqual(["a"]);
  });

  it("returns every project's entries when omitted", async () => {
    await appendCaptured("proj-a", entry("a"));
    await appendCaptured("proj-b", entry("b"));
    const all = await getBuffer();
    expect(all.map((e) => e.transition.id).sort()).toEqual(["a", "b"]);
  });

  it("is empty by default", async () => {
    expect(await getBuffer()).toEqual([]);
  });
});

describe("clearBuffer", () => {
  it("discards only the named project's entries, leaving others untouched", async () => {
    await appendCaptured("proj-a", entry("a"));
    await appendCaptured("proj-b", entry("b"));
    await clearBuffer("proj-a");
    expect(await getBuffer("proj-a")).toEqual([]);
    expect(await getBuffer("proj-b")).toHaveLength(1);
  });
});
