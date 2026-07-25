import type { FlowState, Screen, Transition } from "@specpin/spec-schema";

// Field-edit helpers for C1's edit-mode draft (Track C, C2): pure array-update
// functions extracted out of graph-edit-mode.ts to keep that file's growth in
// check (it was already at the plan's 200-line budget after C1). Each mirrors
// the "find by id, refuse when unknown" shape addNode/deleteNode already use;
// updateTransitionFields additionally mirrors removeManualEdge's ownership
// guard, since the editor may only ever rewrite the edges it owns.

export interface EditOpResult {
  ok: boolean;
  error?: string;
}

/** Update an existing screen's editable fields (name/urlGlob/specIds) by id.
 *  Refuses an unknown id -- creating a new node is addNode's job, not this. */
export function updateScreenFields(
  screens: Screen[],
  id: string,
  patch: Partial<Pick<Screen, "name" | "urlGlob" | "specIds">>,
): { screens: Screen[]; result: EditOpResult } {
  const idx = screens.findIndex((s) => s.id === id);
  if (idx === -1) return { screens, result: { ok: false, error: `unknown screen "${id}"` } };
  const next = [...screens];
  next[idx] = { ...next[idx], ...patch };
  return { screens: next, result: { ok: true } };
}

/** Update an existing state's editable fields (label/kind/specId) by id. */
export function updateStateFields(
  states: FlowState[],
  id: string,
  patch: Partial<Pick<FlowState, "label" | "kind" | "specId">>,
): { states: FlowState[]; result: EditOpResult } {
  const idx = states.findIndex((s) => s.id === id);
  if (idx === -1) return { states, result: { ok: false, error: `unknown state "${id}"` } };
  const next = [...states];
  next[idx] = { ...next[idx], ...patch };
  return { states: next, result: { ok: true } };
}

/** Update an existing transition's editable fields (trigger/guard/role/specId)
 *  by id. Refuses an unknown id, or one owned by a non-manual source (mirrors
 *  removeManualEdge's guard in graph-edit-mode.ts): the editor may freely
 *  rewrite its own edges, never someone else's. */
export function updateTransitionFields(
  transitions: Transition[],
  id: string,
  patch: Partial<Pick<Transition, "trigger" | "guard" | "role" | "specId">>,
): { transitions: Transition[]; result: EditOpResult } {
  const idx = transitions.findIndex((t) => t.id === id);
  if (idx === -1) {
    return { transitions, result: { ok: false, error: `unknown transition "${id}"` } };
  }
  const existing = transitions[idx];
  if ((existing.source ?? "manual") !== "manual") {
    return {
      transitions,
      result: {
        ok: false,
        error: `transition "${id}" is owned by "${existing.source}"; not editable here`,
      },
    };
  }
  const next = [...transitions];
  next[idx] = { ...next[idx], ...patch };
  return { transitions: next, result: { ok: true } };
}
