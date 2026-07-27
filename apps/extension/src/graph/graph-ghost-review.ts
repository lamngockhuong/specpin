import { t } from "../i18n/index.js";
import type { ProjectFlowsScreens } from "../shared/messaging.js";
import { sendToBackground } from "../shared/messaging.js";
import { normalizeGlobs } from "../shared/record-exclude.js";
import type { GraphEdge } from "./config-to-graph.js";
import type { GhostController } from "./graph-ghost-controller.js";
import type { GhostPanelHandle } from "./graph-ghost-panel.js";
import { fetchProjects } from "./graph-project-load.js";

// Wires a clicked ghost edge to the Approve/Discard panel and the two
// round-trips (Phase B3). Split out of main.ts to keep the entrypoint within
// the plan's 200-line-per-file budget (mirrors graph-project-picker.ts's split
// for the same reason): main.ts owns `projects`/`projectIdx`/`refreshAll`, so
// this module takes them as small callbacks rather than reaching in directly.

export interface GhostReviewDeps {
  /** The currently-selected project, or undefined when none is selected. */
  currentProject(): ProjectFlowsScreens | undefined;
  /** Called after a successful approve (with the freshly re-fetched project
   *  list -- screens.json just changed) or discard (`null`, nothing to
   *  re-fetch beyond the buffer, which this module already refreshed). The
   *  caller re-renders in both cases. */
  onChanged(refreshedProjects: ProjectFlowsScreens[] | null): void;
}

export interface GhostReviewHandle {
  /** Open the panel for a clicked ghost edge. */
  show(edge: GraphEdge): void;
  /** Hide the panel (a background click, a filter change, or a project/
   *  dataset switch all call this -- passthrough to the underlying panel). */
  hide(): void;
}

export function wireGhostReview(
  panel: GhostPanelHandle,
  controller: GhostController,
  deps: GhostReviewDeps,
): GhostReviewHandle {
  async function approve(connectionId: string, transitionId: string): Promise<void> {
    panel.setBusy(true);
    const result = await controller.approve(connectionId, transitionId);
    if (!result.ok) {
      panel.setError(t("graph.ghost.approveError", { error: result.errors?.join("; ") ?? "" }));
      panel.setBusy(false);
      return;
    }
    panel.hide();
    // Cached read: approving just wrote screens.json and reloaded that connection.
    const refreshed = await fetchProjects();
    await controller.refresh();
    deps.onChanged(refreshed.projects);
  }

  async function discard(connectionId: string, transitionId: string): Promise<void> {
    await controller.discard(connectionId, transitionId);
    panel.hide();
    await controller.refresh();
    deps.onChanged(null);
  }

  // "Ignore route": add the edge's destination glob to the project's auto-capture
  // ignore-list. The background stores it, prunes the project's already-buffered
  // entries that now match (this edge + any siblings on the same route), and
  // broadcasts RECORD_TARGETS_CHANGED; we refresh + re-render here so the cleared
  // ghosts drop immediately.
  async function ignoreRoute(
    connectionId: string,
    glob: string,
    current: readonly string[],
  ): Promise<void> {
    panel.setBusy(true);
    const globs = normalizeGlobs([...current, glob]);
    const result = await sendToBackground<{ ok: boolean; error?: string }>({
      type: "SET_RECORD_EXCLUDE",
      connectionId,
      globs,
    });
    if (!result.ok) {
      panel.setError(t("graph.ghost.ignoreError", { error: result.error ?? "" }));
      panel.setBusy(false);
      return;
    }
    panel.hide();
    await controller.refresh();
    deps.onChanged(null);
  }

  return {
    show(edge) {
      const project = deps.currentProject();
      if (!project) return;
      const connectionId = project.connectionId;
      const toGlob = edge.toUrlGlob;
      panel.show(edge.label, {
        onApprove: () => void approve(connectionId, edge.id),
        onDiscard: () => void discard(connectionId, edge.id),
        onIgnore: toGlob
          ? () => void ignoreRoute(connectionId, toGlob, project.recordExclude)
          : undefined,
      });
    },
    hide: () => panel.hide(),
  };
}
