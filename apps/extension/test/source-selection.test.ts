import { describe, expect, it } from "vitest";
import { selectSource } from "../src/sources/registry.js";
import type { SpecSource } from "../src/sources/source.js";

function fakeSource(id: string, available: boolean): SpecSource {
  return {
    id,
    isAvailable: async () => available,
    loadSpecs: async () => ({ manifest: {} as never, specs: [] }),
    saveSpec: async () => {},
    updateSpec: async () => {},
  };
}

describe("selectSource", () => {
  it("returns the first available source in fallback order", async () => {
    const chosen = await selectSource([
      fakeSource("a", false),
      fakeSource("b", true),
      fakeSource("c", true),
    ]);
    expect(chosen?.id).toBe("b");
  });

  it("returns null when no source is available", async () => {
    const chosen = await selectSource([fakeSource("a", false)]);
    expect(chosen).toBeNull();
  });
});
