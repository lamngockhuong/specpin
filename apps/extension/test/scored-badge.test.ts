import type { SignalScores } from "@specpin/fingerprint-core";
import { describe, expect, it } from "vitest";
import { confidenceBadge, whyMatched } from "../src/renderers/confidence-badge.js";
import type { RenderMeta } from "../src/renderers/renderer.js";
import { tierBadge } from "../src/shared/surface-renderers.js";

function signals(over: Partial<SignalScores>): SignalScores {
  return {
    textContent: 0,
    nearbyLabels: 0,
    attributes: 0,
    tagName: 0,
    domPath: 0,
    positionHint: 0,
    ...over,
  };
}

describe("confidenceBadge — scored tier", () => {
  it("renders a distinct scored state (not exact, not css) with its confidence", () => {
    const meta: RenderMeta = {
      confidence: 0.9,
      needsReview: false,
      strategy: "scored",
      signals: signals({ textContent: 1 }),
    };
    const html = confidenceBadge(meta);
    expect(html).toContain("sp-conf-scored");
    expect(html).not.toContain("sp-conf-fuzzy");
    expect(html).toContain("Scored match 90%");
  });

  it("renders a MID scored match (needsReview) in the cautionary fuzzy style", () => {
    const meta: RenderMeta = {
      confidence: 0.7,
      needsReview: true,
      strategy: "scored",
      signals: signals({ textContent: 1 }),
    };
    const html = confidenceBadge(meta);
    expect(html).toContain("sp-conf-fuzzy");
    expect(html).not.toContain("sp-conf-scored");
    expect(html).toContain("Scored match 70%");
  });

  it("stays silent for the exact tier and unchanged for the css tier", () => {
    expect(confidenceBadge({ confidence: 1, needsReview: false, strategy: "exact" })).toBe("");
    const css = confidenceBadge({
      confidence: 0.7,
      needsReview: false,
      strategy: "css",
      anchor: "css",
    });
    expect(css).toContain("sp-conf-fuzzy");
    expect(css).toContain("Selector match");
  });
});

describe("whyMatched — scored tier names its dominant signal", () => {
  it("reports the highest-weighted contributing signal", () => {
    const meta: RenderMeta = {
      confidence: 0.9,
      needsReview: false,
      strategy: "scored",
      // text (0.3 weight) dominates position (0.1 weight) at equal similarity.
      signals: signals({ textContent: 1, positionHint: 1 }),
    };
    expect(whyMatched(meta)).toBe("Matched by text");
  });

  it("falls back to the anchor hint for a scored match resolved from the css hit set", () => {
    const meta: RenderMeta = {
      confidence: 0.8,
      needsReview: false,
      strategy: "scored",
      anchor: "css",
      // No signal scored above zero → fall back to the anchor.
      signals: signals({}),
    };
    expect(whyMatched(meta)).toBe("Matched by CSS selector");
  });
});

describe("tierBadge — scored card pill", () => {
  it("renders a scored pill for a HIGH scored entry", () => {
    const badge = tierBadge({
      id: "a",
      matched: true,
      strategy: "scored",
      confidence: 0.88,
      anchor: null,
      needsReview: false,
      strength: "weak",
    });
    expect(badge?.className).toBe("tier tier-scored");
    expect(badge?.textContent).toBe("scored");
    expect(badge?.title).toBe("Scored match 88%");
  });

  it("renders the fuzzy style for a MID scored entry", () => {
    const badge = tierBadge({
      id: "b",
      matched: true,
      strategy: "scored",
      confidence: 0.7,
      anchor: null,
      needsReview: true,
      strength: "weak",
    });
    expect(badge?.className).toBe("tier tier-fuzzy");
  });
});
