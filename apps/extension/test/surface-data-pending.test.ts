import { describe, expect, it } from "vitest";
import type { MatchReportEntry } from "../src/shared/messaging.js";
import { pageHealth, pendingSpecs } from "../src/shared/surface-data.js";

const specs = [
  { id: "a", fingerprint: { anchors: [] } },
  { id: "b" },
  { id: "c", fingerprint: undefined },
  { id: "d", fingerprint: null },
  { id: "e", fingerprint: { anchors: [] } },
];

describe("pendingSpecs", () => {
  it("returns only the specs with no fingerprint", () => {
    expect(pendingSpecs(specs).map((s) => s.id)).toEqual(["b", "c", "d"]);
  });

  it("returns an empty list when every spec is pinned", () => {
    expect(pendingSpecs(specs.filter((s) => s.id === "a" || s.id === "e"))).toEqual([]);
  });

  it("returns every spec when none are pinned", () => {
    const allPending = specs.filter((s) => s.id !== "a" && s.id !== "e");
    expect(pendingSpecs(allPending)).toEqual(allPending);
  });
});

describe("pendingSpecs count matches pageHealth().unpinned", () => {
  it("agrees with the report-derived unpinned count for the same spec set", () => {
    const report: MatchReportEntry[] = specs.map((s) => {
      const isPending = pendingSpecs([s]).length === 1;
      return {
        id: s.id,
        matched: !isPending,
        strategy: isPending ? "none" : "exact",
        confidence: isPending ? 0 : 1,
        anchor: isPending ? null : "testId",
        needsReview: isPending,
        strength: "strong",
        pending: isPending,
      };
    });
    expect(pendingSpecs(specs).length).toBe(pageHealth(report).unpinned);
  });
});
