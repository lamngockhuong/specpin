import type { Screen, Transition } from "@specpin/spec-schema";
import type { EditFormHandle } from "./graph-edit-form.js";
import type { FlowsEditHandle, ScreensEditHandle } from "./graph-edit-mode.js";
import type { Dataset } from "./graph-project-picker.js";

// Node/edge form open + wire-up, split out of graph-edit-wiring.ts (already at
// the plan's 200-line budget after C1) so its selection/toolbar/save/flow-
// lifecycle wiring has room. Reads the RAW node/edge from the draft's
// snapshot() -- the derived Graph carries only a resolved display label, never
// the editable LocalizedString map (see graph-edit-form.ts's header comment).

export interface NodeFormWiringDeps {
  getMode(): ScreensEditHandle | FlowsEditHandle | null;
  getKind(): Dataset | null;
  form: EditFormHandle;
  /** A live field edit applied successfully -- caller debounces the re-render. */
  onLiveApplied(): void;
  /** A create applied successfully -- caller clears selection + re-renders now. */
  onCreated(): void;
}

/** Screen.specIds edits touch only index 0 (the phase's "specId via
 *  specIds[0]" scope) -- any further ids an import/capture already attached
 *  are carried over untouched. */
function withFirstSpecId(
  existing: string[] | undefined,
  specId: string | null,
): string[] | undefined {
  const rest = (existing ?? []).slice(1);
  if (!specId) return rest.length ? rest : undefined;
  return [specId, ...rest];
}

/** Open (or hide) the field-edit form for the current selection. */
export function updateFormForSelection(
  deps: NodeFormWiringDeps,
  selectedNodeIds: string[],
  selectedEdgeId: string | null,
): void {
  const mode = deps.getMode();
  if (!mode) {
    deps.form.hide();
    return;
  }

  if (selectedEdgeId) {
    const id = selectedEdgeId;
    const raw = mode.snapshot().transitions.find((t) => t.id === id);
    if (!raw) {
      deps.form.hide();
      return;
    }
    const editable = (raw.source ?? "manual") === "manual";
    deps.form.showEditTransition(
      {
        trigger: raw.trigger,
        guard: raw.guard ?? null,
        role: raw.role ?? null,
        specId: raw.specId ?? null,
      },
      editable,
      (values) => {
        const result = mode.updateEdge(id, values);
        if (result.ok) deps.onLiveApplied();
        return result;
      },
    );
    return;
  }

  if (selectedNodeIds.length !== 1) {
    deps.form.hide();
    return;
  }
  const id = selectedNodeIds[0];

  if (deps.getKind() === "screens") {
    const screensMode = mode as ScreensEditHandle;
    const raw = screensMode.snapshot().screens.find((s) => s.id === id);
    if (!raw) {
      deps.form.hide();
      return;
    }
    deps.form.showEditScreen(
      { name: raw.name, urlGlob: raw.urlGlob, specId: raw.specIds?.[0] ?? null },
      (values) => {
        const result = screensMode.updateNode(id, {
          name: values.name,
          urlGlob: values.urlGlob,
          specIds: withFirstSpecId(raw.specIds, values.specId),
        });
        if (result.ok) deps.onLiveApplied();
        return result;
      },
    );
    return;
  }

  const flowsMode = mode as FlowsEditHandle;
  const raw = flowsMode.snapshot().states.find((s) => s.id === id);
  if (!raw) {
    deps.form.hide();
    return;
  }
  deps.form.showEditState(
    { label: raw.label, kind: raw.kind, specId: raw.specId ?? null },
    (values) => {
      const result = flowsMode.updateNode(id, values);
      if (result.ok) deps.onLiveApplied();
      return result;
    },
  );
}

/** Open the create-node form (replacing C1's window.prompt "Add node"). */
export function openCreateNode(deps: NodeFormWiringDeps): void {
  const mode = deps.getMode();
  if (!mode) return;

  if (deps.getKind() === "screens") {
    const screensMode = mode as ScreensEditHandle;
    deps.form.showCreateScreen((id, values) => {
      const screen: Screen = { id, name: values.name, urlGlob: values.urlGlob };
      if (values.specId) screen.specIds = [values.specId];
      const result = screensMode.addNode(screen);
      if (result.ok) deps.onCreated();
      return result;
    });
    return;
  }

  const flowsMode = mode as FlowsEditHandle;
  deps.form.showCreateState((id, values) => {
    const result = flowsMode.addNode({
      id,
      label: values.label,
      kind: values.kind,
      specId: values.specId ?? undefined,
    });
    if (result.ok) deps.onCreated();
    return result;
  });
}

/** Open the create-edge form for an already-armed node pair (replacing C1's
 *  window.prompt "Add edge"). */
export function openCreateEdge(deps: NodeFormWiringDeps, from: string, to: string): void {
  const mode = deps.getMode();
  if (!mode) return;
  deps.form.showCreateTransition((values) => {
    const edge: Transition = { id: crypto.randomUUID(), from, to, trigger: values.trigger };
    if (values.guard) edge.guard = values.guard;
    if (values.role) edge.role = values.role;
    if (values.specId) edge.specId = values.specId;
    const result = mode.addEdge(edge);
    if (result.ok) deps.onCreated();
    return result;
  });
}
