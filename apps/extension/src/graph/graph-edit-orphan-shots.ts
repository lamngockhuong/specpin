// Phase C3's orphaned-shot warning: a pure, DOM-free function so the rule is
// unit-testable without a browser (graph-edit-wiring.ts calls this from
// save(), then shows a confirm before actually persisting). This is
// deliberately a Save-time CONFIRM, not a hard block at delete time -- the
// phase's own risk note is explicit ("do not block hard if shots can't be
// enumerated -- degrade to a generic caution"), so the C1 `hasShotReference`
// delete-time guard (graph-edit-shared-guards.ts) stays unwired/inert; this is
// the "Full orphan UX" that guard's comment deferred to C3.
//
// Screens only: a `.specs/shots/<screenId>.shot.json` references `Screen.id`
// (screens.json), and flows/states have no shot concept.

export interface OrphanWarning {
  /** Exact orphaned-shot count when the project's shot inventory was
   *  enumerable. `undefined` means the inventory could not be read (network
   *  failure, older sidecar, or a local/manual project with no shot
   *  endpoint) -- the caller should show a generic caution instead of a count. */
  count?: number;
}

/** `shotScreenIds`: the project's full shot inventory (screenIds that own a
 *  `.specs/shots/*.shot.json`), or `null` when it could not be enumerated.
 *  `originalScreenIds`/`draftScreenIds`: the screen ids before and after the
 *  in-progress edit session. Returns `null` when there is nothing to warn
 *  about (no screen was removed, or a removed screen owns no shot). */
export function computeOrphanWarning(
  shotScreenIds: string[] | null,
  originalScreenIds: string[],
  draftScreenIds: string[],
): OrphanWarning | null {
  const draftSet = new Set(draftScreenIds);
  const removedIds = originalScreenIds.filter((id) => !draftSet.has(id));
  if (removedIds.length === 0) return null;

  if (shotScreenIds === null) return {};

  const shotSet = new Set(shotScreenIds);
  const orphanedCount = removedIds.filter((id) => shotSet.has(id)).length;
  return orphanedCount > 0 ? { count: orphanedCount } : null;
}
