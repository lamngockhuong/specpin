import type { ElementFingerprint } from "@specpin/spec-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import {
  appendEntry,
  appendPassive,
  appendPassiveMany,
  clearCorpus,
  exportCorpusJson,
  fingerprintChanged,
  getCorpus,
  getCorpusCount,
  getCorpusEnabled,
  MAX_CORPUS_ENTRIES,
  type PassiveDriftEntry,
  redactText,
  type SupervisedDriftEntry,
  setCorpusEnabled,
} from "../src/shared/drift-corpus.js";

beforeEach(() => {
  fakeBrowser.reset();
});

function fp(over: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector: "button.x",
    xpath: "//button",
    domPath: ["form", "button"],
    tagName: "button",
    textContent: null,
    attributes: {},
    nearbyLabels: [],
    positionHint: { index: 0, siblingCount: 1 },
    pageUrl: "/checkout",
    ...over,
  };
}

function supervised(
  over: Partial<Omit<SupervisedDriftEntry, "ts">>,
): Omit<SupervisedDriftEntry, "ts"> {
  return {
    kind: "supervised",
    old: fp({ cssSelector: "button.old" }),
    new: fp({ cssSelector: "button.new" }),
    pageUrl: "/checkout",
    prevStrategy: "none",
    prevConfidence: 0,
    ...over,
  };
}

describe("redactText", () => {
  it("masks email-shaped tokens and long digit runs, keeps short tokens", () => {
    expect(redactText("contact john.doe@example.com now")).toBe("contact [email] now");
    expect(redactText("order 123456 for you")).toBe("order [num] for you");
    expect(redactText("only 42 left")).toBe("only 42 left");
  });

  it("passes null/empty through", () => {
    expect(redactText(null)).toBeNull();
    expect(redactText("")).toBeNull();
  });
});

describe("appendEntry — redaction at write time", () => {
  it("persists only redacted fingerprint text", async () => {
    await setCorpusEnabled(true);
    await appendEntry(
      supervised({
        old: fp({ textContent: "email me at a@b.com" }),
        new: fp({ textContent: "call 5551234" }),
      }),
    );
    const [entry] = (await getCorpus()) as SupervisedDriftEntry[];
    expect(entry.old.textContent).toBe("email me at [email]");
    expect(entry.new.textContent).toBe("call [num]");
  });

  it("redacts every free-text field, not just textContent", async () => {
    await setCorpusEnabled(true);
    await appendEntry(
      supervised({
        old: fp({
          ariaLabel: "Account 987654",
          nearbyLabels: ["Email: john@x.com", "plain label"],
          attributes: { type: "submit", name: "user5551234", href: "/account/7654321/edit" },
        }),
      }),
    );
    const [entry] = (await getCorpus()) as SupervisedDriftEntry[];
    expect(entry.old.ariaLabel).toBe("Account [num]");
    expect(entry.old.nearbyLabels).toEqual(["Email: [email]", "plain label"]);
    expect(entry.old.attributes.name).toBe("user[num]");
    expect(entry.old.attributes.href).toBe("/account/[num]/edit");
    expect(entry.old.attributes.type).toBe("submit"); // enum-like: untouched
  });

  it("records fingerprints only — no HTML/full-page field", async () => {
    await appendEntry(supervised({}));
    const [entry] = await getCorpus();
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        "kind",
        "old",
        "new",
        "pageUrl",
        "prevStrategy",
        "prevConfidence",
        "ts",
      ]),
    );
    expect(JSON.stringify(entry)).not.toContain("outerHTML");
    expect((entry as SupervisedDriftEntry).ts).toBeGreaterThan(0);
  });
});

describe("appendEntry — ring buffer", () => {
  it("drops the oldest past the cap, preserving order", async () => {
    for (let i = 0; i < MAX_CORPUS_ENTRIES + 5; i += 1) {
      await appendEntry(supervised({ old: fp({ textContent: `entry ${i}` }) }));
    }
    const corpus = (await getCorpus()) as SupervisedDriftEntry[];
    expect(corpus.length).toBe(MAX_CORPUS_ENTRIES);
    // Oldest five dropped: first remaining is entry #5, last is the newest.
    expect(corpus[0]?.old.textContent).toBe("entry 5");
    expect(corpus.at(-1)?.old.textContent).toBe(`entry ${MAX_CORPUS_ENTRIES + 4}`);
  });

  it("serializes concurrent appends without losing a write", async () => {
    await Promise.all([
      appendEntry(supervised({ old: fp({ textContent: "a" }) })),
      appendEntry(supervised({ old: fp({ textContent: "b" }) })),
      appendEntry(supervised({ old: fp({ textContent: "c" }) })),
    ]);
    expect((await getCorpus()).length).toBe(3);
  });
});

describe("opt-in flag", () => {
  it("defaults to OFF", async () => {
    expect(await getCorpusEnabled()).toBe(false);
  });

  it("persists an explicit opt-in", async () => {
    await setCorpusEnabled(true);
    expect(await getCorpusEnabled()).toBe(true);
  });
});

describe("clearCorpus", () => {
  it("empties the store", async () => {
    await appendEntry(supervised({}));
    await clearCorpus();
    expect(await getCorpus()).toEqual([]);
    expect(await getCorpusCount()).toBe(0);
  });
});

describe("exportCorpusJson + count", () => {
  it("round-trips the corpus through JSON", async () => {
    await appendEntry(supervised({ old: fp({ textContent: "one" }) }));
    await appendEntry(supervised({ old: fp({ textContent: "two" }) }));
    const parsed = JSON.parse(await exportCorpusJson());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(await getCorpusCount()).toBe(2);
  });
});

describe("confirmed affirmation entry", () => {
  it("stores a confirmed entry where new equals old", async () => {
    const shared = fp({ textContent: "affirmed" });
    await appendEntry(supervised({ old: shared, new: shared, confirmed: true }));
    const entry = (await getCorpus()).at(-1) as SupervisedDriftEntry;
    expect(entry.confirmed).toBe(true);
    expect(entry.new.textContent).toBe(entry.old.textContent);
  });
});

function passive(over: Partial<Omit<PassiveDriftEntry, "ts">>): Omit<PassiveDriftEntry, "ts"> {
  return {
    kind: "passive",
    old: fp({ textContent: "Delete account" }),
    candidates: [fp({ textContent: "Archive" }), fp({ textContent: "Delete account" })],
    chosenByScorer: undefined,
    pageUrl: "/settings",
    project: "acme",
    specId: "spec-1",
    ...over,
  };
}

describe("appendPassive", () => {
  it("records candidate fingerprints with redacted text and no raw HTML", async () => {
    await appendPassive(
      passive({
        specId: "redact-1",
        candidates: [fp({ textContent: "reach me at x@y.com" })],
      }),
    );
    const entry = (await getCorpus()).at(-1) as PassiveDriftEntry;
    expect(entry.kind).toBe("passive");
    expect(entry.candidates[0]?.textContent).toBe("reach me at [email]");
    expect(JSON.stringify(entry)).not.toContain("outerHTML");
  });

  it("keeps a tentative chosenByScorer label distinct from ground truth", async () => {
    await appendPassive(passive({ specId: "label-1", chosenByScorer: 1 }));
    const entry = (await getCorpus()).at(-1) as PassiveDriftEntry;
    expect(entry.chosenByScorer).toBe(1);
    // Passive entries never carry a supervised `new` ground-truth field.
    expect("new" in entry).toBe(false);
  });

  it("dedupes repeats of the same (project, specId, pageUrl) within the window", async () => {
    await appendPassive(passive({ specId: "dedupe-1" }));
    await appendPassive(passive({ specId: "dedupe-1" }));
    const mine = (await getCorpus()).filter((e) => e.kind === "passive" && e.specId === "dedupe-1");
    expect(mine.length).toBe(1);
  });

  it("appendPassiveMany records a batch and window-suppresses within it", async () => {
    await appendPassiveMany([
      passive({ specId: "batch-a" }),
      passive({ specId: "batch-b" }),
      passive({ specId: "batch-a" }), // duplicate of the first key → suppressed
    ]);
    const mine = (await getCorpus()).filter(
      (e) => e.kind === "passive" && (e.specId === "batch-a" || e.specId === "batch-b"),
    );
    expect(mine.map((e) => e.kind === "passive" && e.specId).sort()).toEqual([
      "batch-a",
      "batch-b",
    ]);
  });

  it("shares the ring-buffer cap with supervised entries", async () => {
    // Fill to the cap with supervised, then one passive must still evict the oldest.
    for (let i = 0; i < MAX_CORPUS_ENTRIES; i += 1) {
      await appendEntry(supervised({ old: fp({ textContent: `s${i}` }) }));
    }
    await appendPassive(passive({ specId: "cap-share" }));
    const corpus = await getCorpus();
    expect(corpus.length).toBe(MAX_CORPUS_ENTRIES);
    expect(corpus.at(-1)?.kind).toBe("passive");
  });
});

describe("fingerprintChanged — re-pin vs content/scope edit", () => {
  it("is true when a locating signal changed (element re-pinned)", () => {
    expect(
      fingerprintChanged(fp({ cssSelector: "button.a" }), fp({ cssSelector: "button.b" })),
    ).toBe(true);
  });

  it("is false when only pageUrl (page-scope glob) changed", () => {
    expect(fingerprintChanged(fp({ pageUrl: "/a" }), fp({ pageUrl: "/b" }))).toBe(false);
  });

  it("is false for identical fingerprints (content-only edit)", () => {
    expect(fingerprintChanged(fp({}), fp({}))).toBe(false);
  });
});
