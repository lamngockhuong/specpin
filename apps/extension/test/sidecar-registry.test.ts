import { SidecarError, type SpecsResponse } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { SidecarConnection } from "../src/background/sidecar-connection.js";
import { findDuplicateBatches, SidecarRegistry } from "../src/background/sidecar-registry.js";
import type { ManualBatch } from "../src/shared/config.js";
import type { Connection } from "../src/shared/connection-types.js";
import type { SpecSource } from "../src/sources/source.js";

/** Wrap a SpecsResponse as a stored Manual-import batch. */
function batch(id: string, specs: SpecsResponse): ManualBatch {
  return { id, label: specs.manifest?.project ?? id, source: "paste", importedAt: 0, specs };
}

function resp(project: string, domains: string[], specId = "spec"): SpecsResponse {
  return {
    manifest: {
      version: "1.0",
      project,
      domains,
      specFiles: [],
      settings: { defaultLocale: "en", locales: ["en"] },
    },
    specs: [
      {
        id: specId,
        title: { en: specId },
        description: { en: "d" },
        fingerprint: {
          cssSelector: "button",
          xpath: "/button",
          domPath: ["button"],
          tagName: "button",
          attributes: {},
          positionHint: { index: 0, siblingCount: 1 },
        },
        _file: "f.spec.json",
      },
    ],
  } as unknown as SpecsResponse;
}

/** Fake source: returns canned specs (or throws), and tracks live watch count. */
function fakeSource(
  data: SpecsResponse | Error,
  watch: { n: number },
  rec?: { updated: string[] },
): SpecSource {
  return {
    id: "sidecar",
    isAvailable: async () => true,
    loadSpecs: async () => {
      if (data instanceof Error) throw data;
      return data;
    },
    saveSpec: async () => {},
    updateSpec: async (id) => {
      rec?.updated.push(id);
    },
    watch: () => {
      watch.n++;
      return () => {
        watch.n--;
      };
    },
  };
}

function registryWith(sources: Record<string, SpecSource>): SidecarRegistry {
  return new SidecarRegistry({
    createConnection: (conn, deps) =>
      new SidecarConnection(conn, { ...deps, source: sources[conn.id] }),
  });
}

const conn = (id: string, applyToAllSites = false): Connection => ({
  id,
  baseUrl: `http://127.0.0.1:300${id}`,
  token: `tok-${id}`,
  applyToAllSites,
});

describe("SidecarRegistry routing", () => {
  it("routes each origin to only the project whose domains match it", async () => {
    const watch = { n: 0 };
    const sources = {
      a: fakeSource(resp("Project A", ["a.test"], "a-spec"), watch),
      b: fakeSource(resp("Project B", ["b.test"], "b-spec"), watch),
    };
    const r = registryWith(sources);
    await r.reestablish([conn("a"), conn("b")], false);

    const a = r.specsForOrigin("https://a.test");
    expect(a.specs.map((s) => s.id)).toEqual(["a-spec"]);
    expect(a.specs[0]?.project).toBe("Project A");

    const b = r.specsForOrigin("https://b.test");
    expect(b.specs.map((s) => s.id)).toEqual(["b-spec"]);

    // No cross-origin leak: an unrelated origin gets nothing.
    expect(r.specsForOrigin("https://evil.test").specs).toEqual([]);
  });

  it("an empty-domains project matches a page only when applyToAllSites is set", async () => {
    const watch = { n: 0 };
    // Both connections have empty domains; only 'on' opts in.
    const r = registryWith({
      off: fakeSource(resp("Off", [], "off-spec"), watch),
      on: fakeSource(resp("On", [], "on-spec"), watch),
    });
    await r.reestablish([conn("off", false), conn("on", true)], false);

    const specs = r.specsForOrigin("https://anything.test").specs;
    expect(specs.map((s) => s.id)).toEqual(["on-spec"]);
  });

  it("isolates a failing connection: others still serve specs", async () => {
    const watch = { n: 0 };
    const r = registryWith({
      bad: fakeSource(new Error("sidecar down"), watch),
      good: fakeSource(resp("Good", ["good.test"], "good-spec"), watch),
    });
    await r.reestablish([conn("bad"), conn("good")], false);

    // The bad connection reports an error but does not abort the good one.
    const statuses = r.statuses();
    expect(statuses.find((s) => s.id === "bad")?.connected).toBe(false);
    expect(statuses.find((s) => s.id === "bad")?.error).toBeTruthy();
    expect(r.specsForOrigin("https://good.test").specs.map((s) => s.id)).toEqual(["good-spec"]);
  });

  it("surfaces a SidecarError's details as errorDetail (plain errors leave it undefined)", async () => {
    const watch = { n: 0 };
    const r = registryWith({
      typed: fakeSource(
        new SidecarError(500, "load_failed", ["no manifest.json in /x (point --dir at .specs)"]),
        watch,
      ),
      plain: fakeSource(new Error("sidecar down"), watch),
    });
    await r.reestablish([conn("typed"), conn("plain")], false);

    const typed = r.statuses().find((s) => s.id === "typed");
    expect(typed?.error).toBe("load_failed");
    expect(typed?.errorDetail).toBe("no manifest.json in /x (point --dir at .specs)");

    // A non-SidecarError carries no structured detail.
    const plain = r.statuses().find((s) => s.id === "plain");
    expect(plain?.error).toBeTruthy();
    expect(plain?.errorDetail).toBeUndefined();
  });

  it("never exposes the token in a connection status", async () => {
    const r = registryWith({ a: fakeSource(resp("A", ["a.test"]), { n: 0 }) });
    await r.reestablish([conn("a")], false);
    const serialized = JSON.stringify(r.statuses());
    expect(serialized).not.toContain("tok-a");
    expect(serialized).not.toMatch(/token/i);
  });

  it("counts Manual-import specs across batches (not part of statuses())", () => {
    const r = registryWith({});
    expect(r.manualSpecCount()).toBe(0);
    r.setLocalBatches([batch("1", resp("Manual", [], "m-spec"))]);
    // Manual specs are real content but are not a connection.
    expect(r.statuses()).toEqual([]);
    expect(r.manualSpecCount()).toBe(1);
    r.clearLocalSpecs();
    expect(r.manualSpecCount()).toBe(0);
  });
});

describe("SidecarRegistry manual batches", () => {
  it("each batch contributes only to origins its domains cover", () => {
    const r = registryWith({});
    r.setLocalBatches([
      batch("1", resp("A", ["a.test"], "a-spec")),
      batch("2", resp("B", ["b.test"], "b-spec")),
    ]);
    expect(r.specsForOrigin("https://a.test").specs.map((s) => s.id)).toEqual(["a-spec"]);
    expect(r.specsForOrigin("https://b.test").specs.map((s) => s.id)).toEqual(["b-spec"]);
    expect(r.specsForOrigin("https://other.test").specs).toEqual([]);
  });

  it("an empty-domains batch matches every origin (page-owned match-all)", () => {
    const r = registryWith({});
    r.setLocalBatches([batch("1", resp("All", [], "all-spec"))]);
    expect(r.specsForOrigin("https://anything.test").specs.map((s) => s.id)).toEqual(["all-spec"]);
  });

  it("dedupes a repeated spec id across batches (first batch wins)", () => {
    const r = registryWith({});
    r.setLocalBatches([
      batch("1", resp("First", [], "dup")),
      batch("2", resp("Second", [], "dup")),
    ]);
    const specs = r.specsForOrigin("https://x.test").specs;
    expect(specs).toHaveLength(1);
    expect(specs[0]?.project).toBe("First");
    // The second batch's specs still count toward the total (it is loaded).
    expect(r.manualSpecCount()).toBe(2);
  });

  it("sums manualSpecCount across batches and reports hasContent", () => {
    const r = registryWith({});
    r.setLocalBatches([batch("1", resp("A", [], "a")), batch("2", resp("B", [], "b"))]);
    expect(r.manualSpecCount()).toBe(2);
    expect(r.hasContent()).toBe(true);
  });

  it("setLocalBatches returns false (no broadcast) when the list is unchanged", () => {
    const r = registryWith({});
    const list = [batch("1", resp("A", [], "a"))];
    expect(r.setLocalBatches(list)).toBe(true);
    // Same ids + spec counts -> sameBatchList -> no change.
    expect(r.setLocalBatches([batch("1", resp("A", [], "a"))])).toBe(false);
    // A different id is a real change.
    expect(r.setLocalBatches([batch("2", resp("A", [], "a"))])).toBe(true);
  });

  it("setLocalBatches detects a rename (same id + spec count, changed project/domains)", () => {
    const r = registryWith({});
    expect(r.setLocalBatches([batch("1", resp("A", ["a.test"], "a"))])).toBe(true);
    // Same id + spec count, but the project and domains changed -> a real change.
    expect(r.setLocalBatches([batch("1", resp("A renamed", ["b.test"], "a"))])).toBe(true);
    // The live list now reflects the rename.
    expect(r.manualBatchSummaries()[0]).toMatchObject({
      project: "A renamed",
      domains: ["b.test"],
    });
  });

  it("clearLocalSpecs empties the list and is a no-op when already empty", () => {
    const r = registryWith({});
    expect(r.clearLocalSpecs()).toBe(false);
    r.setLocalBatches([batch("1", resp("A", [], "a"))]);
    expect(r.clearLocalSpecs()).toBe(true);
    expect(r.manualSpecCount()).toBe(0);
  });

  it("manualBatchSummaries reports metadata without a specs payload", () => {
    const r = registryWith({});
    r.setLocalBatches([batch("1", resp("A", ["a.test"], "a"))]);
    const summaries = r.manualBatchSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: "1",
      project: "A",
      domains: ["a.test"],
      specCount: 1,
    });
    expect(summaries[0]).not.toHaveProperty("specs");
  });

  it("a disabled batch serves no page but stays in the summaries", () => {
    const r = registryWith({});
    r.setLocalBatches([{ ...batch("1", resp("A", ["a.test"], "a")), enabled: false }]);
    // Withheld from rendering even though its domain matches.
    expect(r.specsForOrigin("https://a.test").specs).toEqual([]);
    // Still listed (re-enableable), with enabled=false reported.
    const summaries = r.manualBatchSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: "1", enabled: false });
  });

  it("manualBatchSummaries reports enabled=true for a batch with no flag", () => {
    const r = registryWith({});
    r.setLocalBatches([batch("1", resp("A", ["a.test"], "a"))]);
    expect(r.manualBatchSummaries()[0]?.enabled).toBe(true);
  });
});

describe("SidecarRegistry sidecarBatchesForExport", () => {
  it("exports the connection named by id from its live cache", async () => {
    const r = registryWith({
      a: fakeSource(resp("Project A", ["a.test"], "a-spec"), { n: 0 }),
      b: fakeSource(resp("Project B", ["b.test"], "b-spec"), { n: 0 }),
    });
    await r.reestablish([conn("a"), conn("b")], false);
    const out = r.sidecarBatchesForExport({ id: "a" });
    expect(out).toHaveLength(1);
    expect(out[0]?.project).toBe("Project A");
    expect(out[0]?.specs.specs.map((s) => s.id)).toEqual(["a-spec"]);
  });

  it("exports only the connections serving an origin", async () => {
    const r = registryWith({
      a: fakeSource(resp("Project A", ["a.test"], "a-spec"), { n: 0 }),
      b: fakeSource(resp("Project B", ["b.test"], "b-spec"), { n: 0 }),
    });
    await r.reestablish([conn("a"), conn("b")], false);
    const out = r.sidecarBatchesForExport({ origin: "https://a.test" });
    expect(out.map((o) => o.project)).toEqual(["Project A"]);
  });

  it("omits a connection with no cache (down / never loaded)", async () => {
    const r = registryWith({
      bad: fakeSource(new Error("sidecar down"), { n: 0 }),
    });
    await r.reestablish([conn("bad")], false);
    expect(r.sidecarBatchesForExport({ id: "bad" })).toEqual([]);
    expect(r.sidecarBatchesForExport({ origin: "https://bad.test" })).toEqual([]);
  });
});

describe("findDuplicateBatches", () => {
  it("flags a prior batch with the same normalized project (trim + case-insensitive)", () => {
    const existing = [batch("1", resp("  Acme CRM ", [], "x"))];
    const dups = findDuplicateBatches(resp("acme crm", [], "y"), existing);
    expect(dups.map((d) => d.id)).toEqual(["1"]);
    expect(dups[0]?.project).toBe("  Acme CRM ");
  });

  it("never flags an untitled (empty project) bundle", () => {
    const existing = [batch("1", resp("", [], "x"))];
    expect(findDuplicateBatches(resp("", [], "y"), existing)).toEqual([]);
  });

  it("counts overlapping spec ids for the warning text", () => {
    const existing = [batch("1", resp("A", [], "shared"))];
    const dups = findDuplicateBatches(resp("A", [], "shared"), existing);
    expect(dups[0]?.overlapSpecIds).toBe(1);
    const noOverlap = findDuplicateBatches(resp("A", [], "different"), existing);
    expect(noOverlap[0]?.overlapSpecIds).toBe(0);
  });
});

describe("SidecarRegistry watch re-establish (RT-FM1)", () => {
  it("restarts watches for a single connection after a simulated SW wake", async () => {
    const watch = { n: 0 };
    const sources = { a: fakeSource(resp("A", ["a.test"]), watch) };
    // A fresh registry models the SW re-evaluating after suspend (state lost).
    const r = registryWith(sources);
    await r.reestablish([conn("a")], true);
    expect(watch.n).toBe(1);
  });

  it("restarts watches for N connections after a simulated SW wake", async () => {
    const watch = { n: 0 };
    const r = registryWith({
      a: fakeSource(resp("A", ["a.test"]), watch),
      b: fakeSource(resp("B", ["b.test"]), watch),
      c: fakeSource(resp("C", ["c.test"]), watch),
    });
    await r.reestablish([conn("a"), conn("b"), conn("c")], true);
    expect(watch.n).toBe(3);

    // Re-establishing again must not double-subscribe (startWatch stops first).
    await r.reestablish([conn("a"), conn("b"), conn("c")], true);
    expect(watch.n).toBe(3);
  });
});

describe("SidecarConnection.update (edit endpoint)", () => {
  it("applies a new baseUrl and label when the source is not injected", () => {
    // No deps.source -> a live (non-injected) client/source, so the endpoint
    // change is actually applied (assertions below prove baseUrl was swapped).
    const c = new SidecarConnection(conn("1"));
    c.update({
      ...conn("1"),
      baseUrl: "http://127.0.0.1:9999",
      token: "tok-new",
      label: "Renamed",
    });
    expect(c.baseUrl).toBe("http://127.0.0.1:9999");
    expect(c.label).toBe("Renamed");
  });

  it("keeps the injected test source but still updates label and opt-in", () => {
    const c = new SidecarConnection(conn("1"), {
      source: fakeSource(resp("A", ["a.test"]), { n: 0 }),
    });
    // The endpoint stays bound to the injected seam (URL unchanged), but the
    // lightweight fields still apply.
    c.update({
      ...conn("1"),
      baseUrl: "http://127.0.0.1:9999",
      label: "Renamed",
      applyToAllSites: true,
    });
    expect(c.baseUrl).toBe("http://127.0.0.1:3001");
    expect(c.label).toBe("Renamed");
    expect(c.applyToAllSites).toBe(true);
  });

  // The endpoint-edit handler re-validates via registry.reconnect(); this guards
  // its watch lifecycle: the old SSE watch must be torn down and a fresh one
  // started (net one live watch), never leaked or left as a stale no-op.
  it("reconnect cycles the watch without leaking the old one (endpoint-edit path)", async () => {
    const watch = { n: 0 };
    const r = registryWith({ a: fakeSource(resp("A", ["a.test"]), watch) });
    await r.reestablish([conn("a")], true);
    expect(watch.n).toBe(1);

    await r.reconnect("a", true);
    expect(watch.n).toBe(1); // stopped (->0) then restarted (->1), no leak/no-op

    // When watching is disabled the reconnect must drop the watch, not keep it.
    await r.reconnect("a", false);
    expect(watch.n).toBe(0);
  });
});

describe("SidecarConnection.status while disconnected", () => {
  /** Source that loads canned specs until `state.fail` is flipped, then throws. */
  function flakySource(domains: string[], state: { fail: boolean }): SpecSource {
    return {
      id: "sidecar",
      isAvailable: async () => true,
      loadSpecs: async () => {
        if (state.fail) throw new SidecarError(500, "load_failed", []);
        return resp("Acme", domains);
      },
      saveSpec: async () => {},
      updateSpec: async () => {},
    };
  }

  it("retains the last-known domains so a domain-pinned project still scopes to its page when down", async () => {
    const state = { fail: false };
    const c = new SidecarConnection(conn("1"), { source: flakySource(["acme.test"], state) });
    await c.reload();
    expect(c.status().connected).toBe(true);
    expect(c.status().domains).toEqual(["acme.test"]);

    // Sidecar goes down: reload fails and clears the live cache.
    state.fail = true;
    await c.reload();
    const s = c.status();
    expect(s.connected).toBe(false);
    expect(s.domains).toEqual(["acme.test"]); // retained, not wiped to []
    // A domain-pinned project must not flip to match-all while it is down.
    expect(s.matchesAllSites).toBe(false);
  });
});

describe("SidecarRegistry.updateSpec routing", () => {
  const editedSpec = (id: string): Spec => resp("X", [], id).specs[0] as unknown as Spec;

  it("routes an update to the connection serving the origin", async () => {
    const recA = { updated: [] as string[] };
    const recB = { updated: [] as string[] };
    const r = registryWith({
      a: fakeSource(resp("A", ["a.test"], "a-spec"), { n: 0 }, recA),
      b: fakeSource(resp("B", ["b.test"], "b-spec"), { n: 0 }, recB),
    });
    await r.reestablish([conn("a"), conn("b")], false);

    const res = await r.updateSpec("https://a.test", "a-spec", editedSpec("a-spec"));
    expect(res.ok).toBe(true);
    expect(recA.updated).toEqual(["a-spec"]);
    expect(recB.updated).toEqual([]);
  });

  it("selects the connection by connectionId when several serve the origin", async () => {
    const recA = { updated: [] as string[] };
    const recB = { updated: [] as string[] };
    const r = registryWith({
      a: fakeSource(resp("A", [], "spec"), { n: 0 }, recA),
      b: fakeSource(resp("B", [], "spec"), { n: 0 }, recB),
    });
    // Both opt in to all sites so both serve the origin; connectionId disambiguates.
    await r.reestablish([conn("a", true), conn("b", true)], false);

    const res = await r.updateSpec("https://any.test", "spec", editedSpec("spec"), "b");
    expect(res.ok).toBe(true);
    expect(recA.updated).toEqual([]);
    expect(recB.updated).toEqual(["spec"]);
  });

  it("rejects when no connected project serves the origin", async () => {
    const r = registryWith({ a: fakeSource(resp("A", ["a.test"]), { n: 0 }) });
    await r.reestablish([conn("a")], false);

    const res = await r.updateSpec("https://evil.test", "spec", editedSpec("spec"));
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(["no connected project serves this page"]);
  });

  it("surfaces a source error as a failed result", async () => {
    const r = new SidecarRegistry({
      createConnection: (c, deps) =>
        new SidecarConnection(c, {
          ...deps,
          source: {
            id: "sidecar",
            isAvailable: async () => true,
            loadSpecs: async () => resp("A", ["a.test"]),
            saveSpec: async () => {},
            updateSpec: async () => {
              throw new Error("boom");
            },
            watch: () => () => {},
          },
        }),
    });
    await r.reestablish([conn("a")], false);

    const res = await r.updateSpec("https://a.test", "spec", editedSpec("spec"));
    expect(res.ok).toBe(false);
    expect(res.errors?.[0]).toContain("boom");
  });
});

describe("SidecarRegistry per-project enable/disable", () => {
  const disabled = (id: string): Connection => ({ ...conn(id), enabled: false });

  it("a disabled connection contributes no specs even when its domains match", async () => {
    const watch = { n: 0 };
    const r = registryWith({
      a: fakeSource(resp("Project A", ["a.test"], "a-spec"), watch),
    });
    await r.reestablish([disabled("a")], false);
    expect(r.specsForOrigin("https://a.test").specs).toEqual([]);
  });

  it("a disabled connection contributes no team-hidden facets", async () => {
    const watch = { n: 0 };
    const r = registryWith({
      a: fakeSource(resp("Project A", ["a.test"], "a-spec"), watch),
    });
    await r.reestablish([disabled("a")], false);
    expect(r.teamHiddenForOrigin("https://a.test")).toEqual([]);
  });

  it("reports the enabled flag in statuses()", async () => {
    const watch = { n: 0 };
    const r = registryWith({
      on: fakeSource(resp("On", ["a.test"], "on-spec"), watch),
      off: fakeSource(resp("Off", ["a.test"], "off-spec"), watch),
    });
    await r.reestablish([conn("on"), disabled("off")], false);
    const byId = Object.fromEntries(r.statuses().map((s) => [s.id, s.enabled]));
    expect(byId).toEqual({ on: true, off: false });
  });

  it("setConnectionEnabled stops the watch when disabling and restarts it when enabling", async () => {
    const watch = { n: 0 };
    const r = registryWith({ a: fakeSource(resp("A", ["a.test"], "a-spec"), watch) });
    await r.reestablish([conn("a")], true);
    expect(watch.n).toBe(1);

    // Disabling tears down the live SSE watch.
    await r.setConnectionEnabled("a", false, true);
    expect(watch.n).toBe(0);

    // Re-enabling restores it (global switch on).
    await r.setConnectionEnabled("a", true, true);
    expect(watch.n).toBe(1);
  });

  it("re-enabling does not start a watch when the global switch is off", async () => {
    const watch = { n: 0 };
    const r = registryWith({ a: fakeSource(resp("A", ["a.test"], "a-spec"), watch) });
    await r.reestablish([disabled("a")], false);
    expect(watch.n).toBe(0);

    await r.setConnectionEnabled("a", true, false);
    expect(watch.n).toBe(0);
    // Specs are reachable again once enabled, watch or not.
    expect(r.specsForOrigin("https://a.test").specs.map((s) => s.id)).toEqual(["a-spec"]);
  });
});
