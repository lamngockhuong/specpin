import type { Flow, LocalizedString } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { confirmDialog } from "../shared/dialog.js";
import type { ProjectFlowsScreens } from "../shared/messaging.js";
import { createEmptyFlow } from "./graph-edit-flow-crud.js";
import { showCreateFlow, showRenameFlow } from "./graph-edit-flow-form.js";
import { createFlow, deleteFlow, renameFlow } from "./graph-edit-flow-save.js";

// "New flow" / "Rename flow" / "Delete flow" toolbar buttons (Track C, C2):
// the whole-Flow lifecycle actions, split out of graph-edit-wiring.ts (already
// at the plan's 200-line budget after C1) since these are immediate
// read-fresh-merge-dispatch round trips (graph-edit-flow-save.ts), unlike the
// per-flow states/transitions draft the rest of that file edits.

export interface FlowControlsDeps {
  connectionId(): string | null;
  /** The Flow currently scoped for node/edge editing, or null when the
   *  project has none yet (the create-from-scratch starting point). */
  activeFlow(): Flow | null;
  /** Every flow in the current project, for the "flow to edit" picker. */
  allFlows(): Flow[];
  /** The active flow's id, so the picker can mark it selected. */
  activeFlowId(): string | null;
  locale(): string;
  /** Fires after a create/rename/delete succeeds. The caller re-binds its own
   *  FlowsEditHandle to `flowId` (null = "pick a sensible default, or none
   *  remain") from the refreshed project list and re-renders. */
  onFlowsChanged(refreshedProjects: ProjectFlowsScreens[] | null, flowId: string | null): void;
  /** User picked a different flow to edit -- the caller re-scopes its
   *  FlowsEditHandle to `flowId` (guarding an unsaved draft first). */
  onSelectFlow(flowId: string): void;
}

export interface FlowControlsHandle {
  /** Show/hide the buttons + flow picker -- only relevant for the flows
   *  dataset. Also refreshes the picker's options/selection each time. */
  setVisible(visible: boolean): void;
}

export function wireFlowControls(
  toolbar: HTMLElement,
  formContainer: HTMLElement,
  deps: FlowControlsDeps,
): FlowControlsHandle {
  // Flow picker: choose which flow's states/transitions to edit when the file
  // holds several. Only shown with 2+ flows (nothing to pick otherwise). The
  // rest render read-only alongside the active one, so this is how the reader
  // reaches them. Sits ahead of the lifecycle buttons in the toolbar row.
  const flowSelect = document.createElement("select");
  flowSelect.className = "graph-edit-flow-select";
  flowSelect.setAttribute("aria-label", t("graph.edit.flowPicker"));
  flowSelect.title = t("graph.edit.flowPicker");
  flowSelect.addEventListener("change", () => deps.onSelectFlow(flowSelect.value));

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.textContent = t("graph.edit.newFlow");
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.textContent = t("graph.edit.renameFlowAction");
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = t("graph.edit.deleteFlowAction");
  toolbar.append(flowSelect, newBtn, renameBtn, deleteBtn);

  /** Rebuild the picker options from the current project's flows and mark the
   *  active one selected. Hidden unless there are at least two flows. */
  function renderFlowOptions(): void {
    const flows = deps.allFlows();
    const activeId = deps.activeFlowId();
    flowSelect.replaceChildren();
    for (const flow of flows) {
      const option = document.createElement("option");
      option.value = flow.id;
      option.textContent = resolveLocalized(flow.object, deps.locale()) || flow.id;
      option.selected = flow.id === activeId;
      flowSelect.appendChild(option);
    }
    flowSelect.hidden = flows.length < 2;
  }

  function setVisible(visible: boolean): void {
    newBtn.hidden = !visible;
    const hasFlow = visible && deps.activeFlow() !== null;
    renameBtn.hidden = !hasFlow;
    deleteBtn.hidden = !hasFlow;
    if (visible) renderFlowOptions();
    else flowSelect.hidden = true;
  }

  newBtn.addEventListener("click", () => {
    const connectionId = deps.connectionId();
    if (!connectionId) return;
    showCreateFlow(formContainer, deps.locale(), async (id, object) => {
      const result = await createFlow(connectionId, createEmptyFlow(id, object));
      if (result.ok) deps.onFlowsChanged(result.refreshedProjects ?? null, id);
      return { ok: result.ok, error: result.error };
    });
  });

  renameBtn.addEventListener("click", () => {
    const connectionId = deps.connectionId();
    const flow = deps.activeFlow();
    if (!connectionId || !flow) return;
    showRenameFlow(formContainer, deps.locale(), flow.object, async (object: LocalizedString) => {
      const result = await renameFlow(connectionId, flow.id, object);
      if (result.ok) deps.onFlowsChanged(result.refreshedProjects ?? null, flow.id);
      return { ok: result.ok, error: result.error };
    });
  });

  deleteBtn.addEventListener("click", () => {
    void (async () => {
      const connectionId = deps.connectionId();
      const flow = deps.activeFlow();
      if (!connectionId || !flow) return;
      const confirmed = await confirmDialog({
        message: t("graph.edit.confirmDeleteFlow"),
        danger: true,
      });
      if (!confirmed) return;
      const result = await deleteFlow(connectionId, flow.id);
      if (result.ok) deps.onFlowsChanged(result.refreshedProjects ?? null, null);
    })();
  });

  setVisible(false);
  return { setVisible };
}
