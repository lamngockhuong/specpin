import type { ElementFingerprint } from "@specpin/spec-schema";
import {
  domPathFor,
  nearbyLabels,
  normalizeText,
  positionHint,
  whitelistedAttributes,
} from "./capture.js";
import { cssEscapeAttrValue } from "./css-escape.js";
import { safeQueryAll } from "./selector.js";

/** The per-element signals the hybrid scorer weighs. */
export type Signal =
  | "textContent"
  | "nearbyLabels"
  | "attributes"
  | "tagName"
  | "domPath"
  | "positionHint";

/** Raw per-signal similarity, each ∈ [0,1]. */
export type SignalScores = Record<Signal, number>;

/**
 * Per-signal weights for the hybrid scorer. Single source of truth — tune the
 * matcher here. Absolute magnitudes are irrelevant; only ratios matter, since
 * the final score is normalized over the signals a fingerprint actually carries.
 */
export const WEIGHTS: Record<Signal, number> = {
  textContent: 0.3,
  nearbyLabels: 0.2,
  attributes: 0.2,
  tagName: 0.1,
  domPath: 0.1,
  positionHint: 0.1,
};

/**
 * Score tiers + ambiguity margin (conservative, false-positive-averse).
 *   HIGH — render confidently (needsReview false).
 *   MID  — render but flag needsReview; below MID is a no-match.
 *   DELTA — the top candidate must beat the runner-up by this to win; ties are
 *           left unresolved so the matcher never guesses.
 */
export const THRESHOLDS = {
  HIGH: 0.85,
  MID: 0.6,
  DELTA: 0.1,
} as const;

function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(s.toLowerCase().split(/\s+/).filter(Boolean));
}

/** Token-set Jaccard. Two empty sets are treated as identical (1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Ratio of tags shared from the tail (deepest element) up, over the longer path. */
function suffixRatio(a: string[], b: string[]): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  let i = a.length - 1;
  let j = b.length - 1;
  let matched = 0;
  while (i >= 0 && j >= 0 && a[i] === b[j]) {
    matched += 1;
    i -= 1;
    j -= 1;
  }
  return matched / max;
}

function positionProximity(fp: ElementFingerprint, el: Element): number {
  const pos = positionHint(el);
  const maxSiblings = Math.max(fp.positionHint.siblingCount, pos.siblingCount, 1);
  const delta = Math.abs(fp.positionHint.index - pos.index);
  return Math.max(0, 1 - delta / maxSiblings);
}

function attributeFraction(fp: ElementFingerprint, el: Element): number {
  const keys = Object.keys(fp.attributes);
  if (keys.length === 0) return 0;
  const elAttrs = whitelistedAttributes(el);
  let matched = 0;
  for (const k of keys) if (elAttrs[k] === fp.attributes[k]) matched += 1;
  return matched / keys.length;
}

/**
 * Raw per-signal similarity between a stored fingerprint and a live element.
 * Metadata for the "why matched" surface; combined into a single score by
 * {@link scoreCandidate}. Reuses the capture-side extractors so a candidate is
 * measured against exactly what capture would have stored.
 */
export function signalScores(fp: ElementFingerprint, el: Element): SignalScores {
  return {
    textContent: jaccard(tokenize(fp.textContent), tokenize(normalizeText(el.textContent))),
    nearbyLabels: jaccard(
      tokenize((fp.nearbyLabels ?? []).join(" ")),
      tokenize(nearbyLabels(el).join(" ")),
    ),
    attributes: attributeFraction(fp, el),
    tagName: fp.tagName === el.tagName.toLowerCase() ? 1 : 0,
    domPath: suffixRatio(fp.domPath, domPathFor(el)),
    positionHint: positionProximity(fp, el),
  };
}

/** Whether the fingerprint carries an *identifying* signal — text, labels, or
 *  attributes. Tag and position are structural priors, not identity: a
 *  fingerprint with neither cannot be resolved by scoring without risking a
 *  confident false positive, so the scorer abstains. */
export function hasContentSignal(fp: ElementFingerprint): boolean {
  return Boolean(
    fp.textContent ||
      (fp.nearbyLabels && fp.nearbyLabels.length > 0) ||
      Object.keys(fp.attributes).length > 0,
  );
}

/** Signals the fingerprint carries: a missing signal must neither help nor
 *  penalize, so the score is normalized over these weights only. tagName and
 *  positionHint are always present on a fingerprint. */
function applicableSignals(fp: ElementFingerprint): Signal[] {
  const out: Signal[] = ["tagName", "positionHint"];
  if (fp.textContent) out.push("textContent");
  if (fp.nearbyLabels && fp.nearbyLabels.length > 0) out.push("nearbyLabels");
  if (Object.keys(fp.attributes).length > 0) out.push("attributes");
  if (fp.domPath.length > 0) out.push("domPath");
  return out;
}

/** Weighted score ∈ [0,1], normalized over the fingerprint's applicable signals. */
function combine(fp: ElementFingerprint, scores: SignalScores): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const s of applicableSignals(fp)) {
    weighted += WEIGHTS[s] * scores[s];
    totalWeight += WEIGHTS[s];
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

/** Weighted, applicability-normalized similarity of one element to a fingerprint. */
export function scoreCandidate(fp: ElementFingerprint, el: Element): number {
  return combine(fp, signalScores(fp, el));
}

export interface ScoredCandidate {
  el: Element;
  score: number;
  signals: SignalScores;
}

/** Upper bound on elements scored in one full-scorer pass, so a candidate-heavy
 *  page cannot blow the latency budget. */
export const CANDIDATE_CAP = 200;

/** Distinguishing attributes used to narrow the candidate pool before falling
 *  back to a bare tag scan. */
const NARROWING_ATTRS = ["role", "type", "name"] as const;

export interface CandidateSet {
  /** Priority-ordered, capped element pool to score. */
  candidates: Element[];
  /** Total distinct elements found before the cap; greater than
   *  `candidates.length` means the pool was truncated (no silent cap). */
  considered: number;
}

/**
 * Generate a bounded, priority-ordered pool of elements to score for a true
 * orphan (exact + css already failed). Order — most→least likely — so the cap
 * drops the least plausible:
 *   1. same tag sharing a distinguishing attribute (role/type/name),
 *   2. a relaxed `domPath` tail (nth-child and leading ancestors dropped),
 *   3. any same-tag element.
 * Pure: reuses `safeQueryAll`, never throws on a bad selector.
 */
export function generateCandidates(
  fp: ElementFingerprint,
  root: ParentNode = document,
  cap: number = CANDIDATE_CAP,
): CandidateSet {
  const ordered: Element[] = [];
  const seen = new Set<Element>();
  const add = (el: Element) => {
    if (!seen.has(el)) {
      seen.add(el);
      ordered.push(el);
    }
  };

  const tag = fp.tagName || "*";

  for (const attr of NARROWING_ATTRS) {
    const v = fp.attributes[attr];
    if (v)
      for (const el of safeQueryAll(root, `${tag}[${attr}="${cssEscapeAttrValue(v)}"]`)) add(el);
  }

  if (fp.domPath.length > 0) {
    const tail = fp.domPath.slice(-2).join(" ");
    if (tail) for (const el of safeQueryAll(root, tail)) add(el);
  }

  for (const el of safeQueryAll(root, tag)) add(el);

  return { candidates: ordered.slice(0, cap), considered: ordered.length };
}

/** Score every element and return them best-first (el + score + signal
 *  breakdown). The one place candidates are ranked, shared by the matcher's
 *  `pickBest` and the corpus's passive snapshot. */
export function rankCandidates(fp: ElementFingerprint, els: Element[]): ScoredCandidate[] {
  return els
    .map((el) => {
      const signals = signalScores(fp, el);
      return { el, score: combine(fp, signals), signals };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Pick the best of several candidates iff it clears the runner-up by `delta`.
 * A lone candidate wins by default; a near-tie returns null so the matcher
 * leaves the choice for human review rather than guessing. Also abstains when
 * the fingerprint carries no identifying content signal — structure alone must
 * never resolve an ambiguous set.
 */
export function pickBest(
  fp: ElementFingerprint,
  els: Element[],
  delta: number = THRESHOLDS.DELTA,
): ScoredCandidate | null {
  if (els.length === 0 || !hasContentSignal(fp)) return null;
  const [top, runnerUp] = rankCandidates(fp, els);
  if (!top) return null;
  if (runnerUp && top.score - runnerUp.score < delta) return null;
  return top;
}
