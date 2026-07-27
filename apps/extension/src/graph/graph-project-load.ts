import type { FlowsScreensResult, ProjectFlowsScreens } from "../shared/messaging.js";
import { sendToBackground } from "../shared/messaging.js";

// The graph panel's two-phase project load. Phase one (`fetchProjects()`) is
// answered from the background's storage-hydrated registry with no network, so
// the panel paints at once -- Manual-import projects in particular never needed a
// server, and used to sit blank behind a dead sidecar's request timeouts. Phase
// two (`loadSidecarProjects()`) pays for the round-trip and folds in whatever
// came online, and runs at all only when phase one reported `pending > 0`.
// Split out of the graph entrypoint, which is already well past its size budget.

/** One round-trip to the background. `refresh` opts into the sidecar network
 *  wait; omitted, this resolves as fast as storage does. */
export function fetchProjects(refresh?: boolean): Promise<FlowsScreensResult> {
  return sendToBackground<FlowsScreensResult>({ type: "GET_FLOWS_SCREENS", refresh });
}

/** A cheap identity for a projects list. Lets phase two skip re-rendering (and
 *  the picker re-populate that implies) when it returns exactly what phase one
 *  already showed -- the common case when every configured sidecar is down. */
export function projectsSignature(list: ProjectFlowsScreens[]): string {
  return list
    .map(
      (p) =>
        `${p.connectionId}:${p.recordEnabled}:${p.flows.flows.length}:` +
        `${p.screens.screens.length}:${p.screens.transitions.length}:${p.specs.length}`,
    )
    .join("|");
}

/** Phase two: await the sidecar round-trip and return the list to paint, or
 *  `null` when the caller should leave the canvas alone. Failure is not fatal --
 *  the panel keeps whatever phase one gave it.
 *
 *  `before` is the list currently on screen; `isDirty` reports an open edit
 *  draft, which a refresh landing mid-edit must never overwrite. Reporting the
 *  result rather than invoking callbacks keeps the caller in charge of the
 *  order its own state changes in (it must clear the "connecting" flag before
 *  painting, so the empty canvas falls back to "nothing configured"). */
export async function loadSidecarProjects(
  before: ProjectFlowsScreens[],
  isDirty: () => boolean,
): Promise<ProjectFlowsScreens[] | null> {
  let list = before;
  try {
    list = (await fetchProjects(true)).projects;
  } catch {
    // Unreachable background (worker torn down mid-flight): keep phase one's list.
  }
  if (isDirty()) return null;
  // Repaint when the set actually moved, or when nothing is on screen -- there
  // the placeholder itself just changed from "connecting" to "nothing configured".
  if (before.length === 0 || projectsSignature(list) !== projectsSignature(before)) return list;
  return null;
}
