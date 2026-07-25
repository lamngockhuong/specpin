import { plural, t } from "../i18n/index.js";
import type { OrphanWarning } from "./graph-edit-orphan-shots.js";

// Phase C3's two confirm-based guards, split out of the graph entrypoint
// (main.ts) purely to hold that file under the plan's 200-line budget --
// both are thin wrappers around native `confirm`/`alert`, with no state of
// their own beyond what the caller passes in.

export interface LeaveGuardDeps {
  isDirty(): boolean;
  save(): Promise<boolean>;
}

/** The confirm-discard guard: checked before leaving edit mode, switching
 *  project/dataset, or (see main.ts's separate `beforeunload` listener --
 *  browsers allow no custom buttons there) closing the tab. A clean draft
 *  never prompts. A dirty one gets two native, synchronous confirms --
 *  Save-then-leave, or Discard-then-leave -- so all three outcomes (save /
 *  discard / stay) are reachable without a bespoke modal. */
export async function confirmLeaveIfDirty(deps: LeaveGuardDeps): Promise<boolean> {
  if (!deps.isDirty()) return true;
  if (window.confirm(t("graph.edit.confirmSaveBeforeLeave"))) {
    const saved = await deps.save();
    if (!saved) window.alert(t("graph.edit.saveFailedStay"));
    return saved;
  }
  return window.confirm(t("graph.edit.confirmDiscard"));
}

/** The orphaned-shot Save confirm (graph-edit-wiring.ts's save() calls this
 *  via EditWiringDeps.confirmOrphanShots): a generic caution when the shot
 *  inventory couldn't be verified (`warning.count` undefined), an exact count
 *  otherwise. */
export function confirmOrphanShots(warning: OrphanWarning): boolean {
  const message =
    warning.count === undefined
      ? t("graph.edit.orphanShotWarningGeneric")
      : plural(
          warning.count,
          "graph.edit.orphanShotWarningOne",
          "graph.edit.orphanShotWarningOther",
        );
  return window.confirm(message);
}
