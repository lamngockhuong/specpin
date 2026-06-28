import type { SpecsResponse } from "@specpin/api-client";
import { describe, expect, it } from "vitest";
import { findSpecIdCollisions, SidecarRegistry } from "../src/background/sidecar-registry.js";
import type { ManualBatch } from "../src/shared/config.js";
import { localConnId } from "../src/shared/local-id.js";

function resp(project: string, domains: string[], specId = "spec"): SpecsResponse {
  return {
    manifest: { version: "1.0", project, domains, specFiles: [] },
    specs: [{ id: specId } as never],
  };
}

function batch(id: string, specs: SpecsResponse, applyToAllSites?: boolean): ManualBatch {
  return {
    id,
    label: specs.manifest?.project ?? id,
    source: "manual",
    importedAt: 0,
    applyToAllSites,
    specs,
  };
}

describe("localTargetsForOrigin (write/capture picker gate, RT-SA1/SA7 parity)", () => {
  it("lists a domain-pinned local project only for an origin its domains cover", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([batch("b1", resp("CRM", ["crm.test"]))]);
    expect(r.localTargetsForOrigin("https://crm.test")).toEqual([
      { id: localConnId("b1"), project: "CRM" },
    ]);
    expect(r.localTargetsForOrigin("https://other.test")).toEqual([]);
  });

  it("includes an EMPTY local project as a target (specsForOrigin would omit it)", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([batch("b1", { manifest: resp("Empty", ["crm.test"]).manifest, specs: [] })]);
    expect(r.localTargetsForOrigin("https://crm.test").map((t) => t.id)).toEqual([
      localConnId("b1"),
    ]);
  });

  it("excludes an empty-domains project unless applyToAllSites is set", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([batch("off", resp("Off", []), false), batch("on", resp("On", []), true)]);
    expect(r.localTargetsForOrigin("https://anything.test").map((t) => t.project)).toEqual(["On"]);
  });
});

describe("specsForOrigin writable flag (no dead Edit affordance)", () => {
  it("marks a domain-matched local spec writable but an empty-domains import not", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([
      batch("pinned", resp("Pinned", ["crm.test"], "a")),
      batch("loose", resp("Loose", [], "b")), // empty domains, no applyToAllSites
    ]);
    const specs = r.specsForOrigin("https://crm.test").specs;
    const writableById = Object.fromEntries(specs.map((s) => [s.id, s.writable]));
    expect(writableById.a).toBe(true);
    // Renders match-all (page-owned import) but is not a write target, so no Edit.
    expect(writableById.b).toBe(false);
  });

  it("marks an empty-domains local spec writable when applyToAllSites is set", () => {
    const r = new SidecarRegistry();
    r.setLocalBatches([batch("on", resp("On", [], "x"), true)]);
    expect(r.specsForOrigin("https://any.test").specs[0]?.writable).toBe(true);
  });
});

describe("findSpecIdCollisions (import-time cross-batch warning)", () => {
  it("flags an id shared with a batch that could serve the same page", () => {
    const existing = [batch("b1", resp("A", ["acme.test"], "dup"))];
    const candidate = resp("B", ["app.acme.test"], "dup"); // subdomain overlap
    expect(findSpecIdCollisions(candidate, existing)).toEqual(["dup"]);
  });

  it("does not flag when domains cannot overlap", () => {
    const existing = [batch("b1", resp("A", ["a.test"], "dup"))];
    expect(findSpecIdCollisions(resp("B", ["b.test"], "dup"), existing)).toEqual([]);
  });

  it("treats an empty-domains batch as overlapping anything", () => {
    const existing = [batch("b1", resp("A", [], "dup"))];
    expect(findSpecIdCollisions(resp("B", ["b.test"], "dup"), existing)).toEqual(["dup"]);
  });
});
