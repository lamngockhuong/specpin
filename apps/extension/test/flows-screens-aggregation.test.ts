import type { FlowsConfig, ScreensConfig, SpecsResponse } from "@specpin/api-client";
import { describe, expect, it } from "vitest";
import { SidecarConnection } from "../src/background/sidecar-connection.js";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import type { ManualBatch } from "../src/shared/config.js";
import { localConnId } from "../src/shared/local-id.js";
import { PRIVILEGED_MESSAGE_TYPES } from "../src/shared/messaging.js";
import type { SpecSource } from "../src/sources/source.js";

function resp(project: string, domains: string[]): SpecsResponse {
  return {
    manifest: { version: "1.0", project, domains, specFiles: [] },
    specs: [],
  } as unknown as SpecsResponse;
}

const flowsWith = (id: string): FlowsConfig =>
  ({
    version: "1.0",
    flows: [{ id, object: { en: id }, states: [], transitions: [] }],
  }) as unknown as FlowsConfig;

const screensWith = (id: string): ScreensConfig =>
  ({
    version: "1.0",
    screens: [{ id, name: { en: id }, urlGlob: "/*" }],
    transitions: [],
  }) as unknown as ScreensConfig;

function localBatch(
  id: string,
  project: string,
  domains: string[],
  flows?: FlowsConfig,
  screens?: ScreensConfig,
  enabled?: boolean,
): ManualBatch {
  return {
    id,
    label: project,
    source: "manual",
    importedAt: 0,
    flows,
    screens,
    enabled,
    specs: { manifest: { version: "1.0", project, domains, specFiles: [] }, specs: [] },
  };
}

/** Fake source that serves canned specs + canned flows/screens configs. */
function flowsSource(specs: SpecsResponse, flows: FlowsConfig, screens: ScreensConfig): SpecSource {
  return {
    id: "sidecar",
    isAvailable: async () => true,
    loadSpecs: async () => specs,
    saveSpec: async () => {},
    updateSpec: async () => {},
    deleteSpec: async () => {},
    loadFlows: async () => flows,
    loadScreens: async () => screens,
  };
}

function registryWith(sources: Record<string, SpecSource>): SidecarRegistry {
  return new SidecarRegistry({
    createConnection: (conn, deps) =>
      new SidecarConnection(conn, { ...deps, source: sources[conn.id] }),
  });
}

const conn = (id: string) => ({
  id,
  baseUrl: `http://127.0.0.1:300${id}`,
  token: `tok-${id}`,
});

describe("SidecarConnection flows/screens cache", () => {
  it("getFlows/getScreens return the empty default when the source omits loadFlows/loadScreens (old sidecar, 404)", async () => {
    const c = new SidecarConnection(conn("a"), {
      source: {
        id: "sidecar",
        isAvailable: async () => true,
        loadSpecs: async () => resp("A", ["a.test"]),
        saveSpec: async () => {},
        updateSpec: async () => {},
        deleteSpec: async () => {},
      },
    });
    await c.reload();
    // Backward compat: specs still load even though flows/screens 404.
    expect(c.status().connected).toBe(true);
    expect(c.getFlows()).toEqual({ version: "1.0", flows: [] });
    expect(c.getScreens()).toEqual({ version: "1.0", screens: [], transitions: [] });
  });

  it("a flows/screens-only refresh updates the cache (in the reload allSettled group, RT-M3)", async () => {
    let flows: FlowsConfig = { version: "1.0", flows: [] };
    let screens: ScreensConfig = { version: "1.0", screens: [], transitions: [] };
    const src: SpecSource = {
      id: "sidecar",
      isAvailable: async () => true,
      loadSpecs: async () => resp("A", ["a.test"]),
      saveSpec: async () => {},
      updateSpec: async () => {},
      deleteSpec: async () => {},
      loadFlows: async () => flows,
      loadScreens: async () => screens,
    };
    const r = new SidecarRegistry({
      createConnection: (c, deps) => new SidecarConnection(c, { ...deps, source: src }),
    });
    await r.reestablish([conn("a")], false);
    expect(r.flowsScreensByProject()).toEqual([
      { connectionId: "a", project: "A", flows: { version: "1.0", flows: [] }, screens },
    ]);

    // A flows/screens-only change lands; a reload (what an SSE change triggers) picks it up.
    flows = flowsWith("application-status");
    screens = screensWith("checkout");
    await r.reload("a");
    const out = r.flowsScreensByProject();
    expect(out).toHaveLength(1);
    expect(out[0]?.flows.flows.map((f) => f.id)).toEqual(["application-status"]);
    expect(out[0]?.screens.screens.map((s) => s.id)).toEqual(["checkout"]);
  });

  it("a failed specs reload clears the flows/screens caches too", async () => {
    const state = { fail: false };
    const src: SpecSource = {
      id: "sidecar",
      isAvailable: async () => true,
      loadSpecs: async () => {
        if (state.fail) throw new Error("down");
        return resp("A", ["a.test"]);
      },
      saveSpec: async () => {},
      updateSpec: async () => {},
      deleteSpec: async () => {},
      loadFlows: async () => flowsWith("f1"),
      loadScreens: async () => screensWith("s1"),
    };
    const c = new SidecarConnection(conn("a"), { source: src });
    await c.reload();
    expect(c.getFlows().flows.map((f) => f.id)).toEqual(["f1"]);

    state.fail = true;
    await c.reload();
    expect(c.status().connected).toBe(false);
    expect(c.getFlows()).toEqual({ version: "1.0", flows: [] });
    expect(c.getScreens()).toEqual({ version: "1.0", screens: [], transitions: [] });
  });
});

describe("SidecarRegistry.flowsScreensByProject (namespaced by project)", () => {
  it("returns one entry per connection with a live cache, never merging two projects' flows", async () => {
    const r = registryWith({
      a: flowsSource(
        resp("Project A", ["a.test"]),
        flowsWith("application-status"),
        screensWith("home"),
      ),
      b: flowsSource(
        resp("Project B", ["b.test"]),
        flowsWith("application-status"),
        screensWith("cart"),
      ),
    });
    await r.reestablish([conn("a"), conn("b")], false);

    const out = r.flowsScreensByProject();
    expect(out).toHaveLength(2);
    const byProject = Object.fromEntries(out.map((p) => [p.project, p]));
    expect(byProject["Project A"]?.connectionId).toBe("a");
    expect(byProject["Project B"]?.connectionId).toBe("b");
    // Same flow id in both projects, but each keeps its own copy (no merge).
    expect(byProject["Project A"]?.flows.flows[0]?.id).toBe("application-status");
    expect(byProject["Project B"]?.flows.flows[0]?.id).toBe("application-status");
    expect(byProject["Project A"]?.screens.screens[0]?.id).toBe("home");
    expect(byProject["Project B"]?.screens.screens[0]?.id).toBe("cart");
  });

  it("omits a connection with no cache (down / never loaded)", async () => {
    const r = registryWith({
      bad: {
        id: "sidecar",
        isAvailable: async () => true,
        loadSpecs: async () => {
          throw new Error("sidecar down");
        },
        saveSpec: async () => {},
        updateSpec: async () => {},
        deleteSpec: async () => {},
      },
    });
    await r.reestablish([conn("bad")], false);
    expect(r.flowsScreensByProject()).toEqual([]);
  });

  it("is not origin-scoped: every connected project is returned regardless of domains", async () => {
    const r = registryWith({
      a: flowsSource(resp("A", ["a.test"]), flowsWith("f1"), screensWith("s1")),
    });
    await r.reestablish([conn("a")], false);
    expect(r.flowsScreensByProject().map((p) => p.project)).toEqual(["A"]);
  });

  it("includes a manual batch's imported flows/screens, tagged manual:<batchId>", () => {
    const r = registryWith({});
    r.setLocalBatches([
      localBatch("b1", "Local", ["loc.test"], flowsWith("application-status"), screensWith("home")),
    ]);
    const out = r.flowsScreensByProject();
    expect(out).toHaveLength(1);
    expect(out[0]?.connectionId).toBe(localConnId("b1"));
    expect(out[0]?.project).toBe("Local");
    expect(out[0]?.flows.flows.map((f) => f.id)).toEqual(["application-status"]);
    expect(out[0]?.screens.screens.map((s) => s.id)).toEqual(["home"]);
  });

  it("defaults a manual batch with no imported flows/screens to the empty config", () => {
    const r = registryWith({});
    r.setLocalBatches([localBatch("b1", "Local", ["loc.test"])]);
    const out = r.flowsScreensByProject();
    expect(out).toHaveLength(1);
    expect(out[0]?.flows).toEqual({ version: "1.0", flows: [] });
    expect(out[0]?.screens).toEqual({ version: "1.0", screens: [], transitions: [] });
  });

  it("skips a disabled manual batch", () => {
    const r = registryWith({});
    r.setLocalBatches([
      localBatch("b1", "Off", ["loc.test"], flowsWith("f1"), screensWith("s1"), false),
    ]);
    expect(r.flowsScreensByProject()).toEqual([]);
  });
});

describe("GET_FLOWS_SCREENS message gating", () => {
  it("is unprivileged (read-only team config, like GET_TEAM_GUIDES/GET_TEAM_VIEWS)", () => {
    expect(PRIVILEGED_MESSAGE_TYPES.has("GET_FLOWS_SCREENS")).toBe(false);
  });
});
