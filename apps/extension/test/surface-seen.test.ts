import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getSeen } from "../src/shared/config.js";
import type { TaggedSpec } from "../src/shared/connection-types.js";
import {
  computeSeenDigest,
  diffSeen,
  knownProjects,
  markAllSeen,
  mergeSeen,
  type SeenSnapshot,
  seenKey,
  specContentHash,
} from "../src/shared/surface-data.js";

beforeEach(() => {
  fakeBrowser.reset();
});

// Minimal TaggedSpec builder: only the fields the digest reads matter here.
function spec(over: Partial<TaggedSpec> & { id: string; project: string }): TaggedSpec {
  return {
    id: over.id,
    project: over.project,
    connectionId: over.connectionId ?? "c1",
    title: over.title ?? { en: "Title" },
    description: over.description ?? { en: "Body" },
    businessRules: over.businessRules,
    _file: over._file ?? "x.spec.json",
    fingerprint: over.fingerprint ?? ({} as TaggedSpec["fingerprint"]),
  } as TaggedSpec;
}

describe("specContentHash", () => {
  it("is stable for identical content", () => {
    const a = spec({ id: "a", project: "P" });
    const b = spec({ id: "a", project: "P" });
    expect(specContentHash(a)).toBe(specContentHash(b));
  });

  it("ignores locale-object key order", () => {
    const a = spec({ id: "a", project: "P", title: { en: "Hi", vi: "Chao" } });
    const b = spec({ id: "a", project: "P", title: { vi: "Chao", en: "Hi" } });
    expect(specContentHash(a)).toBe(specContentHash(b));
  });

  it("changes when a content field changes in any locale", () => {
    const base = spec({ id: "a", project: "P", title: { en: "Hi", vi: "Chao" } });
    const editedVi = spec({ id: "a", project: "P", title: { en: "Hi", vi: "Xin chao" } });
    expect(specContentHash(editedVi)).not.toBe(specContentHash(base));
  });

  it("ignores non-content fields (_file, tags)", () => {
    const a = spec({ id: "a", project: "P", _file: "one.spec.json", tags: ["x"] });
    const b = spec({ id: "a", project: "P", _file: "two.spec.json", tags: ["y", "z"] });
    expect(specContentHash(a)).toBe(specContentHash(b));
  });

  it("reflects a business-rule edit and their order", () => {
    const base = spec({ id: "a", project: "P", businessRules: [{ en: "r1" }, { en: "r2" }] });
    const edited = spec({ id: "a", project: "P", businessRules: [{ en: "r1" }, { en: "r2!" }] });
    const reordered = spec({ id: "a", project: "P", businessRules: [{ en: "r2" }, { en: "r1" }] });
    expect(specContentHash(edited)).not.toBe(specContentHash(base));
    expect(specContentHash(reordered)).not.toBe(specContentHash(base));
  });
});

describe("diffSeen", () => {
  const snapshot = (...specs: TaggedSpec[]): SeenSnapshot => {
    const s: SeenSnapshot = {};
    for (const sp of specs) s[seenKey(sp)] = specContentHash(sp);
    return s;
  };

  it("buckets added / edited / unchanged", () => {
    const kept = spec({ id: "kept", project: "P", title: { en: "same" } });
    const before = spec({ id: "ed", project: "P", title: { en: "old" } });
    const after = spec({ id: "ed", project: "P", title: { en: "new" } });
    const fresh = spec({ id: "fresh", project: "P" });
    const snap = snapshot(kept, before);

    const diff = diffSeen([kept, after, fresh], snap);
    expect(diff.added.map((s) => s.id)).toEqual(["fresh"]);
    expect(diff.edited.map((s) => s.id)).toEqual(["ed"]);
    expect(diff.removed).toEqual([]);
  });

  it("reports a removed spec only for a project present on the page", () => {
    const a1 = spec({ id: "a1", project: "A" });
    const a2 = spec({ id: "a2", project: "A" });
    const b1 = spec({ id: "b1", project: "B" });
    const snap = snapshot(a1, a2, b1);

    // Page shows only project A's a1: a2 is a real removal; b1 is just off-page.
    const diff = diffSeen([a1], snap);
    expect(diff.removed).toEqual([seenKey(a2)]);
  });

  it("keeps one project's edits from blurring another (per-project keys)", () => {
    const aOld = spec({ id: "x", project: "A", title: { en: "old" } });
    const bSame = spec({ id: "x", project: "B", title: { en: "keep" } });
    const snap = snapshot(aOld, bSame);
    const aNew = spec({ id: "x", project: "A", title: { en: "new" } });

    const diff = diffSeen([aNew, bSame], snap);
    expect(diff.edited.map((s) => s.project)).toEqual(["A"]);
    expect(diff.added).toEqual([]);
  });
});

describe("mergeSeen", () => {
  it("refreshes on-page projects while preserving other projects' entries", () => {
    const a = spec({ id: "a", project: "A", title: { en: "old" } });
    const b = spec({ id: "b", project: "B" });
    const prev: SeenSnapshot = {
      [seenKey(a)]: specContentHash(a),
      [seenKey(b)]: specContentHash(b),
    };

    const aNew = spec({ id: "a", project: "A", title: { en: "new" } });
    const next = mergeSeen(prev, [aNew]);

    // A's hash updated to the new content; B (off-page) untouched.
    expect(next[seenKey(aNew)]).toBe(specContentHash(aNew));
    expect(next[seenKey(b)]).toBe(prev[seenKey(b)]);
  });

  it("drops a stale key for an on-page project (removal is marked seen)", () => {
    const a1 = spec({ id: "a1", project: "A" });
    const a2 = spec({ id: "a2", project: "A" });
    const prev: SeenSnapshot = {
      [seenKey(a1)]: specContentHash(a1),
      [seenKey(a2)]: specContentHash(a2),
    };
    const next = mergeSeen(prev, [a1]);
    expect(next[seenKey(a1)]).toBeDefined();
    expect(next[seenKey(a2)]).toBeUndefined();
  });
});

describe("knownProjects", () => {
  it("returns the distinct projects present in the snapshot", () => {
    const a = spec({ id: "a", project: "A" });
    const b = spec({ id: "b", project: "B" });
    const snap: SeenSnapshot = { [seenKey(a)]: "1", [seenKey(b)]: "2" };
    expect(knownProjects(snap)).toEqual(new Set(["A", "B"]));
  });
});

// Storage-backed orchestration (getSeen/setSeen via fakeBrowser). Gates the
// acceptance-critical "silent first visit" and "Mark all seen" behaviors.
describe("computeSeenDigest (seed-then-diff)", () => {
  it("returns null when off or there are no specs", async () => {
    expect(await computeSeenDigest([spec({ id: "a", project: "P" })], false)).toBeNull();
    expect(await computeSeenDigest([], true)).toBeNull();
  });

  it("seeds silently on the first-ever visit (empty snapshot, no changes reported)", async () => {
    const specs = [spec({ id: "a", project: "P" }), spec({ id: "b", project: "P" })];
    const diff = await computeSeenDigest(specs, true);
    expect(diff).not.toBeNull();
    expect(diff?.added).toEqual([]);
    expect(diff?.edited).toEqual([]);
    // The snapshot was persisted so a later edit can be detected.
    expect(Object.keys(await getSeen())).toHaveLength(2);
  });

  it("reports a spec added to an already-known project as new", async () => {
    const first = [spec({ id: "a", project: "P" })];
    await computeSeenDigest(first, true); // seeds project P

    const withNew = [...first, spec({ id: "b", project: "P" })];
    const diff = await computeSeenDigest(withNew, true);
    expect(diff?.added.map((s) => s.id)).toEqual(["b"]);
    expect(diff?.edited).toEqual([]);
  });

  it("silently seeds a newly-connected project instead of flagging everything new", async () => {
    await computeSeenDigest([spec({ id: "a", project: "A" })], true); // known: A

    // Project B appears for the first time: its specs are seeded, not reported.
    const diff = await computeSeenDigest([spec({ id: "b", project: "B" })], true);
    expect(diff?.added).toEqual([]);
    expect(diff?.edited).toEqual([]);
  });

  it("reports a content edit on the next visit", async () => {
    await computeSeenDigest([spec({ id: "a", project: "P", title: { en: "old" } })], true);
    const diff = await computeSeenDigest(
      [spec({ id: "a", project: "P", title: { en: "new" } })],
      true,
    );
    expect(diff?.edited.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("markAllSeen", () => {
  it("persists the current specs so the digest clears on the next compute", async () => {
    const before = [spec({ id: "a", project: "P", title: { en: "v1" } })];
    await computeSeenDigest(before, true); // seed
    const edited = [spec({ id: "a", project: "P", title: { en: "v2" } })];
    // An edit is pending...
    expect((await computeSeenDigest(edited, true))?.edited.map((s) => s.id)).toEqual(["a"]);
    // ...until the user marks all seen.
    await markAllSeen(edited);
    const diff = await computeSeenDigest(edited, true);
    expect(diff?.added).toEqual([]);
    expect(diff?.edited).toEqual([]);
  });
});
