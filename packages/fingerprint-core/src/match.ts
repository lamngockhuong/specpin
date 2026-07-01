import type { ElementFingerprint } from "@specpin/spec-schema";
import { TEST_ID_ATTRS } from "./capture.js";
import { cssEscapeAttrValue, cssEscapeIdent } from "./css-escape.js";
import { isGeneratedId } from "./generated-id.js";
import { safeQueryAll } from "./selector.js";

/** Which signal resolved a match: an exact anchor (testId/aria/id), the css
 *  selector fallback, or none. `null` on a no-match so a surface can distinguish
 *  "not matched" from an unset field. */
export type MatchAnchor = "testId" | "aria" | "id" | "css" | null;

export interface MatchResult {
  el: Element | null;
  confidence: number;
  strategy: "exact" | "css" | "none";
  needsReview: boolean;
  /** The signal that resolved this match (metadata only; does not affect the
   *  el/confidence/needsReview decision). Additive: existing callers ignore it. */
  anchor: MatchAnchor;
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
    // Ambiguous (>1) is explicitly low-confidence: leave for human review.
  }

  return { ...NO_MATCH };
}
