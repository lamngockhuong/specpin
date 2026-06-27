import { SidecarError, type SpecsResponse } from "@specpin/api-client";
import { describe, expect, it } from "vitest";
import { SidecarConnection } from "../src/background/sidecar-connection.js";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import type { Connection } from "../src/shared/connection-types.js";
import type { SpecSource } from "../src/sources/source.js";

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
function fakeSource(data: SpecsResponse | Error, watch: { n: number }): SpecSource {
  return {
    id: "sidecar",
    isAvailable: async () => true,
    loadSpecs: async () => {
      if (data instanceof Error) throw data;
      return data;
    },
    saveSpec: async () => {},
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

  it("counts Manual-import specs (not part of statuses())", () => {
    const r = registryWith({});
    expect(r.manualSpecCount()).toBe(0);
    r.setLocalSpecs(resp("Manual", [], "m-spec"), 1);
    // Manual specs are real content but are not a connection.
    expect(r.statuses()).toEqual([]);
    expect(r.manualSpecCount()).toBe(1);
    r.setLocalSpecs(null, 2);
    expect(r.manualSpecCount()).toBe(0);
  });

  it("clears the manual bundle authoritatively and resets the guard for a later reload", () => {
    const r = registryWith({});
    expect(r.clearLocalSpecs()).toBe(false); // nothing held -> no-op
    r.setLocalSpecs(resp("Manual", [], "m-spec"), 100);
    expect(r.manualSpecCount()).toBe(1);
    // Storage-truth clear always wins regardless of seq (it is not a concurrent write).
    expect(r.clearLocalSpecs()).toBe(true);
    expect(r.manualSpecCount()).toBe(0);
    // Guard reset: a later reload of any seq re-applies (no stale-seq rejection).
    expect(r.setLocalSpecs(resp("Manual", [], "m2"), 50)).toBe(true);
    expect(r.manualSpecCount()).toBe(1);
  });

  it("setLocalSpecs still drops an out-of-order concurrent write (seq guard)", () => {
    const r = registryWith({});
    r.setLocalSpecs(resp("Manual", [], "m-spec"), 5);
    expect(r.setLocalSpecs(resp("Manual", [], "m2"), 3)).toBe(false); // stale -> dropped
    expect(r.manualSpecCount()).toBe(1);
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
