import type { Flow, FlowsConfig, LocalizedString } from "@specpin/spec-schema";
import { formatErrors, validateFlows } from "@specpin/spec-schema";

// Whole-Flow lifecycle for the graph editor's create-from-scratch story (Track
// C, C2): unlike graph-write-back-flows.ts's mergeFlowsConfig (which rewrites
// one EXISTING flow's states/transitions, provenance-preserving), these three
// operations add/rename/remove an entire Flow entry in a FlowsConfig. Kept in
// their own module rather than folded into graph-write-back-flows.ts: that
// file's merge is a distinct, already-tested contract (states/transitions
// ownership), and whole-flow CRUD has no ownership concern at all (a brand new
// flow starts empty; renaming/deleting only ever touches the flow's own
// `object` or its presence in the list) -- mixing the two would blur one
// focused file into two.

export interface FlowCrudResult {
  ok: boolean;
  config?: FlowsConfig;
  errors?: string[];
}

function withFlows(config: FlowsConfig, flows: Flow[]): FlowsConfig {
  return {
    ...(config.$schema !== undefined ? { $schema: config.$schema } : {}),
    version: config.version,
    flows,
  };
}

function validated(config: FlowsConfig): FlowCrudResult {
  const validation = validateFlows(config);
  if (!validation.valid) return { ok: false, errors: [formatErrors(validation.errors)] };
  return { ok: true, config };
}

/** A brand-new, empty Flow: `{ id, object, states: [], transitions: [] }`, the
 *  literal shape the phase's create-from-scratch story names. Pure value
 *  builder -- callers append it via createFlowInConfig. */
export function createEmptyFlow(id: string, object: LocalizedString): Flow {
  return { id, object, states: [], transitions: [] };
}

/** Append a brand-new Flow to a FlowsConfig. Refuses when its id already names
 *  a flow (never overwrites); validated like every other write-back merge. */
export function createFlowInConfig(config: FlowsConfig, flow: Flow): FlowCrudResult {
  if (config.flows.some((f) => f.id === flow.id)) {
    return { ok: false, errors: [`a flow with id "${flow.id}" already exists`] };
  }
  return validated(withFlows(config, [...config.flows, flow]));
}

/** Rename a Flow's `object` (LocalizedString) in place, leaving its states and
 *  transitions untouched. Refuses an unknown flow id. */
export function renameFlowInConfig(
  config: FlowsConfig,
  flowId: string,
  object: LocalizedString,
): FlowCrudResult {
  if (!config.flows.some((f) => f.id === flowId)) {
    return { ok: false, errors: [`unknown flow "${flowId}"`] };
  }
  const flows = config.flows.map((f) => (f.id === flowId ? { ...f, object } : f));
  return validated(withFlows(config, flows));
}

/** Delete a Flow by id. Deleting the last remaining flow leaves `flows: []`,
 *  which is schema-valid (no minItems on FlowsConfig.flows) -- a valid, empty
 *  config to compose the next flow into. Refuses an unknown flow id. */
export function deleteFlowInConfig(config: FlowsConfig, flowId: string): FlowCrudResult {
  if (!config.flows.some((f) => f.id === flowId)) {
    return { ok: false, errors: [`unknown flow "${flowId}"`] };
  }
  return validated(
    withFlows(
      config,
      config.flows.filter((f) => f.id !== flowId),
    ),
  );
}
