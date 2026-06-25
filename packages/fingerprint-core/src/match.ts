import type { ElementFingerprint } from "@specpin/spec-schema";
import { isGeneratedId } from "./generated-id.js";
import { cssEscapeAttrValue, cssEscapeIdent } from "./css-escape.js";
import { safeQueryAll } from "./selector.js";
import { TEST_ID_ATTRS } from "./capture.js";

export interface MatchResult {
  el: Element | null;
  confidence: number;
  strategy: "exact" | "css" | "none";
  needsReview: boolean;
}

const NO_MATCH: MatchResult = { el: null, confidence: 0, strategy: "none", needsReview: true };

/** Return the single element matching `selector`, or null if absent/ambiguous. */
function uniqueMatch(root: ParentNode, selector: string): Element | null {
  const hits = safeQueryAll(root, selector);
  return hits.length === 1 ? hits[0]! : null;
}

/** Step 1: resolve via exact anchors in priority order. */
function matchExact(fp: ElementFingerprint, root: ParentNode): Element | null {
  if (fp.testId) {
    const v = cssEscapeAttrValue(fp.testId);
    const selector = TEST_ID_ATTRS.map((attr) => `[${attr}="${v}"]`).join(",");
    const hit = uniqueMatch(root, selector);
    if (hit) return hit;
  }
  if (fp.ariaLabel) {
    const hit = uniqueMatch(root, `[aria-label="${cssEscapeAttrValue(fp.ariaLabel)}"]`);
    if (hit) return hit;
  }
  if (fp.id && !isGeneratedId(fp.id)) {
    const hit = uniqueMatch(root, `#${cssEscapeIdent(fp.id)}`);
    if (hit) return hit;
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
  if (exact) return { el: exact, confidence: 1.0, strategy: "exact", needsReview: false };

  if (fp.cssSelector) {
    const hits = safeQueryAll(root, fp.cssSelector);
    if (hits.length === 1) {
      return { el: hits[0]!, confidence: 0.7, strategy: "css", needsReview: false };
    }
    // Ambiguous (>1) is explicitly low-confidence: leave for human review.
  }

  return { ...NO_MATCH };
}
