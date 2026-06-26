import type { SpecsResponse } from "@specpin/api-client";
import { describe, expect, it } from "vitest";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import { ManualSource } from "../src/sources/manual.js";

function specsResponse(project: string): SpecsResponse {
  return {
    manifest: { version: "1.0", project, domains: [], specFiles: [] } as never,
    specs: [],
  };
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
  it("serves manual specs (no sidecar) for any origin (empty domains)", () => {
    const r = new SidecarRegistry();
    r.setLocalSpecs(specsResponse("Manual"), 1);
    const { specs, manifest } = r.specsForOrigin("http://anywhere.test");
    expect(manifest?.project).toBe("Manual");
    expect(r.hasContent()).toBe(true);
    // Manual specs are tagged with the "manual" source id.
    expect(specs.every((s) => s.connectionId === "manual")).toBe(true);
  });

  it("ignores stale (out-of-order) local writes via the seq guard", () => {
    const r = new SidecarRegistry();
    expect(r.setLocalSpecs(specsResponse("new"), 5)).toBe(true);
    expect(r.setLocalSpecs(specsResponse("old"), 3)).toBe(false);
    expect(r.setLocalSpecs(specsResponse("same"), 5)).toBe(false);
    expect(r.setLocalSpecs(specsResponse("newer"), 6)).toBe(true);
  });

  it("clears manual content when removed", () => {
    const r = new SidecarRegistry();
    r.setLocalSpecs(specsResponse("X"), 1);
    expect(r.hasContent()).toBe(true);
    r.setLocalSpecs(null, 2);
    expect(r.hasContent()).toBe(false);
    expect(r.specsForOrigin("http://x.test").specs).toEqual([]);
  });
});
