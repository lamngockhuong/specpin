import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import type { ProjectFlowsScreens } from "../shared/messaging.js";
import type { FlowsEditHandle, ScreensEditHandle } from "./graph-edit-mode.js";
import { fetchProjects } from "./graph-project-load.js";
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
  // `refresh: true` is load-bearing here: RT-H3 needs the LIVE config off disk,
  // not the background's cache, or a teammate's concurrent edit gets clobbered.
  const fresh = await fetchProjects(true);
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

  // Cached read: the write path just reloaded the connection it wrote to.
  const refreshed = await fetchProjects();
  return { ok: true, refreshedProjects: refreshed.projects };
}
