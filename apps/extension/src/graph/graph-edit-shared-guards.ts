import type { Transition } from "@specpin/spec-schema";

// Node/edge ownership guards shared by both edit-mode factories
// (createScreensEditMode + createFlowsEditMode in graph-edit-mode.ts /
// graph-edit-mode-flows.ts): split out purely to hold each of those files
// under the plan's 200-line budget, since C1 already used most of it and C2
// adds updateNode/updateEdge on top.

/** A non-manual (imported/auto-captured) edge touching `nodeId` -- the
 *  guard both deleteNode implementations share: never let the editor orphan
 *  an edge it does not own. */
export function nonManualEdgeRefs(edges: Transition[], nodeId: string): boolean {
  return edges.some(
    (t) => (t.from === nodeId || t.to === nodeId) && (t.source ?? "manual") !== "manual",
  );
}

/** Drop every edge touching `nodeId`. Only ever called after the guard above
 *  passed, so every edge this removes is one the editor owns (manual/absent). */
export function cascadeRemoveNodeEdges(edges: Transition[], nodeId: string): Transition[] {
  return edges.filter((t) => t.from !== nodeId && t.to !== nodeId);
}

/** deleteNode's shared guard, screens + flows alike: refuse when a non-manual
 *  edge still needs the node, or (screens only) a shot references it. Undefined
 *  `hasShotReference` (flows has no shots) just skips that second check. */
export function nodeDeleteGuardError(
  transitions: Transition[],
  id: string,
  hasShotReference?: (id: string) => boolean,
): string | undefined {
  if (nonManualEdgeRefs(transitions, id)) return `"${id}" is still used by a non-manual edge`;
  if (hasShotReference?.(id)) return `"${id}" is referenced by a spec sheet (.specs/shots)`;
  return undefined;
}

/** Upsert a manually-authored edge by id, stamping `source: "manual"`.
 *  Refuses (no mutation) when the id already names a non-manual edge -- the
 *  editor may freely add/rewrite its own edges, never someone else's. */
export function upsertManualEdge(
  edges: Transition[],
  next: Transition,
): { edges: Transition[]; error?: string } {
  const existing = edges.find((t) => t.id === next.id);
  if (existing && (existing.source ?? "manual") !== "manual") {
    return {
      edges,
      error: `transition "${next.id}" is owned by "${existing.source}"; not editable here`,
    };
  }
  const stamped: Transition = { ...next, source: "manual" };
  return { edges: [...edges.filter((t) => t.id !== next.id), stamped] };
}

/** Remove a manually-authored edge by id. Refuses on an unknown id or one
 *  owned by a non-manual source (approve/discard those via Track B instead). */
export function removeManualEdge(
  edges: Transition[],
  id: string,
): { edges: Transition[]; error?: string } {
  const existing = edges.find((t) => t.id === id);
  if (!existing) return { edges, error: `unknown transition "${id}"` };
  if ((existing.source ?? "manual") !== "manual") {
    return {
      edges,
      error: `transition "${id}" is owned by "${existing.source}"; not deletable here`,
    };
  }
  return { edges: edges.filter((t) => t.id !== id) };
}
