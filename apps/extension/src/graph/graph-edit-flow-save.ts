import type { Flow, LocalizedString } from "@specpin/spec-schema";
import type { ProjectFlowsScreens } from "../shared/messaging.js";
import {
  createFlowInConfig,
  deleteFlowInConfig,
  renameFlowInConfig,
} from "./graph-edit-flow-crud.js";
import { fetchProjects } from "./graph-project-load.js";
import { dispatchWriteFlows } from "./graph-write-dispatch.js";

// Whole-Flow lifecycle save round-trip (Track C, C2): the create/rename/delete
// twin of graph-edit-save.ts's per-flow states/transitions Save. Same shape --
// re-read the live FlowsConfig (RT-H3: never write against a possibly-stale
// snapshot), apply one of graph-edit-flow-crud.ts's pure ops, dispatch -- kept
// in its own file since it operates on the FULL FlowsConfig rather than one
// flow's draft, so it has no `mode`/snapshot() to share with that module.

export interface FlowActionResult {
  ok: boolean;
  error?: string;
  /** The freshly re-fetched project list on success, for the caller's
   *  onChanged callback (mirrors SaveEditDraftResult). */
  refreshedProjects?: ProjectFlowsScreens[];
}

async function withFreshFlows(
  connectionId: string,
  apply: (config: ProjectFlowsScreens["flows"]) => {
    ok: boolean;
    config?: unknown;
    errors?: string[];
  },
): Promise<FlowActionResult> {
  // `refresh: true` is load-bearing: RT-H3 needs the LIVE FlowsConfig off disk,
  // not the background's cache (see graph-edit-save.ts, same contract).
  const fresh = await fetchProjects(true);
  const project = fresh.projects.find((p) => p.connectionId === connectionId);
  if (!project) return { ok: false, error: "project no longer available" };

  const result = apply(project.flows);
  if (!result.ok || !result.config) return { ok: false, error: result.errors?.join("; ") ?? "" };

  const dispatch = await dispatchWriteFlows(
    connectionId,
    result.config as ProjectFlowsScreens["flows"],
  );
  if (!dispatch.ok) return { ok: false, error: dispatch.errors?.join("; ") ?? "" };

  // Cached read: the write path just reloaded the connection it wrote to.
  const refreshed = await fetchProjects();
  return { ok: true, refreshedProjects: refreshed.projects };
}

/** Append a brand-new flow to `connectionId`'s project and save it. */
export function createFlow(connectionId: string, flow: Flow): Promise<FlowActionResult> {
  return withFreshFlows(connectionId, (config) => createFlowInConfig(config, flow));
}

/** Rename an existing flow's `object` and save it. */
export function renameFlow(
  connectionId: string,
  flowId: string,
  object: LocalizedString,
): Promise<FlowActionResult> {
  return withFreshFlows(connectionId, (config) => renameFlowInConfig(config, flowId, object));
}

/** Delete an existing flow and save it. */
export function deleteFlow(connectionId: string, flowId: string): Promise<FlowActionResult> {
  return withFreshFlows(connectionId, (config) => deleteFlowInConfig(config, flowId));
}
