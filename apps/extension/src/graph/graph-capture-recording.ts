import { t } from "../i18n/index.js";
import { getRecordMode, setRecordMode, watchRecordMode } from "../shared/config.js";
import { confirmDialog } from "../shared/dialog.js";
import { mountCaptureBanner } from "./graph-capture-banner.js";
import type { GhostController } from "./graph-ghost-controller.js";

// Phase B4: wires the capture banner (graph-capture-banner.ts) to the live
// recordMode flag (shared/config.ts) and the draft buffer (GhostController),
// and drives its two actions: Turn off (flip the opt-in flag, reachable from
// wherever the banner shows -- never just a checkbox on a settings page the
// user may not have open) and Clear all captured (B2's CLEAR_CAPTURE_BUFFER,
// scoped to the CURRENTLY SELECTED project, never every project). Split out
// of main.ts to keep the entrypoint within the plan's 200-line-per-file
// budget (mirrors graph-ghost-review.ts's split for the same reason).

export interface CaptureRecordingDeps {
  /** The currently-selected project's connection id, or undefined when none
   *  is selected (mirrors GhostReviewDeps.currentProject). */
  currentProjectId(): string | undefined;
  /** Called after a successful "Clear all captured" so the caller re-renders
   *  the graph (its ghost edges/nodes just disappeared). */
  onCleared(): void | Promise<void>;
}

export interface CaptureRecordingHandle {
  /** Re-render the banner for the current project + recording state. Call
   *  after the selected project changes or the ghost buffer refreshes. */
  refresh(): void;
}

export function wireCaptureRecording(
  container: HTMLElement,
  ghostController: GhostController,
  deps: CaptureRecordingDeps,
): CaptureRecordingHandle {
  let recording = false;

  function refresh(): void {
    const projectId = deps.currentProjectId();
    const count = projectId ? ghostController.forProject(projectId).length : 0;
    banner.update(recording, count);
  }

  const banner = mountCaptureBanner(container, {
    onTurnOff: async () => {
      await setRecordMode(false);
      recording = false;
      refresh();
    },
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

  // Reflect a flip made elsewhere (the Options page, another tab) live -- the
  // same storage.onChanged path the recorder itself uses to attach/detach.
  watchRecordMode((on) => {
    recording = on;
    refresh();
  });
  void getRecordMode().then((on) => {
    recording = on;
    refresh();
  });

  return { refresh };
}
