import type { MatchResult } from "@specpin/fingerprint-core";
import type { ElementFingerprint } from "@specpin/spec-schema";
import { browser } from "#imports";

// Local-only matching drift corpus: training signal for tuning the hybrid
// scorer. Opt-in (default OFF), capped ring-buffer in storage.local, never
// phoned home. Two sources:
//   - supervised: a user re-pins an orphaned/fuzzy spec, giving ground truth
//     (old fingerprint -> the correct new fingerprint). Also a "Correct"
//     confirmation (new === old, confirmed).
//   - passive: at match time a spec goes orphaned/MID, so we snapshot the old
//     fingerprint plus the candidate fingerprints the scorer weighed (tentative
//     label only).
// Fingerprints only — no HTML, no full page. Every free-text field (text, aria
// label, nearby labels, attribute values) is redacted at write time (email-shaped
// tokens + long digit runs) before anything is persisted.

export const CORPUS_KEY = "specpin:driftCorpus";
export const CORPUS_ENABLED_KEY = "specpin:driftCorpusEnabled";

/** Ring-buffer cap: bounds storage.local use and keeps the export small. Mirrors
 *  the append-only guard style of MAX_MANUAL_BATCHES. */
export const MAX_CORPUS_ENTRIES = 500;

type MatchTier = MatchResult["strategy"];

interface DriftEntryBase {
  /** Page path the drift was observed on (query/hash dropped upstream). */
  pageUrl: string | null;
  /** Owning project/connection, when known. */
  project?: string;
  /** Epoch ms, stamped at write time. */
  ts: number;
}

/** Ground-truth pair: the user re-pinned (or confirmed) a spec's element. */
export interface SupervisedDriftEntry extends DriftEntryBase {
  kind: "supervised";
  old: ElementFingerprint;
  new: ElementFingerprint;
  /** How the OLD fingerprint was matching just before the re-pin. */
  prevStrategy: MatchTier;
  prevConfidence: number;
  /** True for a "Correct" affirmation (new === old), distinct from a re-pin
   *  correction. */
  confirmed?: boolean;
}

/** Context snapshot: a spec went orphaned/MID; store the candidate fingerprints
 *  the scorer weighed. `chosenByScorer` is a TENTATIVE semi-supervised label
 *  (the scorer's guess), never ground truth. */
export interface PassiveDriftEntry extends DriftEntryBase {
  kind: "passive";
  old: ElementFingerprint;
  candidates: ElementFingerprint[];
  /** Index into `candidates` the scorer would have chosen, or undefined when it
   *  abstained. Tentative — consumers must not treat it as truth. */
  chosenByScorer?: number;
  /** Spec id, for dedupe within the suppression window. */
  specId: string;
}

export type DriftEntry = SupervisedDriftEntry | PassiveDriftEntry;

/** Mask email-shaped tokens and long digit runs (>=4) so no obvious PII is
 *  persisted; short numbers/words stay (they aid tuning). Applied at write time
 *  to every free-text fingerprint field (see redactFingerprint). */
export function redactText(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/\S+@\S+\.\S+/g, "[email]").replace(/\d{4,}/g, "[num]");
}

/** Redact every attribute value; enum-like values (role/type) contain no PII
 *  patterns so pass through unchanged, while name/placeholder/href-path do not. */
function redactAttributes(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = redactText(v) ?? v;
  return out;
}

/** Redact all free-text a fingerprint carries — text, aria label, nearby labels,
 *  and attribute values — before it is persisted to the corpus. Structural fields
 *  (selector/xpath/domPath/tag/position) carry no user PII and are left intact. */
function redactFingerprint(fp: ElementFingerprint): ElementFingerprint {
  return {
    ...fp,
    textContent: redactText(fp.textContent),
    ariaLabel: fp.ariaLabel ? redactText(fp.ariaLabel) : fp.ariaLabel,
    nearbyLabels: fp.nearbyLabels?.map((l) => redactText(l) ?? l),
    attributes: redactAttributes(fp.attributes),
  };
}

/** The element-locating signals, excluding `pageUrl` (a page-scope glob edit is
 *  not an element re-pin). True when a save moved the spec to a different element. */
export function fingerprintChanged(a: ElementFingerprint, b: ElementFingerprint): boolean {
  const project = (fp: ElementFingerprint) => JSON.stringify({ ...fp, pageUrl: null });
  return project(a) !== project(b);
}

export async function getCorpusEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(CORPUS_ENABLED_KEY);
  return stored[CORPUS_ENABLED_KEY] === true;
}

export async function setCorpusEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [CORPUS_ENABLED_KEY]: enabled });
}

export async function getCorpus(): Promise<DriftEntry[]> {
  const stored = await browser.storage.local.get(CORPUS_KEY);
  const raw = stored[CORPUS_KEY];
  return Array.isArray(raw) ? (raw as DriftEntry[]) : [];
}

export async function clearCorpus(): Promise<void> {
  await browser.storage.local.remove(CORPUS_KEY);
}

/** Number of stored corpus entries, for the Options count display. */
export async function getCorpusCount(): Promise<number> {
  return (await getCorpus()).length;
}

/** Pretty-printed JSON of the whole corpus for the user-initiated local export.
 *  Round-trips: `JSON.parse` returns the entry array. */
export async function exportCorpusJson(): Promise<string> {
  return JSON.stringify(await getCorpus(), null, 2);
}

// Serialize read-modify-write so concurrent appends (a re-pin racing a passive
// capture) cannot lose an entry. Mirrors the background mutate() chain, kept
// local to the corpus so both write paths share it.
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function redactEntry(entry: DriftEntry): DriftEntry {
  if (entry.kind === "supervised") {
    return { ...entry, old: redactFingerprint(entry.old), new: redactFingerprint(entry.new) };
  }
  return {
    ...entry,
    old: redactFingerprint(entry.old),
    candidates: entry.candidates.map(redactFingerprint),
  };
}

// Read the corpus once, append the (redacted) entries, apply the ring-buffer cap,
// write once. Batching keeps a render burst that yields several passive entries to
// a single storage read-modify-write instead of one per entry.
async function pushEntries(entries: DriftEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const corpus = await getCorpus();
  for (const entry of entries) corpus.push(redactEntry(entry));
  // Ring-buffer: drop oldest past the cap, preserving order.
  if (corpus.length > MAX_CORPUS_ENTRIES) corpus.splice(0, corpus.length - MAX_CORPUS_ENTRIES);
  await browser.storage.local.set({ [CORPUS_KEY]: corpus });
}

/** Append a supervised (re-pin / confirm) entry. Redacts fingerprints and stamps
 *  `ts` at write time; serialized against other corpus writes. */
export function appendEntry(entry: Omit<SupervisedDriftEntry, "ts">): Promise<void> {
  return serialize(() => pushEntries([{ ...entry, ts: Date.now() }]));
}

// A re-rendering page (SPA route churn, React re-renders) can re-run the match
// loop many times a second; without a window every pass would re-record the same
// orphaned/MID spec and flood the ring-buffer. Suppress repeats of the same
// (project, specId, pageUrl) within this window. In-memory: it only needs to hold
// across a live render burst, not across a service-worker restart.
export const PASSIVE_WINDOW_MS = 60_000;
const lastPassiveAt = new Map<string, number>();

function passiveKey(e: Pick<PassiveDriftEntry, "project" | "specId" | "pageUrl">): string {
  return `${e.project ?? ""}|${e.specId}|${e.pageUrl ?? ""}`;
}

/** True the first time a (project, specId, pageUrl) is seen within the window;
 *  records the timestamp so later repeats in the window are suppressed. */
function passiveAllowed(entry: Omit<PassiveDriftEntry, "ts">, now: number): boolean {
  const key = passiveKey(entry);
  const last = lastPassiveAt.get(key);
  if (last !== undefined && now - last < PASSIVE_WINDOW_MS) return false;
  lastPassiveAt.set(key, now);
  return true;
}

/** Append one passive (candidate-snapshot) entry, unless suppressed by the
 *  window. Redacts every candidate's text and stamps `ts`; shares the cap. */
export function appendPassive(entry: Omit<PassiveDriftEntry, "ts">): Promise<void> {
  const now = Date.now();
  if (!passiveAllowed(entry, now)) return Promise.resolve();
  return serialize(() => pushEntries([{ ...entry, ts: now }]));
}

/** Append a batch of passive entries in one storage read-modify-write (a render
 *  pass yields several at once). Each is window-suppressed independently. */
export function appendPassiveMany(entries: Omit<PassiveDriftEntry, "ts">[]): Promise<void> {
  const now = Date.now();
  const allowed = entries.filter((e) => passiveAllowed(e, now)).map((e) => ({ ...e, ts: now }));
  if (allowed.length === 0) return Promise.resolve();
  return serialize(() => pushEntries(allowed));
}
