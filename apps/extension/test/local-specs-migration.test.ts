import type { SpecsResponse } from "@specpin/api-client";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import {
  getLocalSpecs,
  isManualBatch,
  LOCAL_SPECS_KEY,
  type ManualBatch,
  normalizeLocalSpecsState,
  setLocalSpecs,
} from "../src/shared/config.js";

function specsResponse(project: string, specId = "spec"): SpecsResponse {
  return {
    manifest: { version: "1.0", project, domains: [], specFiles: [] } as never,
    specs: [{ id: specId } as never],
  };
}

function batch(id: string, project: string, specId = "spec"): ManualBatch {
  return {
    id,
    label: project,
    source: "paste",
    importedAt: 0,
    specs: specsResponse(project, specId),
  };
}

describe("normalizeLocalSpecsState", () => {
  it("wraps a legacy single-bundle ({ specs, seq }) as one batch with an injected id", () => {
    const legacy = { specs: specsResponse("Legacy"), seq: 7 };
    const state = normalizeLocalSpecsState(legacy, () => "fixed-id");
    expect(state?.batches).toHaveLength(1);
    expect(state?.batches[0]?.id).toBe("fixed-id");
    expect(state?.batches[0]?.label).toBe("Legacy");
    expect(state?.batches[0]?.specs.manifest?.project).toBe("Legacy");
    // No seq field survives the migration.
    expect(state?.batches[0]).not.toHaveProperty("seq");
  });

  it("labels a legacy bundle with no project as 'Imported bundle'", () => {
    const legacy = {
      specs: { manifest: { version: "1.0", domains: [], specFiles: [] }, specs: [] },
    };
    const state = normalizeLocalSpecsState(legacy, () => "x");
    expect(state?.batches[0]?.label).toBe("Imported bundle");
  });

  it("passes a new { batches } shape through, filtering invalid entries", () => {
    const valid = batch("a", "A");
    const raw = { batches: [valid, { id: 5, label: "bad" }, { nope: true }] };
    const state = normalizeLocalSpecsState(raw, () => "x");
    expect(state?.batches.map((b) => b.id)).toEqual(["a"]);
  });

  it("prefers batches over specs for a half-migrated value", () => {
    const raw = { batches: [batch("a", "A")], specs: specsResponse("Legacy") };
    const state = normalizeLocalSpecsState(raw, () => "x");
    expect(state?.batches.map((b) => b.id)).toEqual(["a"]);
  });

  it("returns null for garbage, empty batches, and missing values", () => {
    expect(normalizeLocalSpecsState(null)).toBeNull();
    expect(normalizeLocalSpecsState(42)).toBeNull();
    expect(normalizeLocalSpecsState({})).toBeNull();
    expect(normalizeLocalSpecsState({ batches: [] })).toBeNull();
    expect(normalizeLocalSpecsState({ batches: [{ bad: true }] })).toBeNull();
  });
});

describe("isManualBatch guard", () => {
  it("accepts a well-formed batch and rejects malformed shapes", () => {
    expect(isManualBatch(batch("a", "A"))).toBe(true);
    expect(isManualBatch({ id: "a", label: "x", specs: {} })).toBe(false); // no specs.specs array
    expect(isManualBatch({ id: 1, label: "x", specs: { specs: [] } })).toBe(false);
    expect(isManualBatch(null)).toBe(false);
  });
});

describe("getLocalSpecs / setLocalSpecs storage round-trip", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("returns null when nothing is stored", async () => {
    expect(await getLocalSpecs()).toBeNull();
  });

  it("round-trips a batch list", async () => {
    await setLocalSpecs({ batches: [batch("a", "A"), batch("b", "B")] });
    const state = await getLocalSpecs();
    expect(state?.batches.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("reads a legacy stored bundle as one batch (lossless upgrade on read)", async () => {
    await fakeBrowser.storage.local.set({
      [LOCAL_SPECS_KEY]: { specs: specsResponse("Old"), seq: 3 },
    });
    const state = await getLocalSpecs();
    expect(state?.batches).toHaveLength(1);
    expect(state?.batches[0]?.specs.manifest?.project).toBe("Old");
  });

  it("removes the key when set to null or an empty list", async () => {
    await setLocalSpecs({ batches: [batch("a", "A")] });
    await setLocalSpecs(null);
    expect((await fakeBrowser.storage.local.get(LOCAL_SPECS_KEY))[LOCAL_SPECS_KEY]).toBeUndefined();

    await setLocalSpecs({ batches: [batch("a", "A")] });
    await setLocalSpecs({ batches: [] });
    expect((await fakeBrowser.storage.local.get(LOCAL_SPECS_KEY))[LOCAL_SPECS_KEY]).toBeUndefined();
  });
});
