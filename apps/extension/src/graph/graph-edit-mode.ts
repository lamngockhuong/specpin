import type { Screen, ScreensConfig, Transition } from "@specpin/spec-schema";
import type { Graph } from "./config-to-graph.js";
import { screensToGraph } from "./config-to-graph.js";
import { createDirtyTracker } from "./graph-edit-dirty.js";
import type { EditOpResult } from "./graph-edit-field-ops.js";
import { updateScreenFields, updateTransitionFields } from "./graph-edit-field-ops.js";
import { cascadeRemoveNodeEdges, upsertManualEdge } from "./graph-edit-shared-guards.js";

interface ScreensDraft {
  screens: Screen[];
  transitions: Transition[];
  /** Ids of auto-captured edges the draft has taken over (see `adopted` below). */
  adopted: Set<string>;
}

const isNonManual = (t: Transition): boolean => (t.source ?? "manual") !== "manual";

// Track C (C1)'s edit-mode: an in-memory DRAFT held over the raw
// FlowsConfig/ScreensConfig (never the derived Graph -- config-to-graph.ts's
// flow node-id prefixing stays strictly inside that module, per the phase's
// "id-prefix leak" risk). Every mutation re-derives the Graph via
// flowsToGraph/screensToGraph so rendering is reused verbatim; only the
// caller (graph-edit-wiring.ts) touches the DOM. `snapshot()` hands the
// caller exactly the shape mergeScreensDraft/mergeFlowsConfig expect on Save.
//
// This file holds only the SCREENS side. The flows side (createFlowsEditMode)
// lives in graph-edit-mode-flows.ts, the shared ownership guards in
// graph-edit-shared-guards.ts, and C2's field-edit array math in
// graph-edit-field-ops.ts -- split four ways purely to hold each file under
// the plan's 200-line budget (this one was already at it after C1).
// Re-exported here so existing `from "./graph-edit-mode.js"` imports
// (graph-edit-wiring.ts) keep working unchanged.

export type { EditOpResult } from "./graph-edit-field-ops.js";
export { createEmptyFlow } from "./graph-edit-flow-crud.js";
export type { FlowsEditHandle } from "./graph-edit-mode-flows.js";
export { createFlowsEditMode } from "./graph-edit-mode-flows.js";

export interface ScreensEditOpts {
  /** Basic screen-delete shot guard (phase C1's "specshot" interaction note):
   *  a `.specs/shots/<screenId>.shot.json` references `Screen.id`, so deleting
   *  a referenced screen would orphan it. Full orphan UX (listing/resolving
   *  affected shots) is C3's job; this is the live-in-editor backstop that
   *  blocks the delete outright. Defaults to "no shots known" when the
   *  caller has no shot inventory wired up yet. */
  hasShotReference?(screenId: string): boolean;
}

export interface ScreensEditHandle {
  getGraph(locale: string, defaultLocale?: string): Graph;
  addNode(screen: Screen): EditOpResult;
  deleteNode(id: string): EditOpResult;
  /** C2: edit an existing screen's name/urlGlob/specIds by id. */
  updateNode(
    id: string,
    patch: Partial<Pick<Screen, "name" | "urlGlob" | "specIds">>,
  ): EditOpResult;
  addEdge(edge: Transition): EditOpResult;
  /** Delete an edge; an auto-captured one is taken over (adopted) so it stays
   *  deleted after Save rather than being preserved back from the live config. */
  deleteEdge(id: string): EditOpResult;
  /** C2: edit a transition's fields by id; an auto-captured one is reclassified
   *  to manual (adopted) so the edit persists instead of being refused. */
  updateEdge(
    id: string,
    patch: Partial<Pick<Transition, "trigger" | "guard" | "role" | "specId">>,
  ): EditOpResult;
  /** The draft's full current screens + transitions, ready for
   *  mergeScreensDraft (graph-write-back.ts). `adopted` lists the auto-captured
   *  edges the editor took over (edited or deleted) so Save reclassifies them to
   *  manual instead of preserving the stale auto-captured copy. */
  snapshot(): { screens: Screen[]; transitions: Transition[]; adopted: string[] };
  /** C3: true once any mutation has succeeded since construction or the last
   *  resetDirty(). */
  isDirty(): boolean;
  /** C3: clear the dirty flag (call after a successful Save). */
  resetDirty(): void;
  /** C3: revert the single last successful mutation (KISS -- no multi-level
   *  history). `{ ok: false }` when there is nothing to undo. */
  undoLast(): EditOpResult;
}

/** Edit-mode over a ScreensConfig draft. */
export function createScreensEditMode(
  config: ScreensConfig,
  opts: ScreensEditOpts = {},
): ScreensEditHandle {
  let screens: Screen[] = [...config.screens];
  let transitions: Transition[] = [...config.transitions];
  // Auto take-ownership: editing or deleting an auto-captured edge reclassifies
  // it to manual. We record its id here (never mutating the set in place -- each
  // op builds a fresh Set) so Save (mergeScreensDraft) drops the stale
  // auto-captured copy from the preserved slice and the draft's version wins.
  let adopted = new Set<string>();
  const tracker = createDirtyTracker<ScreensDraft>();

  /** Snapshot the pre-mutation draft, run `mutate`, and only THEN hand that
   *  snapshot to the tracker + mark dirty -- and only when the mutation
   *  actually succeeded. A refused mutation (duplicate id, unknown id, an
   *  ownership guard...) leaves the draft untouched, so it must also leave
   *  the tracker untouched: capturing the snapshot unconditionally would
   *  overwrite the single kept undo snapshot with state that's identical to
   *  current, making a later undoLast() a silent no-op. */
  function withUndo(mutate: () => EditOpResult): EditOpResult {
    const before = { screens, transitions, adopted };
    const result = mutate();
    if (result.ok) tracker.commit(before);
    return result;
  }

  return {
    getGraph: (locale, defaultLocale) =>
      screensToGraph({ ...config, screens, transitions }, locale, defaultLocale),

    addNode(screen) {
      return withUndo(() => {
        if (screens.some((s) => s.id === screen.id)) {
          return { ok: false, error: `a screen with id "${screen.id}" already exists` };
        }
        screens = [...screens, screen];
        return { ok: true };
      });
    },

    deleteNode(id) {
      return withUndo(() => {
        // A shot still references it -> the one hard block that remains.
        if (opts.hasShotReference?.(id)) {
          return { ok: false, error: `"${id}" is referenced by a spec sheet (.specs/shots)` };
        }
        // Auto take-ownership: adopt every auto-captured edge touching the node
        // so the cascade can remove them (and Save won't resurrect them) --
        // deleting a node no longer refuses just because an auto-captured edge
        // still points at it.
        const blocking = transitions.filter(
          (t) => (t.from === id || t.to === id) && isNonManual(t),
        );
        if (blocking.length) adopted = new Set([...adopted, ...blocking.map((t) => t.id)]);
        screens = screens.filter((s) => s.id !== id);
        transitions = cascadeRemoveNodeEdges(transitions, id);
        return { ok: true };
      });
    },

    updateNode(id, patch) {
      return withUndo(() => {
        const r = updateScreenFields(screens, id, patch);
        screens = r.screens;
        return r.result;
      });
    },

    addEdge(edge) {
      return withUndo(() => {
        if (!screens.some((s) => s.id === edge.from) || !screens.some((s) => s.id === edge.to)) {
          return { ok: false, error: "edge references an unknown screen" };
        }
        const result = upsertManualEdge(transitions, edge);
        if (result.error) return { ok: false, error: result.error };
        transitions = result.edges;
        return { ok: true };
      });
    },

    deleteEdge(id) {
      return withUndo(() => {
        const existing = transitions.find((t) => t.id === id);
        if (!existing) return { ok: false, error: `unknown transition "${id}"` };
        // Auto take-ownership on delete: an auto-captured edge is removed like a
        // manual one, but its id is adopted so Save drops the stale copy too
        // (otherwise mergeScreensDraft would preserve and resurrect it).
        if (isNonManual(existing)) adopted = new Set(adopted).add(id);
        transitions = transitions.filter((t) => t.id !== id);
        return { ok: true };
      });
    },

    updateEdge(id, patch) {
      return withUndo(() => {
        const existing = transitions.find((t) => t.id === id);
        if (!existing) return { ok: false, error: `unknown transition "${id}"` };
        // Auto take-ownership on edit: reclassify an auto-captured edge to manual
        // (and adopt its id) before the field patch, so editing it "just works"
        // and Save persists the edited manual version instead of refusing.
        if (isNonManual(existing)) {
          transitions = transitions.map((t) => (t.id === id ? { ...t, source: "manual" } : t));
          adopted = new Set(adopted).add(id);
        }
        const r = updateTransitionFields(transitions, id, patch);
        transitions = r.transitions;
        return r.result;
      });
    },

    snapshot: () => ({
      screens: [...screens],
      transitions: [...transitions],
      adopted: [...adopted],
    }),

    isDirty: () => tracker.isDirty(),
    resetDirty: () => tracker.resetDirty(),
    undoLast() {
      const snapshot = tracker.undoLast();
      if (!snapshot) return { ok: false, error: "nothing to undo" };
      screens = snapshot.screens;
      transitions = snapshot.transitions;
      adopted = snapshot.adopted;
      return { ok: true };
    },
  };
}
