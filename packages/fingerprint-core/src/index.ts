// @specpin/fingerprint-core: framework-agnostic element fingerprint capture and
// matching. Pure DOM APIs, zero framework dependencies. Types come from
// @specpin/spec-schema (ElementFingerprint is the shared contract).

export { captureFingerprint, TEST_ID_ATTRS } from "./capture.js";
export { matchElement, type MatchResult } from "./match.js";
export { detectFramework } from "./detect-framework.js";
export { isGeneratedId, isGeneratedClass } from "./generated-id.js";
export { cssSelectorFor, safeQueryAll } from "./selector.js";
export { xpathFor } from "./xpath.js";

export type { ElementFingerprint } from "@specpin/spec-schema";
