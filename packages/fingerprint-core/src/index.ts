// @specpin/fingerprint-core: framework-agnostic element fingerprint capture and
// matching. Pure DOM APIs, zero framework dependencies. Types come from
// @specpin/spec-schema (ElementFingerprint is the shared contract).

export type { ElementFingerprint } from "@specpin/spec-schema";
export { type AnchorStrength, anchorStrength } from "./anchor-strength.js";
export { captureFingerprint, TEST_ID_ATTRS } from "./capture.js";
export { detectFramework } from "./detect-framework.js";
export { isGeneratedClass, isGeneratedId } from "./generated-id.js";
export { type MatchAnchor, type MatchResult, matchElement } from "./match.js";
export { cssSelectorFor, safeQueryAll } from "./selector.js";
export { xpathFor } from "./xpath.js";
