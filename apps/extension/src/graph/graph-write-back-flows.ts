import type { Flow, FlowState, FlowsConfig, Transition } from "@specpin/spec-schema";
import { formatErrors, validateFlows } from "@specpin/spec-schema";
import { isOwnedBy, type TransitionSource } from "./graph-write-back.js";

// The flows-side twin of graph-write-back.ts's `mergeScreensDraft` (Track C,
// C1): FlowsConfig nests states/transitions inside one Flow, so it needs its
// own merge, but the semantics are identical -- see that file's Track C
// header comment for the full "replace the owned slice, preserve + never-
// orphan the rest" rationale. Split into its own module (not appended to
// graph-write-back.ts) purely to keep both files under the plan's 200-line
// budget; `isOwnedBy` is the one piece of logic shared between them.

export interface FlowsMergeInput {
  /** The current (freshly-read) FlowsConfig to merge into. */
  config: FlowsConfig;
  /** Which Flow (by id) this call edits; must already exist in `config` --
   *  creating a brand-new flow is C2's "create-from-scratch" scope. */
  flowId: string;
  /** The draft's full desired state list for this flow (additions AND
   *  removals both take effect -- states carry no `source`, so ownership does
   *  not apply; only the non-manual-edge node guard below protects them). */
  states: FlowState[];
  /** The draft's full desired transition list for this flow, of ANY source --
   *  only the ones this call owns (`source` param) are applied; others are
   *  ignored (the preserved slice already carries them over from `current`). */
  transitions: Transition[];
  /** The source this merge call owns and may freely rewrite. */
  source: TransitionSource;
}

export interface FlowsMergeResult {
  ok: boolean;
  config?: FlowsConfig;
  errors?: string[];
}

/** Merge one flow's edited states/transitions into a FlowsConfig, carrying
 *  every other-source transition over untouched and never dropping a node one
 *  of those still needs. Dedupes by id (a repeated id in the draft keeps the
 *  last). Provenance-preserving and validated, mirroring mergeScreensConfig's
 *  contract: `{ ok: false, errors }` on any clobber attempt or schema
 *  violation, never a partial result. */
export function mergeFlowsConfig(input: FlowsMergeInput): FlowsMergeResult {
  const { config, flowId, source } = input;
  const idx = config.flows.findIndex((f) => f.id === flowId);
  if (idx === -1) return { ok: false, errors: [`unknown flow "${flowId}"`] };
  const currentFlow = config.flows[idx];

  const preserved = currentFlow.transitions.filter((t) => !isOwnedBy(t, source));
  const preservedIds = new Set(preserved.map((t) => t.id));
  const ownedById = new Map<string, Transition>();
  for (const t of input.transitions) {
    if (!isOwnedBy(t, source)) continue;
    ownedById.set(t.id, { ...t, source });
  }
  const errors = [...ownedById.keys()]
    .filter((id) => preservedIds.has(id))
    .map((id) => `transition "${id}" is owned by a different source; refusing to overwrite`);
  if (errors.length) return { ok: false, errors };

  const transitions = [...preserved, ...ownedById.values()];
  const neededStateIds = new Set(preserved.flatMap((t) => [t.from, t.to]));
  const statesById = new Map(input.states.map((s) => [s.id, s]));
  for (const id of neededStateIds) {
    if (statesById.has(id)) continue;
    const orig = currentFlow.states.find((s) => s.id === id);
    if (orig) statesById.set(id, orig);
  }
  const mergedFlow: Flow = { ...currentFlow, states: [...statesById.values()], transitions };
  const flows = config.flows.map((f, i) => (i === idx ? mergedFlow : f));

  const merged: FlowsConfig = {
    ...(config.$schema !== undefined ? { $schema: config.$schema } : {}),
    version: config.version,
    flows,
  };
  const validation = validateFlows(merged);
  if (!validation.valid) return { ok: false, errors: [formatErrors(validation.errors)] };
  return { ok: true, config: merged };
}
