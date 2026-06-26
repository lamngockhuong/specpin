import type { SpecsResponse } from "@specpin/api-client";
import { describe, expect, it } from "vitest";
import { SidecarController } from "../src/background/sidecar-controller.js";
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

describe("SidecarController + manual import", () => {
  it("reloads from the manual source when no sidecar is configured", async () => {
    const c = new SidecarController();
    c.setLocalSpecs(specsResponse("Manual"), 1);
    const res = await c.reload();
    expect(res.manifest.project).toBe("Manual");
    expect(c.activeSourceId()).toBe("manual");
    expect(c.hasContent()).toBe(true);
  });

  it("ignores stale (out-of-order) local writes via the seq guard", () => {
    const c = new SidecarController();
    expect(c.setLocalSpecs(specsResponse("new"), 5)).toBe(true);
    expect(c.setLocalSpecs(specsResponse("old"), 3)).toBe(false);
    expect(c.setLocalSpecs(specsResponse("same"), 5)).toBe(false);
    expect(c.setLocalSpecs(specsResponse("newer"), 6)).toBe(true);
  });

  it("clears the cache when local specs are removed and no source remains", async () => {
    const c = new SidecarController();
    c.setLocalSpecs(specsResponse("X"), 1);
    await c.reload();
    expect(c.hasContent()).toBe(true);

    c.setLocalSpecs(null, 2);
    await expect(c.reload()).rejects.toThrow();
    expect(c.hasContent()).toBe(false);
    expect(c.activeSourceId()).toBeNull();
  });
});
