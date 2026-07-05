/**
 * Offline weight tuner for the hybrid fingerprint scorer.
 *
 * Reads a drift corpus exported from the extension's Options page ("Export
 * corpus (JSON)") and replays the scorer over it. The corpus stores fingerprints
 * only (never live DOM), so scoring uses `scoreFingerprintPair` - the fp-vs-fp
 * twin of the runtime `scoreCandidate`.
 *
 * Under the shipped WEIGHTS it reports:
 *   - supervised pairs (old -> new, ground truth): score distribution + tiers,
 *     and per-signal mean similarity across re-pin corrections (which signals
 *     actually survive real refactors, hence deserve weight);
 *   - passive candidate sets (weak labels): top-vs-runner-up margin (how often
 *     the DELTA gate would abstain) and agreement with the tentative
 *     `chosenByScorer` (informational, never treated as truth).
 *
 * Then a coordinate-ascent pass suggests a weight table maximizing a transparent
 * objective. The suggestion is a STARTING HYPOTHESIS, not an answer: only re-pins
 * are true positives (passives are tentative), so a human must judge before
 * editing WEIGHTS in src/score.ts.
 *
 * Usage:  pnpm --filter @specpin/fingerprint-core tune [path/to/corpus.json]
 *         (path defaults to ./specpin-drift-corpus.json)
 */
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";
import type { ElementFingerprint } from "@specpin/spec-schema";
import {
  hasContentSignal,
  type Signal,
  scoreFingerprintPair,
  signalScoresBetween,
  THRESHOLDS,
  WEIGHTS,
} from "../src/score.js";

type Weights = Record<Signal, number>;

/** Subset of the corpus entry shapes this tool reads (see the full definitions
 *  in apps/extension/src/shared/drift-corpus.ts). */
interface SupervisedEntry {
  kind: "supervised";
  old: ElementFingerprint;
  new: ElementFingerprint;
  confirmed?: boolean;
}
interface PassiveEntry {
  kind: "passive";
  old: ElementFingerprint;
  candidates: ElementFingerprint[];
  chosenByScorer?: number;
}
type Entry = SupervisedEntry | PassiveEntry;

const SIGNALS: Signal[] = [
  "textContent",
  "nearbyLabels",
  "attributes",
  "tagName",
  "domPath",
  "positionHint",
];

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (n: number, total: number): string =>
  total === 0 ? "0%" : `${Math.round((100 * n) / total)}%`;
const fmt = (n: number): string => n.toFixed(3);

/** Normalize a weight table to sum 1 for display (only ratios affect scoring). */
function normalize(w: Weights): Weights {
  const sum = SIGNALS.reduce((a, s) => a + w[s], 0) || 1;
  const out = {} as Weights;
  for (const s of SIGNALS) out[s] = w[s] / sum;
  return out;
}

function weightsLine(w: Weights): string {
  return `{ ${SIGNALS.map((s) => `${s} ${fmt(w[s])}`).join(", ")} }`;
}

/**
 * Transparent tuning objective: reward matching the known-correct element
 * (supervised old -> new) and penalize indiscriminately high scores on passive
 * candidate pools (mostly wrong elements). Higher = more discriminative.
 */
function objective(sup: SupervisedEntry[], pas: PassiveEntry[], w: Weights): number {
  const good = mean(sup.map((e) => scoreFingerprintPair(e.old, e.new, w)));
  const noise = mean(
    pas.flatMap((e) => e.candidates.map((c) => scoreFingerprintPair(e.old, c, w))),
  );
  return good - noise;
}

/** Coordinate ascent from `start`: scale one signal at a time up/down, keep any
 *  change that improves the objective, iterate until a round finds none. Cheap
 *  and adequate for a 6-weight table where only ratios matter. */
function tune(sup: SupervisedEntry[], pas: PassiveEntry[], start: Weights): Weights {
  let best = { ...start };
  let bestJ = objective(sup, pas, best);
  const factors = [1.5, 1 / 1.5];
  for (let round = 0; round < 30; round += 1) {
    let improved = false;
    for (const s of SIGNALS) {
      for (const factor of factors) {
        const trial = { ...best, [s]: best[s] * factor };
        const j = objective(sup, pas, trial);
        if (j > bestJ + 1e-9) {
          best = trial;
          bestJ = j;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

function loadCorpus(path: string): Entry[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error("corpus JSON is not an array");
  return raw as Entry[];
}

function main(): void {
  const path = argv[2] ?? "specpin-drift-corpus.json";
  let entries: Entry[];
  try {
    entries = loadCorpus(path);
  } catch (err) {
    console.error(`Could not read corpus at "${path}": ${(err as Error).message}`);
    console.error("Export one from the extension's Options page (Export corpus (JSON)).");
    exit(1);
  }

  const sup = entries.filter((e): e is SupervisedEntry => e.kind === "supervised");
  const pas = entries.filter((e): e is PassiveEntry => e.kind === "passive");
  console.log(
    `Loaded ${entries.length} entries (${sup.length} supervised, ${pas.length} passive) from ${path}\n`,
  );

  // --- Supervised: the only ground truth (old -> the element the user re-pinned).
  const scores = sup.map((e) => scoreFingerprintPair(e.old, e.new, WEIGHTS));
  const high = scores.filter((s) => s >= THRESHOLDS.HIGH).length;
  const mid = scores.filter((s) => s >= THRESHOLDS.MID && s < THRESHOLDS.HIGH).length;
  const below = scores.filter((s) => s < THRESHOLDS.MID).length;
  const confirmed = sup.filter((e) => e.confirmed).length;
  console.log("== Supervised pairs (ground truth old -> new) ==");
  console.log(`count ${sup.length} (confirmed ${confirmed}) · mean score ${fmt(mean(scores))}`);
  console.log(
    `tiers: HIGH ${high} (${pct(high, sup.length)}) · MID ${mid} (${pct(mid, sup.length)}) · below ${below} (${pct(below, sup.length)})`,
  );

  // Per-signal mean over corrections only: a "confirmed" pair is old === new
  // (every signal 1), which would inflate the means and hide brittle signals.
  const corrections = sup.filter((e) => !e.confirmed);
  if (corrections.length > 0) {
    console.log("per-signal mean similarity across re-pin corrections (higher = signal survived):");
    for (const s of SIGNALS) {
      const m = mean(corrections.map((e) => signalScoresBetween(e.old, e.new)[s]));
      console.log(`  ${s.padEnd(13)} ${fmt(m)}`);
    }
  }

  // --- Passive: weak labels. The non-picked candidates are likely-but-unproven
  // negatives; chosenByScorer is the scorer's own guess, not truth.
  const withCands = pas.filter((e) => e.candidates.length > 0);
  const topScores: number[] = [];
  const margins: number[] = [];
  let render = 0;
  // The render gate is an AND of three conditions; attribute each abstention to
  // the FIRST that fails (same short-circuit order as pickBest) so the report
  // says WHY the scorer stays silent, not just that it does.
  let noContent = 0;
  let belowMid = 0;
  let nearTie = 0;
  let agree = 0;
  let decided = 0;
  for (const e of withCands) {
    // Score each candidate once, then derive the top score, margin, and top index
    // (for the tentative-label agreement check) from it.
    const scored = e.candidates.map((c) => scoreFingerprintPair(e.old, c, WEIGHTS));
    const ranked = [...scored].sort((a, b) => b - a);
    const top = ranked[0] ?? 0;
    const margin = top - (ranked[1] ?? 0);
    topScores.push(top);
    margins.push(margin);
    if (!hasContentSignal(e.old)) noContent += 1;
    else if (top < THRESHOLDS.MID) belowMid += 1;
    else if (margin < THRESHOLDS.DELTA) nearTie += 1;
    else render += 1;
    if (e.chosenByScorer !== undefined) {
      decided += 1;
      if (scored.indexOf(Math.max(...scored)) === e.chosenByScorer) agree += 1;
    }
  }
  console.log("\n== Passive candidate sets (weak labels) ==");
  console.log(`count ${pas.length} (with candidates ${withCands.length})`);
  if (withCands.length > 0) {
    const midCount = topScores.filter((s) => s >= THRESHOLDS.MID).length;
    console.log(
      `top candidate score: mean ${fmt(mean(topScores))} · reaches MID(${THRESHOLDS.MID}): ${midCount}/${withCands.length}`,
    );
    console.log(`top-vs-runner-up margin: mean ${fmt(mean(margins))}`);
    console.log(
      `would render ${render}/${withCands.length} · abstain: no content signal ${noContent} · top below MID ${belowMid} · near-tie (< DELTA ${THRESHOLDS.DELTA}) ${nearTie}`,
    );
  }
  if (decided > 0) {
    console.log(
      `top score agrees with tentative chosenByScorer: ${agree}/${decided} (${pct(agree, decided)}) - informational, not ground truth`,
    );
  }

  // --- Weight suggestion. Needs supervised positives to optimize toward.
  console.log("\n== Weight suggestion (coordinate ascent) ==");
  if (sup.length === 0) {
    console.log(
      "Not enough supervised data to suggest weights (re-pin some orphaned specs first).",
    );
    return;
  }
  console.log(
    "objective J = mean(supervised old->new score) - mean(passive candidate score); higher = more discriminative",
  );
  const suggested = tune(sup, pas, WEIGHTS);
  console.log(
    `current   J ${fmt(objective(sup, pas, WEIGHTS))}  ${weightsLine(normalize(WEIGHTS))}`,
  );
  console.log(
    `suggested J ${fmt(objective(sup, pas, suggested))}  ${weightsLine(normalize(suggested))}`,
  );
  console.log(
    "NOTE: weakly-labeled data (only re-pins are true positives). Treat as a starting hypothesis, not an answer.",
  );
  console.log(
    "Apply by editing WEIGHTS in packages/fingerprint-core/src/score.ts, then re-run `pnpm --filter @specpin/fingerprint-core test`.",
  );
}

main();
