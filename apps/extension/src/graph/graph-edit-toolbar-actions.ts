import type { ProjectFlowsScreens } from "../shared/messaging.js";
import type { FlowsEditHandle, ScreensEditHandle } from "./graph-edit-mode.js";
import { computeOrphanWarning, type OrphanWarning } from "./graph-edit-orphan-shots.js";
import { saveEditDraft } from "./graph-edit-save.js";
import type { Dataset } from "./graph-project-picker.js";

// Delete-selected + Save, split out of graph-edit-wiring.ts (already at the
// plan's 200-line budget after C1) since both are self-contained given the
// current mode/selection, unlike the form-opening and flow-lifecycle concerns
// that need deeper state access. C3 adds: the orphaned-shot Save confirm, and
// resetDirty() on a successful persist.

export interface ToolbarActionDeps {
  getMode(): ScreensEditHandle | FlowsEditHandle | null;
  getConnectionId(): string | null;
  getKind(): Dataset | null;
  getSelection(): { nodeIds: string[]; edgeId: string | null };
  setStatus(text: string): void;
  /** Clear the selection + hide the field form on a successful delete. */
  reset(): void;
  onChanged(refreshedProjects: ProjectFlowsScreens[] | null): void;
  t(key: string, params?: Record<string, string | number>): string;
  /** C3: the currently open project, read fresh at Save time for the
   *  orphaned-shot check's before/shot-inventory comparison (screens only). */
  currentProject?(): ProjectFlowsScreens | undefined;
  /** C3: ask before a Save that would orphan a shot-referenced screen (or, in
   *  `{}` form, one whose shot inventory could not be verified). Omitted =
   *  always proceed (no confirm). */
  confirmOrphanShots?(warning: OrphanWarning): boolean | Promise<boolean>;
}

export function deleteSelected(deps: ToolbarActionDeps): void {
  const mode = deps.getMode();
  if (!mode) return;
  const { nodeIds, edgeId } = deps.getSelection();
  const result = edgeId
    ? mode.deleteEdge(edgeId)
    : nodeIds.length === 1
      ? mode.deleteNode(nodeIds[0])
      : { ok: false, error: undefined };
  if (!edgeId && nodeIds.length !== 1) {
    deps.setStatus(deps.t("graph.edit.selectOneToDelete"));
    return;
  }
  deps.setStatus(result.ok ? "" : (result.error ?? ""));
  if (result.ok) {
    deps.reset();
    deps.onChanged(null);
  }
}

/** The C3 orphaned-shot Save guard (screens only -- flows/states have no shot
 *  concept). `null` (nothing removed, or nothing removed owns a shot) or an
 *  omitted `confirmOrphanShots` both mean "proceed"; the pure check itself
 *  lives in graph-edit-orphan-shots.ts so it stays unit-testable without a
 *  DOM confirm. */
async function orphanShotsOk(
  deps: ToolbarActionDeps,
  kind: Dataset,
  mode: ScreensEditHandle | FlowsEditHandle,
): Promise<boolean> {
  if (kind !== "screens") return true;
  const project = deps.currentProject?.();
  const warning = computeOrphanWarning(
    project?.shotScreenIds ?? null,
    project?.screens.screens.map((s) => s.id) ?? [],
    (mode as ScreensEditHandle).snapshot().screens.map((s) => s.id),
  );
  if (!warning || !deps.confirmOrphanShots) return true;
  return deps.confirmOrphanShots(warning);
}

/** Persist the draft. Returns whether it succeeded (C3: the wiring layer's
 *  leave-guard uses this to decide whether it is now safe to leave). Clears
 *  the mode's dirty flag on a real success (C3). */
export async function save(deps: ToolbarActionDeps): Promise<boolean> {
  const mode = deps.getMode();
  const connectionId = deps.getConnectionId();
  const kind = deps.getKind();
  if (!mode || !connectionId || !kind) return false;
  if (!(await orphanShotsOk(deps, kind, mode))) return false;
  deps.setStatus(deps.t("graph.edit.saving"));
  const result = await saveEditDraft(kind, connectionId, mode);
  if (!result.ok) {
    deps.setStatus(deps.t("graph.edit.saveError", { error: result.error ?? "" }));
    return false;
  }
  mode.resetDirty();
  deps.setStatus(deps.t("graph.edit.saved"));
  deps.onChanged(result.refreshedProjects ?? null);
  return true;
}
