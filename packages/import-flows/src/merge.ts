// merge.ts — the provenance-preserving merge: combines A2's freshly-extracted
// FlowsConfig/ScreensConfig with whatever already lives in .specs/, never
// clobbering hand-authored entries and never touching `screens.transitions`
// (owned by manual authoring + Track B capture, not Track A import). Pure —
// no fs, no schema validation (the caller validates the merged result before
// writing). See phase-A3 "Provenance-preserving merge (design)" for the full
// rationale.
//
// Ownership model: a Flow/Screen id is "import-owned" when it appears in
// `ownedFlowIds`/`ownedScreenIds` — the set the LAST import run declared
// (persisted in `.specs/.import-owned.json`, see owned.ts). An id this run's
// config/adapters produce that already exists in the file but is NOT
// import-owned is hand-authored: mergeFlows/mergeScreens abort with
// `{ ok: false }` rather than silently take it over. A Flow id (or Screen id)
// is either import-owned or hand-owned, not both — mixing across runs for
// the same id is not supported.
//
// Array order: an id that already exists is replaced in place (same array
// position) to keep git diffs minimal; a brand-new id is appended, sorted by
// id so the result does not depend on the config's declaration order.

import type { Flow, FlowsConfig, Screen, ScreensConfig } from "@specpin/spec-schema";

export type MergeResult<T> =
  | { ok: true; config: T; notes: string[] }
  | { ok: false; error: string };

function collisionError(kind: "flow" | "screen", id: string): string {
  return `${kind} id "${id}" is owned by a hand-authored entry; refusing to clobber`;
}

/** Wholesale-replaces every Flow id the config declares this run
 * (`imported.flows`) with the freshly imported Flow; preserves every
 * existing Flow whose id is NOT declared this run (hand-authored). A Flow
 * previously import-owned but no longer declared is pruned. Within a
 * replaced Flow the swap is total — hand-authored states inside an
 * import-owned Flow are not supported. */
export function mergeFlows(
  existing: FlowsConfig,
  imported: FlowsConfig,
  ownedFlowIds: ReadonlySet<string>,
): MergeResult<FlowsConfig> {
  const importedById = new Map(imported.flows.map((f) => [f.id, f]));
  const declaredIds = new Set(importedById.keys());
  const existingById = new Map(existing.flows.map((f) => [f.id, f]));

  for (const id of declaredIds) {
    if (existingById.has(id) && !ownedFlowIds.has(id)) {
      return { ok: false, error: collisionError("flow", id) };
    }
  }

  const flows: Flow[] = [];
  for (const flow of existing.flows) {
    if (declaredIds.has(flow.id)) {
      const updated = importedById.get(flow.id);
      if (updated) flows.push(updated);
      continue;
    }
    if (ownedFlowIds.has(flow.id)) continue; // import-owned, no longer declared -> pruned
    flows.push(flow); // hand-authored, untouched
  }
  const emitted = new Set(flows.map((f) => f.id));
  const fresh = [...importedById.values()]
    .filter((f) => !emitted.has(f.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  flows.push(...fresh);

  return {
    ok: true,
    notes: [],
    config: {
      ...(existing.$schema !== undefined ? { $schema: existing.$schema } : {}),
      version: existing.version,
      flows,
    },
  };
}

/** Upserts every Screen the adapters produced this run (`imported.screens`)
 * by id; preserves every existing screen not produced this run. A screen
 * that WAS import-owned but is no longer produced is dropped, UNLESS a
 * `.specs/shots/<id>.shot.json` still references it (a shot lives on after
 * its source route disappears; deleting the screen would orphan the shot) —
 * in that case it is kept and a note is returned. `existing.transitions` is
 * returned completely untouched (the SAME array reference): screens.json's
 * `transitions[]` is owned by manual authoring + Track B capture, never
 * Track A import. */
export function mergeScreens(
  existing: ScreensConfig,
  imported: ScreensConfig,
  ownedScreenIds: ReadonlySet<string>,
  shotReferencedScreenIds: ReadonlySet<string> = new Set(),
): MergeResult<ScreensConfig> {
  const importedById = new Map(imported.screens.map((s) => [s.id, s]));
  const declaredIds = new Set(importedById.keys());
  const existingById = new Map(existing.screens.map((s) => [s.id, s]));

  for (const id of declaredIds) {
    if (existingById.has(id) && !ownedScreenIds.has(id)) {
      return { ok: false, error: collisionError("screen", id) };
    }
  }

  const notes: string[] = [];
  const screens: Screen[] = [];
  for (const screen of existing.screens) {
    if (declaredIds.has(screen.id)) {
      const updated = importedById.get(screen.id);
      if (updated) screens.push(updated);
      continue;
    }
    if (ownedScreenIds.has(screen.id)) {
      if (shotReferencedScreenIds.has(screen.id)) {
        screens.push(screen);
        notes.push(
          `screen "${screen.id}": no longer produced by import, but a shot still references it — kept`,
        );
      }
      continue; // otherwise pruned: import-owned, no longer produced, no shot reference
    }
    screens.push(screen); // hand-authored, untouched
  }
  const emitted = new Set(screens.map((s) => s.id));
  const fresh = [...importedById.values()]
    .filter((s) => !emitted.has(s.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  screens.push(...fresh);

  return {
    ok: true,
    notes,
    config: {
      ...(existing.$schema !== undefined ? { $schema: existing.$schema } : {}),
      version: existing.version,
      screens,
      transitions: existing.transitions, // never touched — same reference, asserted in tests
    },
  };
}
