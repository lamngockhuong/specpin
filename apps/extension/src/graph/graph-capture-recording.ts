import { t } from "../i18n/index.js";
import { confirmDialog } from "../shared/dialog.js";
import { isLocalConnectionId, localBatchId } from "../shared/local-id.js";
import { sendToBackground } from "../shared/messaging.js";
import { mountCaptureBanner } from "./graph-capture-banner.js";
import type { GhostController } from "./graph-ghost-controller.js";

// Phase B4 (per-project record rework): wires the capture banner
// (graph-capture-banner.ts) to the CURRENTLY-SELECTED project's record opt-in and
// its draft buffer (GhostController). Recording is per-project now (the old
// device-global switch is gone), so the banner turns recording ON/OFF for the
// selected project alone -- routing to UPDATE_CONNECTION (sidecar) or
// SET_LOCAL_BATCH_RECORD_ENABLED (local) by the connection-id scheme -- and
// "Clear all captured" stays scoped to that same project (never every project).
// The selected project's live record flag is read from the graph's projects list
// via deps (single source of truth); a toggle re-fetches that list so the banner
// re-renders. Split out of main.ts to keep the entrypoint within the 200-line
// budget (mirrors graph-ghost-review.ts).

export interface CaptureRecordingDeps {
  /** The currently-selected project's connection id, or undefined when none is
   *  selected (mirrors GhostReviewDeps.currentProject). */
  currentProjectId(): string | undefined;
  /** The currently-selected project's resolved record opt-in flag. */
  currentRecordEnabled(): boolean;
  /** Called after a successful "Clear all captured" so the caller re-renders the
   *  graph (its ghost edges/nodes just disappeared). */
  onCleared(): void | Promise<void>;
  /** Re-fetch the projects list after a record toggle so the banner reflects the
   *  new per-project flag (recordEnabled lives on that list). */
  onRecordChanged(): void | Promise<void>;
}

export interface CaptureRecordingHandle {
  /** Re-render the banner for the current project + its record state. Call after
   *  the selected project changes or the ghost buffer refreshes. */
  refresh(): void;
}

export function wireCaptureRecording(
  container: HTMLElement,
  ghostController: GhostController,
  deps: CaptureRecordingDeps,
): CaptureRecordingHandle {
  function refresh(): void {
    const projectId = deps.currentProjectId();
    const count = projectId ? ghostController.forProject(projectId).length : 0;
    banner.update(deps.currentRecordEnabled(), count, projectId !== undefined);
  }

  // Toggle the selected project's record opt-in, then re-fetch so the banner
  // reflects the new flag. Routes by the connection-id scheme: a `manual:<id>`
  // id is a local batch (strip the prefix -> batch id); anything else is a sidecar.
  async function setRecord(enabled: boolean): Promise<void> {
    const projectId = deps.currentProjectId();
    if (!projectId) return;
    if (isLocalConnectionId(projectId)) {
      const id = localBatchId(projectId);
      if (id) await sendToBackground({ type: "SET_LOCAL_BATCH_RECORD_ENABLED", id, enabled });
    } else {
      await sendToBackground({ type: "UPDATE_CONNECTION", id: projectId, recordEnabled: enabled });
    }
    await deps.onRecordChanged();
  }

  const banner = mountCaptureBanner(container, {
    onTurnOn: () => setRecord(true),
    onTurnOff: () => setRecord(false),
    onClearAll: async () => {
      const projectId = deps.currentProjectId();
      if (!projectId) return;
      if (!(await confirmDialog({ message: t("graph.capture.confirmClearAll"), danger: true })))
        return;
      await ghostController.clearAll(projectId);
      await ghostController.refresh();
      await deps.onCleared();
    },
  });

  return { refresh };
}
