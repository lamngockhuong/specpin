import type { FlowState, FlowsConfig, Transition } from "@specpin/spec-schema";
import type { Graph } from "./config-to-graph.js";
import { flowsToGraph } from "./config-to-graph.js";
import { createDirtyTracker } from "./graph-edit-dirty.js";
import type { EditOpResult } from "./graph-edit-field-ops.js";
import { updateStateFields, updateTransitionFields } from "./graph-edit-field-ops.js";
import {
  cascadeRemoveNodeEdges,
  nodeDeleteGuardError,
  removeManualEdge,
  upsertManualEdge,
} from "./graph-edit-shared-guards.js";

// The flows-side twin of createScreensEditMode (graph-edit-mode.ts), split
// into its own file purely to hold both under the plan's 200-line budget --
// see that file's header comment for the shared draft/re-render rationale.
// C3's dirty/undo tracking mirrors that file's `withUndo` wrapper too.

interface FlowsDraft {
  states: FlowState[];
  transitions: Transition[];
}

export interface FlowsEditHandle {
  getGraph(locale: string, defaultLocale?: string): Graph;
  addNode(state: FlowState): EditOpResult;
  deleteNode(id: string): EditOpResult;
  /** C2: edit an existing state's label/kind/specId by id. */
  updateNode(
    id: string,
    patch: Partial<Pick<FlowState, "label" | "kind" | "specId">>,
  ): EditOpResult;
  addEdge(edge: Transition): EditOpResult;
  deleteEdge(id: string): EditOpResult;
  /** C2: edit an existing manual-owned transition's fields by id. */
  updateEdge(
    id: string,
    patch: Partial<Pick<Transition, "trigger" | "guard" | "role" | "specId">>,
  ): EditOpResult;
  /** The draft's full current states + transitions for THIS flow, ready for
   *  mergeFlowsConfig (graph-write-back-flows.ts). */
  snapshot(): { flowId: string; states: FlowState[]; transitions: Transition[] };
  /** C3: see ScreensEditHandle.isDirty. */
  isDirty(): boolean;
  /** C3: see ScreensEditHandle.resetDirty. */
  resetDirty(): void;
  /** C3: see ScreensEditHandle.undoLast. */
  undoLast(): EditOpResult;
}

/** Edit-mode over one Flow's states/transitions within a FlowsConfig (the
 *  other flows render read-only alongside it). Null when `flowId` is not a
 *  flow in `config` -- create it first via graph-edit-flow-crud.ts's
 *  createFlowInConfig, then open this over the freshly-saved config. */
export function createFlowsEditMode(config: FlowsConfig, flowId: string): FlowsEditHandle | null {
  const original = config.flows.find((f) => f.id === flowId);
  if (!original) return null;

  let states: FlowState[] = [...original.states];
  let transitions: Transition[] = [...original.transitions];
  const tracker = createDirtyTracker<FlowsDraft>();

  /** See graph-edit-mode.ts's `withUndo` -- identical shape (snapshot before
   *  mutate, but only commit that snapshot to the tracker once `mutate`
   *  actually succeeds, so a refused mutation can't clobber the one kept undo
   *  snapshot with a no-op state), over states instead of screens. */
  function withUndo(mutate: () => EditOpResult): EditOpResult {
    const before = { states, transitions };
    const result = mutate();
    if (result.ok) tracker.commit(before);
    return result;
  }

  return {
    getGraph: (locale, defaultLocale) => {
      const flows = config.flows.map((f) =>
        f.id === flowId ? { ...original, states, transitions } : f,
      );
      return flowsToGraph({ ...config, flows }, locale, defaultLocale);
    },

    addNode(state) {
      return withUndo(() => {
        if (states.some((s) => s.id === state.id)) {
          return { ok: false, error: `a state with id "${state.id}" already exists` };
        }
        states = [...states, state];
        return { ok: true };
      });
    },

    deleteNode(id) {
      return withUndo(() => {
        const error = nodeDeleteGuardError(transitions, id);
        if (error) return { ok: false, error };
        states = states.filter((s) => s.id !== id);
        transitions = cascadeRemoveNodeEdges(transitions, id);
        return { ok: true };
      });
    },

    updateNode(id, patch) {
      return withUndo(() => {
        const r = updateStateFields(states, id, patch);
        states = r.states;
        return r.result;
      });
    },

    addEdge(edge) {
      return withUndo(() => {
        if (!states.some((s) => s.id === edge.from) || !states.some((s) => s.id === edge.to)) {
          return { ok: false, error: "edge references an unknown state" };
        }
        const result = upsertManualEdge(transitions, edge);
        if (result.error) return { ok: false, error: result.error };
        transitions = result.edges;
        return { ok: true };
      });
    },

    deleteEdge(id) {
      return withUndo(() => {
        const result = removeManualEdge(transitions, id);
        if (result.error) return { ok: false, error: result.error };
        transitions = result.edges;
        return { ok: true };
      });
    },

    updateEdge(id, patch) {
      return withUndo(() => {
        const r = updateTransitionFields(transitions, id, patch);
        transitions = r.transitions;
        return r.result;
      });
    },

    snapshot: () => ({ flowId, states: [...states], transitions: [...transitions] }),

    isDirty: () => tracker.isDirty(),
    resetDirty: () => tracker.resetDirty(),
    undoLast() {
      const snapshot = tracker.undoLast();
      if (!snapshot) return { ok: false, error: "nothing to undo" };
      states = snapshot.states;
      transitions = snapshot.transitions;
      return { ok: true };
    },
  };
}
