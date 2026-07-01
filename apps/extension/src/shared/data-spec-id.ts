import type { MatchReportEntry } from "./messaging.js";
import { slugify } from "./slug.js";

// The A2 helper's pure core: build a copyable `data-spec-id="…"` snippet and
// select the fragile specs on a page. Suggest-only — nothing here writes source
// files. `data-spec-id` is the top-priority test-id anchor (TEST_ID_ATTRS[0]), so
// applying the snippet upgrades a spec to a guaranteed exact match.

/** Build a `data-spec-id` snippet from a spec's (already localized) title. The id
 *  is the kebab slug of the title (falling back to "spec" for an empty/symbol
 *  title). Pass a shared `taken` set when building several on one page: a numeric
 *  suffix is appended on collision so duplicate titles get distinct ids, and the
 *  chosen id is recorded in the set. Pure + testable. */
export function dataSpecIdSnippet(
  title: string,
  taken?: Set<string>,
): { id: string; snippet: string } {
  const base = slugify(title) || "spec";
  let id = base;
  if (taken) {
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
  }
  return { id, snippet: `data-spec-id="${id}"` };
}

/** The fragile specs in a match report: a weak stored anchor AND currently
 *  failing (unmatched or flagged for review). A spec matching fine at the css
 *  (0.7) tier is NOT fragile — it works today, just less resiliently — so it is
 *  excluded to avoid nagging. (The capture-flow hint uses a broader trigger — any
 *  weak anchor — because at author time the fresh element always matches.) */
export function fragileEntries(report: MatchReportEntry[]): MatchReportEntry[] {
  return report.filter((e) => e.strength === "weak" && (!e.matched || e.needsReview));
}
