// @specpin/fingerprint-core: framework-agnostic element fingerprint capture and
// matching. Pure DOM APIs, zero framework dependencies. Types come from
// @specpin/spec-schema (ElementFingerprint is the shared contract).

export type { ElementFingerprint } from "@specpin/spec-schema";
export { type AnchorStrength, anchorStrength } from "./anchor-strength.js";
export { captureFingerprint, TEST_ID_ATTRS } from "./capture.js";
export { detectFramework } from "./detect-framework.js";
export { IDENTITY_ATTRS, isGeneratedClass, isGeneratedId, isUtilityClass } from "./generated-id.js";
export { type MatchAnchor, type MatchResult, matchElement } from "./match.js";
export {
  CANDIDATE_CAP,
  type CandidateSet,
  generateCandidates,
  hasContentSignal,
  pickBest,
  rankCandidates,
  type ScoredCandidate,
  type Signal,
  type SignalScores,
  scoreCandidate,
  scoreFingerprintPair,
  signalScores,
  signalScoresBetween,
  THRESHOLDS,
  WEIGHTS,
} from "./score.js";
export { cssSelectorFor, safeQueryAll } from "./selector.js";
export { xpathFor } from "./xpath.js";
