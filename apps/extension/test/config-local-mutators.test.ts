import type { SpecsResponse } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import {
  batchServesOrigin,
  createLocalBatch,
  getLocalSpecs,
  type LocalSpecsState,
  MAX_SPECS_PER_BATCH,
  type ManualBatch,
  normalizeLocalSpecsState,
  removeLocalSpecById,
  renameLocalBatch,
  setLocalBatchEnabled,
  setLocalBatchViews,
  setLocalSpecs,
  upsertLocalSpec,
} from "../src/shared/config.js";
import { localConnId } from "../src/shared/local-id.js";

// A minimal valid-shaped Spec (the mutators do not validate; routing/render only
// need the id + fingerprint).
function spec(id: string, title = id): Spec {
  return {
    id,
    title: { en: title },
    description: { en: "d" },
    fingerprint: {
      cssSelector: "button",
      xpath: "/button",
      domPath: ["button"],
      tagName: "button",
      attributes: {},
      positionHint: { index: 0, siblingCount: 1 },
    },
  } as unknown as Spec;
}

const empty: LocalSpecsState = { batches: [] };

describe("createLocalBatch", () => {
  it("appends an empty 'manual' batch carrying project + domains + opt-in", () => {
    const r = createLocalBatch(empty, {
      id: "b1",
      project: "CRM",
      domains: ["crm.test"],
      applyToAllSites: true,
    });
    expect(r.ok).toBe(true);
    const batch = r.state?.batches[0] as ManualBatch;
    expect(batch.id).toBe("b1");
    expect(batch.source).toBe("manual");
    expect(batch.label).toBe("CRM");
    expect(batch.applyToAllSites).toBe(true);
    expect(batch.fileGroups).toEqual({});
    expect(batch.specs.manifest?.project).toBe("CRM");
    expect(batch.specs.manifest?.domains).toEqual(["crm.test"]);
    expect(batch.specs.specs).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const before = { batches: [] as ManualBatch[] };
    createLocalBatch(before, { id: "b1", project: "X", domains: [] });
    expect(before.batches).toHaveLength(0);
  });

  it("rejects at MAX_MANUAL_BATCHES", () => {
    const full: LocalSpecsState = {
      batches: Array.from({ length: 50 }, (_, i) => makeBatch(`b${i}`, "P", [])),
    };
    const r = createLocalBatch(full, { id: "x", project: "Y", domains: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limit/i);
  });
});

describe("upsertLocalSpec", () => {
  const base: LocalSpecsState = { batches: [makeBatch("b1", "P", ["p.test"])] };

  it("appends a new spec, stamps _file, and records the file group", () => {
    const r = upsertLocalSpec(base, "b1", "login.spec.json", "Login", spec("a"));
    expect(r.ok).toBe(true);
    const batch = r.state?.batches[0] as ManualBatch;
    expect(batch.specs.specs).toHaveLength(1);
    expect(batch.specs.specs[0]?._file).toBe("login.spec.json");
    expect(batch.fileGroups).toEqual({ "login.spec.json": "Login" });
  });

  it("replaces a spec with the same id rather than appending", () => {
    const once = upsertLocalSpec(base, "b1", "f.spec.json", "F", spec("a", "First"))
      .state as LocalSpecsState;
    const twice = upsertLocalSpec(once, "b1", "f.spec.json", "F", spec("a", "Second"));
    const batch = twice.state?.batches[0] as ManualBatch;
    expect(batch.specs.specs).toHaveLength(1);
    expect(batch.specs.specs[0]?.title).toEqual({ en: "Second" });
  });

  it("rejects an APPEND that would exceed MAX_SPECS_PER_BATCH", () => {
    const packed = makeBatch("b1", "P", []);
    packed.specs.specs = Array.from(
      { length: MAX_SPECS_PER_BATCH },
      (_, i) => ({ ...spec(`s${i}`), _file: "f.spec.json" }) as never,
    );
    const r = upsertLocalSpec({ batches: [packed] }, "b1", "f.spec.json", "F", spec("new"));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("batch full");
  });

  it("still allows a REPLACE when the batch is at the cap (no growth)", () => {
    const packed = makeBatch("b1", "P", []);
    packed.specs.specs = Array.from(
      { length: MAX_SPECS_PER_BATCH },
      (_, i) => ({ ...spec(`s${i}`), _file: "f.spec.json" }) as never,
    );
    const r = upsertLocalSpec(
      { batches: [packed] },
      "b1",
      "f.spec.json",
      "F",
      spec("s0", "Edited"),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown batch id", () => {
    expect(upsertLocalSpec(base, "nope", "f.spec.json", "F", spec("a")).ok).toBe(false);
  });
});

describe("removeLocalSpecById", () => {
  it("drops the spec with the given id (and tolerates an absent id)", () => {
    const seeded = upsertLocalSpec(
      { batches: [makeBatch("b1", "P", [])] },
      "b1",
      "f.spec.json",
      "F",
      spec("a"),
    ).state as LocalSpecsState;
    const r = removeLocalSpecById(seeded, "b1", "a");
    expect((r.state?.batches[0] as ManualBatch).specs.specs).toEqual([]);
    expect(removeLocalSpecById(seeded, "b1", "missing").ok).toBe(true);
  });
});

describe("renameLocalBatch", () => {
  it("updates project + label and optionally re-scopes domains", () => {
    const base: LocalSpecsState = { batches: [makeBatch("b1", "Old", ["old.test"])] };
    const r = renameLocalBatch(base, "b1", "New", ["new.test"]);
    const batch = r.state?.batches[0] as ManualBatch;
    expect(batch.label).toBe("New");
    expect(batch.specs.manifest?.project).toBe("New");
    expect(batch.specs.manifest?.domains).toEqual(["new.test"]);
  });

  it("keeps domains when none are passed", () => {
    const base: LocalSpecsState = { batches: [makeBatch("b1", "Old", ["keep.test"])] };
    const r = renameLocalBatch(base, "b1", "New");
    expect((r.state?.batches[0] as ManualBatch).specs.manifest?.domains).toEqual(["keep.test"]);
  });
});

describe("setLocalBatchEnabled", () => {
  it("toggles the enabled flag without touching other fields", () => {
    const base: LocalSpecsState = { batches: [makeBatch("b1", "P", ["p.test"])] };
    const off = setLocalBatchEnabled(base, "b1", false);
    expect((off.state?.batches[0] as ManualBatch).enabled).toBe(false);
    expect((off.state?.batches[0] as ManualBatch).label).toBe("P");
    const on = setLocalBatchEnabled(off.state as LocalSpecsState, "b1", true);
    expect((on.state?.batches[0] as ManualBatch).enabled).toBe(true);
  });

  it("does not mutate the input state", () => {
    const base: LocalSpecsState = { batches: [makeBatch("b1", "P", [])] };
    setLocalBatchEnabled(base, "b1", false);
    expect(base.batches[0]?.enabled).toBeUndefined();
  });

  it("rejects an unknown batch id", () => {
    expect(setLocalBatchEnabled(empty, "nope", false).ok).toBe(false);
  });
});

describe("setLocalBatchViews", () => {
  it("stores non-empty views on the batch", () => {
    const base: LocalSpecsState = { batches: [makeBatch("b1", "P", ["p.test"])] };
    const res = setLocalBatchViews(base, "b1", { version: "1.0", hidden: ["tag:legacy"] });
    expect((res.state?.batches[0] as ManualBatch).views).toEqual({
      version: "1.0",
      hidden: ["tag:legacy"],
    });
  });

  it("drops the field when hidden is empty (no {version, hidden:[]} noise)", () => {
    const withViews: LocalSpecsState = {
      batches: [{ ...makeBatch("b1", "P", []), views: { version: "1.0", hidden: ["tag:x"] } }],
    };
    const res = setLocalBatchViews(withViews, "b1", { version: "1.0", hidden: [] });
    expect((res.state?.batches[0] as ManualBatch).views).toBeUndefined();
  });

  it("does not mutate the input state", () => {
    const base: LocalSpecsState = { batches: [makeBatch("b1", "P", [])] };
    setLocalBatchViews(base, "b1", { version: "1.0", hidden: ["tag:x"] });
    expect((base.batches[0] as ManualBatch).views).toBeUndefined();
  });

  it("rejects an unknown batch id", () => {
    expect(setLocalBatchViews(empty, "nope", { version: "1.0", hidden: [] }).ok).toBe(false);
  });
});

describe("batchServesOrigin gates on enabled", () => {
  it("a disabled batch serves no page even when its domains match", () => {
    const batch = { ...makeBatch("b1", "P", ["p.test"]), enabled: false };
    expect(batchServesOrigin(batch, "https://p.test")).toBe(false);
  });

  it("an undefined or true enabled flag still serves (backward compatible)", () => {
    const batch = makeBatch("b1", "P", ["p.test"]);
    expect(batchServesOrigin(batch, "https://p.test")).toBe(true);
    expect(batchServesOrigin({ ...batch, enabled: true }, "https://p.test")).toBe(true);
  });
});

// The full SAVE_SPEC path the background runs: mutator -> setLocalSpecs ->
// reconcile (normalize) -> registry.setLocalBatches -> specsForOrigin. Persisting
// the RETURNED state (not the input) is the load-bearing contract.
describe("local write round-trip (mutator -> storage -> registry -> origin)", () => {
  beforeEach(() => fakeBrowser.reset());

  it("a created + captured spec renders for its origin tagged manual:<batchId>", async () => {
    const created = createLocalBatch(empty, {
      id: "b1",
      project: "CRM",
      domains: ["crm.test"],
    });
    const saved = upsertLocalSpec(
      created.state as LocalSpecsState,
      "b1",
      "crm.spec.json",
      "CRM",
      spec("crm-1"),
    );
    // Persist the mutator's returned state, then reload as the background does.
    await setLocalSpecs(saved.state as LocalSpecsState);
    const reloaded = normalizeLocalSpecsState(await getLocalSpecs());
    const registry = new SidecarRegistry();
    registry.setLocalBatches((reloaded as LocalSpecsState).batches);

    const origin = registry.specsForOrigin("https://crm.test");
    expect(origin.specs.map((s) => s.id)).toEqual(["crm-1"]);
    expect(origin.specs[0]?.connectionId).toBe(localConnId("b1"));
    // The origin boundary still holds: an unrelated page sees nothing.
    expect(registry.specsForOrigin("https://other.test").specs).toEqual([]);
  });
});

function makeBatch(id: string, project: string, domains: string[]): ManualBatch {
  const specs: SpecsResponse = {
    manifest: { version: "1.0", project, domains, specFiles: [] },
    specs: [],
  };
  return { id, label: project, source: "manual", importedAt: 0, fileGroups: {}, specs };
}
