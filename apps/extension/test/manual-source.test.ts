import type { SpecsResponse } from "@specpin/api-client";
import { describe, expect, it } from "vitest";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import type { ManualBatch } from "../src/shared/config.js";
import { ManualSource } from "../src/sources/manual.js";

function specsResponse(project: string): SpecsResponse {
  return {
    manifest: { version: "1.0", project, domains: [], specFiles: [] } as never,
    specs: [],
  };
}

function batch(id: string, project: string): ManualBatch {
  return { id, label: project, source: "paste", importedAt: 0, specs: specsResponse(project) };
}

describe("ManualSource", () => {
  it("is unavailable until specs are set, then read-only", async () => {
    const src = new ManualSource();
    expect(await src.isAvailable()).toBe(false);
    src.setSpecs(specsResponse("A"));
    expect(await src.isAvailable()).toBe(true);
    await expect(src.saveSpec()).rejects.toThrow(/read-only/i);
  });
});

describe("SidecarRegistry + manual import", () => {
  it("serves manual batches (no sidecar) for any origin (empty domains)", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([batch("a", "Manual")]);
    const { specs, manifest } = r.specsForOrigin("http://anywhere.test");
    expect(manifest?.project).toBe("Manual");
    expect(r.hasContent()).toBe(true);
    // Manual specs are tagged with the "manual" source id.
    expect(specs.every((s) => s.connectionId === "manual")).toBe(true);
  });

  it("clears manual content when the list empties", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([batch("a", "X")]);
    expect(r.hasContent()).toBe(true);
    r.clearLocalSpecs();
    expect(r.hasContent()).toBe(false);
    expect(r.specsForOrigin("http://x.test").specs).toEqual([]);
  });
});
