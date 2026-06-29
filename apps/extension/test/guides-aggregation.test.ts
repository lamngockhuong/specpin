import type { GuidesConfig, SpecsResponse } from "@specpin/api-client";
import type { GuideDef } from "@specpin/spec-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { SidecarConnection } from "../src/background/sidecar-connection.js";
import { SidecarRegistry } from "../src/background/sidecar-registry.js";
import {
  canonicalOrigin,
  GUIDES_KEY,
  getPersonalGuides,
  type LocalSpecsState,
  MAX_GUIDES_PER_BATCH,
  type ManualBatch,
  removeLocalGuide,
  setPersonalGuides,
  upsertLocalGuide,
} from "../src/shared/config.js";
import { localConnId } from "../src/shared/local-id.js";
import { PRIVILEGED_MESSAGE_TYPES } from "../src/shared/messaging.js";
import { trustedReadOrigin } from "../src/shared/origin-match.js";
import type { SpecSource } from "../src/sources/source.js";

function guide(id: string, name = id, steps: string[] = []): GuideDef {
  return { id, name, steps };
}

function resp(project: string, domains: string[]): SpecsResponse {
  return {
    manifest: { version: "1.0", project, domains, specFiles: [] },
    specs: [],
  } as unknown as SpecsResponse;
}

/** Fake source that serves canned specs + a canned guides config. */
function guideSource(specs: SpecsResponse, guides: GuidesConfig): SpecSource {
  return {
    id: "sidecar",
    isAvailable: async () => true,
    loadSpecs: async () => specs,
    saveSpec: async () => {},
    updateSpec: async () => {},
    loadGuides: async () => guides,
    saveGuides: async () => {},
  };
}

function registryWith(sources: Record<string, SpecSource>): SidecarRegistry {
  return new SidecarRegistry({
    createConnection: (conn, deps) =>
      new SidecarConnection(conn, { ...deps, source: sources[conn.id] }),
  });
}

const conn = (id: string, applyToAllSites = false) => ({
  id,
  baseUrl: `http://127.0.0.1:300${id}`,
  token: `tok-${id}`,
  applyToAllSites,
});

function localBatch(
  id: string,
  project: string,
  domains: string[],
  guides: GuideDef[],
): ManualBatch {
  return {
    id,
    label: project,
    source: "manual",
    importedAt: 0,
    guides,
    specs: { manifest: { version: "1.0", project, domains, specFiles: [] }, specs: [] },
  };
}

describe("registry.guidesForOrigin (team aggregation)", () => {
  it("returns a sidecar connection's guides tagged team + project + connectionId, only for matching origins", async () => {
    const r = registryWith({
      a: guideSource(resp("Project A", ["a.test"]), {
        version: "1.0",
        guides: [guide("onboarding", "Onboarding")],
      }),
    });
    await r.reestablish([conn("a")], false);

    const got = r.guidesForOrigin("https://a.test");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      id: "onboarding",
      scope: "team",
      project: "Project A",
      connectionId: "a",
    });
    // Origin boundary: an unrelated page sees no guides.
    expect(r.guidesForOrigin("https://evil.test")).toEqual([]);
  });

  it("includes a local committed batch's guides, tagged manual:<batchId>", () => {
    const r = registryWith({});
    r.setLocalBatches([localBatch("b1", "Local", ["loc.test"], [guide("tour")])]);
    const got = r.guidesForOrigin("https://loc.test");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: "tour", scope: "team", connectionId: localConnId("b1") });
    // A local batch that does not serve the origin contributes nothing.
    expect(r.guidesForOrigin("https://other.test")).toEqual([]);
  });

  it("a guides-only refresh updates the cache (loadGuides is in the reload group, RT-M3)", async () => {
    let guides: GuidesConfig = { version: "1.0", guides: [] };
    const src: SpecSource = {
      id: "sidecar",
      isAvailable: async () => true,
      loadSpecs: async () => resp("A", ["a.test"]),
      saveSpec: async () => {},
      updateSpec: async () => {},
      loadGuides: async () => guides,
      saveGuides: async () => {},
    };
    const r = new SidecarRegistry({
      createConnection: (c, deps) => new SidecarConnection(c, { ...deps, source: src }),
    });
    await r.reestablish([conn("a")], false);
    expect(r.guidesForOrigin("https://a.test")).toEqual([]);

    // A guides-only change lands; a reload (what an SSE change triggers) picks it up.
    guides = { version: "1.0", guides: [guide("new")] };
    await r.reload("a");
    expect(r.guidesForOrigin("https://a.test").map((g) => g.id)).toEqual(["new"]);
  });

  it("a sidecar without /guides (loadGuides absent) yields no team guides but keeps specs", async () => {
    const r = new SidecarRegistry({
      createConnection: (c, deps) =>
        new SidecarConnection(c, {
          ...deps,
          source: {
            id: "sidecar",
            isAvailable: async () => true,
            loadSpecs: async () => resp("A", ["a.test"]),
            saveSpec: async () => {},
            updateSpec: async () => {},
          },
        }),
    });
    await r.reestablish([conn("a")], false);
    expect(r.guidesForOrigin("https://a.test")).toEqual([]);
    expect(r.getGuides("a")).toEqual({ version: "1.0", guides: [] });
  });
});

describe("personal guides storage (storage.sync, per-origin)", () => {
  beforeEach(() => fakeBrowser.reset());

  it("round-trips guides keyed by canonical origin", async () => {
    await setPersonalGuides("https://app.test", [guide("p1")]);
    expect((await getPersonalGuides("https://app.test")).map((g) => g.id)).toEqual(["p1"]);
    // A different origin is isolated.
    expect(await getPersonalGuides("https://other.test")).toEqual([]);
  });

  it("uses the canonical origin so path/query variants share one entry", async () => {
    await setPersonalGuides("https://app.test/some/path?x=1", [guide("p1")]);
    expect((await getPersonalGuides("https://app.test")).map((g) => g.id)).toEqual(["p1"]);
  });

  it("drops the whole key when the last origin empties", async () => {
    await setPersonalGuides("https://app.test", [guide("p1")]);
    await setPersonalGuides("https://app.test", []);
    const stored = await fakeBrowser.storage.sync.get(GUIDES_KEY);
    expect(stored[GUIDES_KEY]).toBeUndefined();
  });

  it("rejects a malformed origin on write and yields [] on read (RT-H2)", async () => {
    await expect(setPersonalGuides("not a url", [guide("x")])).rejects.toThrow(/invalid origin/);
    expect(await getPersonalGuides("not a url")).toEqual([]);
  });

  it("canonicalOrigin normalizes and rejects garbage", () => {
    expect(canonicalOrigin("https://app.test/x")).toBe("https://app.test");
    expect(canonicalOrigin("nonsense")).toBeNull();
    expect(canonicalOrigin("")).toBeNull();
  });
});

describe("local guide mutators", () => {
  const base: LocalSpecsState = { batches: [localBatch("b1", "P", ["p.test"], [])] };

  it("upserts a guide by id (replace, not duplicate)", () => {
    const once = upsertLocalGuide(base, "b1", guide("g", "First")).state as LocalSpecsState;
    const twice = upsertLocalGuide(once, "b1", guide("g", "Second"));
    const b = twice.state?.batches[0] as ManualBatch;
    expect(b.guides).toHaveLength(1);
    expect(b.guides?.[0]?.name).toBe("Second");
  });

  it("rejects an unknown batch id", () => {
    expect(upsertLocalGuide(base, "nope", guide("g")).ok).toBe(false);
  });

  it("rejects an append past MAX_GUIDES_PER_BATCH", () => {
    const packed = localBatch(
      "b1",
      "P",
      [],
      Array.from({ length: MAX_GUIDES_PER_BATCH }, (_, i) => guide(`g${i}`)),
    );
    const r = upsertLocalGuide({ batches: [packed] }, "b1", guide("extra"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limit/i);
  });

  it("removes a guide by id and drops the array when empty", () => {
    const seeded = upsertLocalGuide(base, "b1", guide("g")).state as LocalSpecsState;
    const r = removeLocalGuide(seeded, "b1", "g");
    expect((r.state?.batches[0] as ManualBatch).guides).toBeUndefined();
    // Absent id is a tolerated no-op.
    expect(removeLocalGuide(seeded, "b1", "missing").ok).toBe(true);
  });
});

describe("guide message gating", () => {
  it("gates all guide mutations behind PRIVILEGED_MESSAGE_TYPES, but not the read", () => {
    expect(PRIVILEGED_MESSAGE_TYPES.has("SAVE_TEAM_GUIDE")).toBe(true);
    expect(PRIVILEGED_MESSAGE_TYPES.has("SAVE_PERSONAL_GUIDE")).toBe(true);
    expect(PRIVILEGED_MESSAGE_TYPES.has("DELETE_GUIDE")).toBe(true);
    // The read is origin-gated in the handler (trusted sender), not via the set.
    expect(PRIVILEGED_MESSAGE_TYPES.has("GET_GUIDES_FOR_ORIGIN")).toBe(false);
  });
});

// RT-C1: the trust rule that stops a web content script from reading another
// origin's PRIVATE personal guides. This is the most security-critical line in
// the read path, so it gets its own regression guard.
describe("trustedReadOrigin (RT-C1)", () => {
  it("pins a web content script to its own tab origin, ignoring a spoofed payload", () => {
    // A malicious content script claims to be evil.test's neighbour but its
    // browser-set tab url is a.test: the payload origin must be discarded.
    expect(
      trustedReadOrigin({
        fromExtensionPage: false,
        payloadOrigin: "https://evil.test",
        senderTabUrl: "https://a.test/some/path",
      }),
    ).toBe("https://a.test");
  });

  it("honors the payload origin from a trusted extension page (popup/side panel)", () => {
    expect(
      trustedReadOrigin({
        fromExtensionPage: true,
        payloadOrigin: "https://app.test",
        senderTabUrl: undefined,
      }),
    ).toBe("https://app.test");
  });

  it("returns '' when a content script has no usable tab url", () => {
    expect(
      trustedReadOrigin({ fromExtensionPage: false, payloadOrigin: "x", senderTabUrl: undefined }),
    ).toBe("");
    expect(
      trustedReadOrigin({ fromExtensionPage: false, payloadOrigin: "x", senderTabUrl: "garbage" }),
    ).toBe("");
  });
});
