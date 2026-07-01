import type { ElementFingerprint } from "@specpin/spec-schema";
import { isGeneratedId } from "./generated-id.js";

/** How resilient a stored fingerprint's anchors are, classified off the fields
 *  the matcher keys on (independent of the live DOM):
 *  - `strong` — carries a test-id anchor (`testId`), which yields an exact match.
 *  - `medium` — no test-id, but an `ariaLabel` or a non-generated `id` anchors it.
 *  - `weak`   — neither; only css/xpath/domPath carry it, so a match falls to the
 *               lower-confidence css tier (or fails when the selector drifts).
 *  Pure: takes only the stored fingerprint, so weak-anchor detection and any
 *  surface can classify a spec without a document. */
export type AnchorStrength = "strong" | "medium" | "weak";

export function anchorStrength(fp: ElementFingerprint): AnchorStrength {
  if (fp.testId) return "strong";
  if (fp.ariaLabel || (fp.id && !isGeneratedId(fp.id))) return "medium";
  return "weak";
}
