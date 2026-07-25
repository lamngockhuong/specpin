import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import type { FlowsScreensResult, ProjectFlowsScreens } from "../shared/messaging.js";
import { sendToBackground } from "../shared/messaging.js";
import type { FlowsEditHandle, ScreensEditHandle } from "./graph-edit-mode.js";
import type { Dataset } from "./graph-project-picker.js";
import { mergeScreensDraft } from "./graph-write-back.js";
import { mergeFlowsConfig } from "./graph-write-back-flows.js";
import { dispatchWriteFlows, dispatchWriteScreens } from "./graph-write-dispatch.js";

// The editor toolbar's Save pipeline (Track C, C1), split out of
// graph-edit-wiring.ts for the 200-line budget: re-read the live flows/
// screens (RT-H3 -- never merge against a possibly-stale snapshot taken when
// edit mode was turned on), merge the draft in, and dispatch the write.

export interface SaveEditDraftResult {
  ok: boolean;
  error?: string;
  /** The freshly re-fetched project list on success (the committed config
   *  just changed), for the caller to hand to its onChanged callback. */
  refreshedProjects?: ProjectFlowsScreens[];
}

export async function saveEditDraft(
  kind: Dataset,
  connectionId: string,
  mode: ScreensEditHandle | FlowsEditHandle,
): Promise<SaveEditDraftResult> {
  const fresh = await sendToBackground<FlowsScreensResult>({ type: "GET_FLOWS_SCREENS" });
  const project = fresh.projects.find((p) => p.connectionId === connectionId);
  if (!project) return { ok: false, error: "project no longer available" };

  const merged =
    kind === "screens"
      ? mergeScreensDraft({
          config: project.screens,
          ...(mode as ScreensEditHandle).snapshot(),
          source: "manual",
        })
      : mergeFlowsConfig({
          config: project.flows,
          ...(mode as FlowsEditHandle).snapshot(),
          source: "manual",
        });
  if (!merged.ok || !merged.config) return { ok: false, error: merged.errors?.join("; ") ?? "" };

  const dispatch =
    kind === "screens"
      ? await dispatchWriteScreens(connectionId, merged.config as ScreensConfig)
      : await dispatchWriteFlows(connectionId, merged.config as FlowsConfig);
  if (!dispatch.ok) return { ok: false, error: dispatch.errors?.join("; ") ?? "" };

  const refreshed = await sendToBackground<FlowsScreensResult>({ type: "GET_FLOWS_SCREENS" });
  return { ok: true, refreshedProjects: refreshed.projects };
}
