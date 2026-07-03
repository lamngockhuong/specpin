import type { ElementFingerprint } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { matchElement } from "../src/match.js";
import { CANDIDATE_CAP, generateCandidates } from "../src/score.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function baseFp(overrides: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector: "",
    xpath: "",
    domPath: [],
    tagName: "button",
    textContent: null,
    attributes: {},
    nearbyLabels: [],
    positionHint: { index: 0, siblingCount: 1 },
    ...overrides,
  };
}

/** A candidate-heavy page: hundreds of same-tag elements, one distinctive. */
function seedHeavyPage(count: number): void {
  const rows: string[] = [];
  for (let i = 0; i < count; i += 1) rows.push(`<button type="button">row item ${i}</button>`);
  rows.push(`<button type="submit">Delete my account permanently</button>`);
  document.body.innerHTML = `<main>${rows.join("")}</main>`;
}

describe("matchElement performance", () => {
  it("stays within the latency budget on a candidate-heavy page", () => {
    seedHeavyPage(800);
    const fp = baseFp({
      cssSelector: "button.stale-hash",
      textContent: "Delete my account permanently",
      tagName: "button",
      attributes: { type: "submit" },
      domPath: ["main", "button"],
      positionHint: { index: 800, siblingCount: 801 },
    });

    // Warm up, then measure the median of repeated matches.
    for (let i = 0; i < 3; i += 1) matchElement(fp, document);
    const samples: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const t0 = performance.now();
      const r = matchElement(fp, document);
      samples.push(performance.now() - t0);
      expect(r.el).toBe(document.querySelector(`button[type="submit"]`));
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? 0;
    // Budget is generous for happy-dom (slower than a real browser); the plan's
    // <25ms P95 target is for the live DOM. Guards against pathological blowups.
    expect(median).toBeLessThan(50);
  });

  it("caps the candidate pool regardless of page size", () => {
    seedHeavyPage(1000);
    const fp = baseFp({
      tagName: "button",
      textContent: "row item 1",
      attributes: { type: "button" },
    });
    const { candidates, considered } = generateCandidates(fp, document);
    expect(candidates.length).toBeLessThanOrEqual(CANDIDATE_CAP);
    expect(considered).toBeGreaterThan(CANDIDATE_CAP);
  });
});
