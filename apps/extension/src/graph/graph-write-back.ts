import type { Screen, ScreensConfig, Transition } from "@specpin/spec-schema";
import { formatErrors, validateScreens } from "@specpin/spec-schema";

// The ONE client-side write-back + provenance-preserving merge helper shared by
// Track B's ghost-edge approve (B3, source: "auto-captured") and Track C's
// in-browser graph editor (C1, source: "manual"). Pure -- no storage, no
// messaging, no fs -- so both callers can unit-test the merge itself without a
// browser or a sidecar. See plan.md "Provenance-preserving merge (central
// correctness risk)" and phase-B3's CRITICAL note: built once here, reused by
// C1, never duplicated.
//
// Screen nodes carry no `source` field (only Transition does), so the only
// safe "never clobber" rule for a node is upsert-by-identity, never overwrite:
// an incoming screen is inserted ONLY when neither its id NOR its urlGlob
// already names a committed screen (phase-B3 "Ghost/committed identity
// clashes" -- a ghost candidate's guessed id must not shadow a differently-id'd
// screen that already covers the same live URL). When a candidate is skipped
// for that reason, any incoming transition referencing its id is remapped to
// the existing screen's id instead, so the written edge is never left dangling.
//
// Transitions DO carry `source`, so they get real ownership: upsert by id,
// stamped with the caller's `source`; an id that already exists under a
// DIFFERENT source is a clobber attempt and aborts the whole merge (no partial
// write) rather than silently taking over another source's edge.

export type TransitionSource = NonNullable<Transition["source"]>;

export interface ScreensMergeInput {
  /** The current (freshly-read) ScreensConfig to merge into. */
  config: ScreensConfig;
  /** Screen nodes to add if genuinely new (see identity-clash rule above). */
  screens?: Screen[];
  /** Transitions to upsert; `source` is stamped by the merge, not read from
   *  the input value (a caller may pass its own already-tagged Transition, as
   *  B3's capture buffer entries do -- the merge is the single place that
   *  decides the FINAL source). */
  transitions?: Transition[];
  /** The source every transition in this merge is attributed to. */
  source: TransitionSource;
}

export interface ScreensMergeResult {
  ok: boolean;
  config?: ScreensConfig;
  errors?: string[];
}

/** Upsert candidate screen nodes by identity (id OR urlGlob already committed
 *  -> skip, never overwrite). Returns the resulting node list plus a map from
 *  every INCOMING candidate id to the id its edges should actually reference
 *  (itself when freshly inserted or already-identical by id, the existing
 *  screen's id when only the urlGlob collided). */
function upsertScreensByIdentity(
  existing: Screen[],
  incoming: Screen[],
): { screens: Screen[]; idRemap: Map<string, string> } {
  const idSet = new Set(existing.map((s) => s.id));
  const urlGlobToId = new Map(existing.map((s) => [s.urlGlob, s.id]));
  const screens = [...existing];
  const idRemap = new Map<string, string>();

  for (const candidate of incoming) {
    if (idSet.has(candidate.id)) {
      idRemap.set(candidate.id, candidate.id);
      continue;
    }
    const sameUrlGlobId = urlGlobToId.get(candidate.urlGlob);
    if (sameUrlGlobId) {
      idRemap.set(candidate.id, sameUrlGlobId);
      continue;
    }
    screens.push(candidate);
    idSet.add(candidate.id);
    urlGlobToId.set(candidate.urlGlob, candidate.id);
    idRemap.set(candidate.id, candidate.id);
  }
  return { screens, idRemap };
}

/** Upsert transitions by id, stamping `source` on every one and remapping
 *  `from`/`to` through `idRemap` (so an edge whose candidate screen collapsed
 *  onto an existing node still resolves). An id that already exists under a
 *  DIFFERENT source refuses to overwrite (collected as an error, checked by
 *  the caller) -- own-source re-merges (idempotent re-approve) succeed. */
function mergeTransitionsBySource(
  existing: Transition[],
  incoming: Transition[],
  source: TransitionSource,
  idRemap: Map<string, string>,
): { transitions: Transition[]; errors: string[] } {
  const byId = new Map(existing.map((t) => [t.id, t]));
  const errors: string[] = [];
  const remap = (id: string) => idRemap.get(id) ?? id;

  for (const t of incoming) {
    const stamped: Transition = { ...t, from: remap(t.from), to: remap(t.to), source };
    const current = byId.get(stamped.id);
    const currentSource = current?.source ?? "manual";
    if (current && currentSource !== source) {
      errors.push(
        `transition "${stamped.id}" is owned by source "${currentSource}"; refusing to overwrite with "${source}"`,
      );
      continue;
    }
    byId.set(stamped.id, stamped);
  }
  return { transitions: [...byId.values()], errors };
}

/** Merge candidate screens + transitions into a ScreensConfig, provenance-
 *  preserving and validated. Returns `{ ok: false, errors }` (no partial
 *  result) on any clobber attempt or schema violation -- the caller must never
 *  write a result this function did not mark `ok: true`. */
export function mergeScreensConfig(input: ScreensMergeInput): ScreensMergeResult {
  const { config, source } = input;
  const { screens, idRemap } = upsertScreensByIdentity(config.screens, input.screens ?? []);
  const { transitions, errors } = mergeTransitionsBySource(
    config.transitions,
    input.transitions ?? [],
    source,
    idRemap,
  );
  if (errors.length) return { ok: false, errors };

  const merged: ScreensConfig = {
    ...(config.$schema !== undefined ? { $schema: config.$schema } : {}),
    version: config.version,
    screens,
    transitions,
  };
  const validation = validateScreens(merged);
  if (!validation.valid) return { ok: false, errors: [formatErrors(validation.errors)] };
  return { ok: true, config: merged };
}

// --- Track C (C1): the in-browser editor's screens save path. Unlike B3's
// additive-only approve (which only ever ADDS a candidate), the editor freely
// rewrites -- including DELETING -- the entries it owns. So the merge here is
// "replace the owned slice, preserve everything else" rather than upsert-only:
// every transition whose *effective* source (missing defaults to "manual")
// equals the caller's `source` is fully replaced by the draft's version of
// that slice (a deletion in the draft really disappears); any transition under
// a DIFFERENT source is carried over from `current` untouched, and the merge
// still refuses to drop a node such a preserved transition needs (defense in
// depth on top of the editor's own live delete-guard). graph-write-back-flows.ts
// applies the identical rule to FlowsConfig -- exported here so it stays one
// definition, not two.

/** True when `t`'s effective source (undefined defaults to "manual", per the
 *  schema) is the one this merge call owns. */
export function isOwnedBy(t: Transition, source: TransitionSource): boolean {
  return (t.source ?? "manual") === source;
}

export interface ScreensDraftMergeInput {
  /** The current (freshly-read) ScreensConfig to merge into. */
  config: ScreensConfig;
  /** The draft's full desired screen list (additions AND removals apply). */
  screens: Screen[];
  /** The draft's full desired transition list, of any source (see
   *  FlowsMergeInput.transitions -- same "only the owned slice applies" rule). */
  transitions: Transition[];
  source: TransitionSource;
}

/** The editor's screens save path: same "replace the owned slice, preserve +
 *  never-orphan the rest" semantics as mergeFlowsConfig, composed on top of
 *  the UNCHANGED mergeScreensConfig (B3's contract stays exact) by pre-pruning
 *  `config` to what must survive, then letting mergeScreensConfig's existing
 *  upsert/dedupe/validate do the rest for the owned slice being added back. */
export function mergeScreensDraft(input: ScreensDraftMergeInput): ScreensMergeResult {
  const { config, source } = input;
  const preserved = config.transitions.filter((t) => !isOwnedBy(t, source));
  const neededIds = new Set(preserved.flatMap((t) => [t.from, t.to]));
  const screensById = new Map(input.screens.map((s) => [s.id, s]));
  for (const id of neededIds) {
    if (screensById.has(id)) continue;
    const orig = config.screens.find((s) => s.id === id);
    if (orig) screensById.set(id, orig);
  }
  const strippedConfig: ScreensConfig = {
    ...config,
    screens: [...screensById.values()],
    transitions: preserved,
  };
  const owned = input.transitions.filter((t) => isOwnedBy(t, source));
  return mergeScreensConfig({ config: strippedConfig, transitions: owned, source });
}
