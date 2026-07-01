import { describe, expect, it } from "vitest";
import { dataSpecIdSnippet, fragileEntries } from "../src/shared/data-spec-id.js";
import type { MatchReportEntry } from "../src/shared/messaging.js";

function entry(over: Partial<MatchReportEntry> & { id: string }): MatchReportEntry {
  return {
    matched: true,
    strategy: "exact",
    confidence: 1,
    anchor: "testId",
    needsReview: false,
    strength: "strong",
    ...over,
  };
}

describe("dataSpecIdSnippet", () => {
  it("slugifies the title into a data-spec-id snippet", () => {
    expect(dataSpecIdSnippet("Login Button")).toEqual({
      id: "login-button",
      snippet: 'data-spec-id="login-button"',
    });
  });

  it("falls back to 'spec' for an empty/symbol-only title", () => {
    expect(dataSpecIdSnippet("!!!").id).toBe("spec");
    expect(dataSpecIdSnippet("").id).toBe("spec");
  });

  it("appends a numeric suffix on intra-page collision", () => {
    const taken = new Set<string>();
    expect(dataSpecIdSnippet("Save", taken).id).toBe("save");
    expect(dataSpecIdSnippet("Save", taken).id).toBe("save-2");
    expect(dataSpecIdSnippet("Save", taken).id).toBe("save-3");
  });
});

describe("fragileEntries", () => {
  const report: MatchReportEntry[] = [
    // weak + unmatched -> fragile
    entry({
      id: "orphan-weak",
      matched: false,
      strategy: "none",
      anchor: null,
      needsReview: true,
      strength: "weak",
    }),
    // weak but matching fine at css tier -> NOT fragile (works today)
    entry({ id: "weak-css-ok", strategy: "css", confidence: 0.7, anchor: "css", strength: "weak" }),
    // strong anchor, unmatched -> NOT fragile (a data-spec-id can't help; not weak)
    entry({
      id: "strong-orphan",
      matched: false,
      strategy: "none",
      anchor: null,
      needsReview: true,
      strength: "strong",
    }),
    // weak + needsReview while matched -> fragile
    entry({
      id: "weak-review",
      strategy: "css",
      confidence: 0.7,
      anchor: "css",
      needsReview: true,
      strength: "weak",
    }),
  ];

  it("selects weak-anchored specs that are currently failing", () => {
    expect(fragileEntries(report).map((e) => e.id)).toEqual(["orphan-weak", "weak-review"]);
  });

  it("excludes a weak-but-matching-at-css spec and a strong-anchor spec", () => {
    const ids = fragileEntries(report).map((e) => e.id);
    expect(ids).not.toContain("weak-css-ok");
    expect(ids).not.toContain("strong-orphan");
  });
});
