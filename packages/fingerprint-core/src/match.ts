import type { ElementFingerprint } from "@specpin/spec-schema";
import { TEST_ID_ATTRS } from "./capture.js";
import { cssEscapeAttrValue, cssEscapeIdent } from "./css-escape.js";
import { isGeneratedId } from "./generated-id.js";
import {
  generateCandidates,
  hasContentSignal,
  pickBest,
  type SignalScores,
  THRESHOLDS,
} from "./score.js";
import { safeQueryAll } from "./selector.js";

/** Which signal resolved a match: an exact anchor (testId/aria/id), the css
 *  selector fallback, or none. `null` on a no-match so a surface can distinguish
 *  "not matched" from an unset field. */
export type MatchAnchor = "testId" | "aria" | "id" | "css" | null;

export interface MatchResult {
  el: Element | null;
  confidence: number;
  strategy: "exact" | "css" | "scored" | "none";
  needsReview: boolean;
  /** The signal that resolved this match (metadata only; does not affect the
   *  el/confidence/needsReview decision). Additive: existing callers ignore it. */
  anchor: MatchAnchor;
  /** Per-signal similarity breakdown, present only on a scored match, for the
   *  "why matched" surface. Additive: existing callers ignore it. */
  signals?: SignalScores;
}

const NO_MATCH: MatchResult = {
  el: null,
  confidence: 0,
  strategy: "none",
  needsReview: true,
  anchor: null,
};

/** Return the single element matching `selector`, or null if absent/ambiguous. */
function uniqueMatch(root: ParentNode, selector: string): Element | null {
  const hits = safeQueryAll(root, selector);
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

/** Step 1: resolve via exact anchors in priority order, reporting which anchor
 *  resolved it so a surface can render a "why matched" hint. */
function matchExact(
  fp: ElementFingerprint,
  root: ParentNode,
): { el: Element; anchor: "testId" | "aria" | "id" } | null {
  if (fp.testId) {
    const v = cssEscapeAttrValue(fp.testId);
    const selector = TEST_ID_ATTRS.map((attr) => `[${attr}="${v}"]`).join(",");
    const hit = uniqueMatch(root, selector);
    if (hit) return { el: hit, anchor: "testId" };
  }
  if (fp.ariaLabel) {
    const hit = uniqueMatch(root, `[aria-label="${cssEscapeAttrValue(fp.ariaLabel)}"]`);
    if (hit) return { el: hit, anchor: "aria" };
  }
  if (fp.id && !isGeneratedId(fp.id)) {
    const hit = uniqueMatch(root, `#${cssEscapeIdent(fp.id)}`);
    if (hit) return { el: hit, anchor: "id" };
  }
  return null;
}

/**
 * Match a fingerprint against a live DOM. MVP order (no weighted scoring yet):
 *   1. exact anchors (testId/aria/id) -> confidence 1.0, strategy "exact"
 *   2. unique cssSelector hit         -> confidence 0.7, strategy "css"
 *   3. otherwise (absent or ambiguous) -> no element, needsReview
 * The signature and MatchResult shape are stable so the deferred hybrid scorer
 * slots in as extra steps without breaking callers.
 */
export function matchElement(fp: ElementFingerprint, root: ParentNode = document): MatchResult {
  const exact = matchExact(fp, root);
  if (exact)
    return {
      el: exact.el,
      confidence: 1.0,
      strategy: "exact",
      needsReview: false,
      anchor: exact.anchor,
    };

  if (fp.cssSelector) {
    const hits = safeQueryAll(root, fp.cssSelector);
    const [hit] = hits;
    if (hits.length === 1 && hit) {
      return { el: hit, confidence: 0.7, strategy: "css", needsReview: false, anchor: "css" };
    }
    // Ambiguous (>1): score the hit set and take the best only if it clears the
    // ambiguity margin; a tie falls through to no-match rather than guessing.
    // No MID floor here (unlike the true-orphan step below): a surviving selector
    // is a strong prior — its hits ARE what the author targeted — so the best hit
    // renders (flagged needsReview when < HIGH) even below MID. The δ margin is
    // the guard against guessing.
    if (hits.length > 1) {
      const best = pickBest(fp, hits);
      if (best) {
        return {
          el: best.el,
          confidence: best.score,
          strategy: "scored",
          needsReview: best.score < THRESHOLDS.HIGH,
          anchor: "css",
          signals: best.signals,
        };
      }
    }
  }

  // Step 3: true orphan (exact + css failed). Score a bounded candidate pool
  // and match the best only if it clears MID; below MID biases to no-match. The
  // content-signal guard skips the candidate scan for structure-only fingerprints.
  if (hasContentSignal(fp)) {
    const { candidates } = generateCandidates(fp, root);
    const best = pickBest(fp, candidates);
    if (best && best.score >= THRESHOLDS.MID) {
      return {
        el: best.el,
        confidence: best.score,
        strategy: "scored",
        needsReview: best.score < THRESHOLDS.HIGH,
        anchor: null,
        signals: best.signals,
      };
    }
  }

  return { ...NO_MATCH };
}
