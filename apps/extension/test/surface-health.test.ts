import { describe, expect, it } from "vitest";
import type { MatchReportEntry } from "../src/shared/messaging.js";
import { orphanedSpecs, pageHealth } from "../src/shared/surface-data.js";

/** Build a report entry with sensible matched defaults, overridable per case. */
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

const report: MatchReportEntry[] = [
  entry({ id: "a", strategy: "exact", anchor: "testId" }),
  entry({ id: "b", strategy: "css", confidence: 0.7, anchor: "css", strength: "weak" }),
  entry({ id: "c", strategy: "css", confidence: 0.7, anchor: "css", strength: "medium" }),
  entry({
    id: "d",
    matched: false,
    strategy: "none",
    confidence: 0,
    anchor: null,
    needsReview: true,
    strength: "weak",
  }),
];

describe("pageHealth", () => {
  it("counts each match tier plus orphaned", () => {
    expect(pageHealth(report)).toEqual({
      total: 4,
      exact: 1,
      fuzzy: 2,
      scored: 0,
      needsReview: 0,
      orphaned: 1,
    });
  });

  it("buckets scored matches distinctly; MID scored also counts as needsReview", () => {
    const h = pageHealth([
      entry({ id: "hi", strategy: "scored", confidence: 0.9, anchor: null, strength: "weak" }),
      entry({
        id: "mid",
        strategy: "scored",
        confidence: 0.7,
        anchor: null,
        needsReview: true,
        strength: "weak",
      }),
    ]);
    expect(h).toEqual({ total: 2, exact: 0, fuzzy: 0, scored: 2, needsReview: 1, orphaned: 0 });
  });

  it("does not count an orphaned spec toward needsReview or a tier", () => {
    const h = pageHealth([
      entry({
        id: "x",
        matched: false,
        strategy: "none",
        confidence: 0,
        anchor: null,
        needsReview: true,
        strength: "weak",
      }),
    ]);
    expect(h).toEqual({ total: 1, exact: 0, fuzzy: 0, scored: 0, needsReview: 0, orphaned: 1 });
  });

  it("returns all-zero for an empty report", () => {
    expect(pageHealth([])).toEqual({
      total: 0,
      exact: 0,
      fuzzy: 0,
      scored: 0,
      needsReview: 0,
      orphaned: 0,
    });
  });
});

describe("orphanedSpecs", () => {
  it("returns only the unmatched entries", () => {
    expect(orphanedSpecs(report).map((e) => e.id)).toEqual(["d"]);
  });

  it("returns an empty list when everything matched", () => {
    expect(orphanedSpecs(report.filter((e) => e.matched))).toEqual([]);
  });
});
