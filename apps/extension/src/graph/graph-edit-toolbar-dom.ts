import { t } from "../i18n/index.js";
import { createIconButton } from "../shared/icons.js";

// Pure DOM construction for the edit-mode toolbar, split out of
// graph-edit-wiring.ts (already over the plan's 200-line budget). Lives in its
// own bar (`#edit-bar`) below the controls row -- an action button row plus an
// info line (a static how-to hint + the live status message), so the edit
// tools read as a distinct, self-explaining panel instead of being crammed
// into the shared control bar. Holds no state beyond the status text and the
// buttons' enabled flags; every click just forwards to a caller callback.

export interface ToolbarCallbacks {
  addNode(): void;
  addEdge(): void;
  deleteSelected(): void;
  undoLast(): void;
  save(): void;
}

/** Which buttons are actionable for the current selection/draft state. The
 *  wiring recomputes this on every selection or mutation so a disabled button
 *  visibly signals "not applicable yet" (e.g. Add edge needs two nodes). */
export interface ToolbarButtonStates {
  addNode: boolean;
  addEdge: boolean;
  deleteSelected: boolean;
  undo: boolean;
  save: boolean;
}

export interface ToolbarHandle {
  /** The action-button row itself -- callers also mount the C2 flow-controls
   *  into it (wireFlowControls), so the element is exposed, not just its parts. */
  toolbar: HTMLDivElement;
  setStatus(text: string): void;
  setButtonStates(states: ToolbarButtonStates): void;
  /** Show/hide the whole edit bar (row + info line) as one unit. */
  setVisible(visible: boolean): void;
}

export function mountEditToolbar(
  container: HTMLElement,
  callbacks: ToolbarCallbacks,
): ToolbarHandle {
  const toolbar = document.createElement("div");
  toolbar.className = "graph-edit-toolbar";

  // Icon-only buttons (label kept as tooltip + accessible name via
  // createIconButton) so the toolbar stays compact; the persistent hint line
  // below spells out the flow for first-time readers. Icons: add-node = plus,
  // add-edge = connector arrow (never a plus, to stay distinct), delete = trash,
  // undo = return arrow, save = floppy.
  const addNodeBtn = createIconButton(
    document,
    "icon-btn",
    "plus",
    t("graph.edit.addNode"),
    callbacks.addNode,
  );
  const addEdgeBtn = createIconButton(
    document,
    "icon-btn",
    "edge",
    t("graph.edit.addEdge"),
    callbacks.addEdge,
  );
  const deleteBtn = createIconButton(
    document,
    "icon-btn",
    "trash",
    t("graph.edit.deleteSelected"),
    callbacks.deleteSelected,
  );
  const undoBtn = createIconButton(
    document,
    "icon-btn",
    "undo",
    t("graph.edit.undo"),
    callbacks.undoLast,
  );
  const saveBtn = createIconButton(
    document,
    "icon-btn",
    "save",
    t("graph.edit.save"),
    callbacks.save,
  );
  toolbar.append(addNodeBtn, addEdgeBtn, deleteBtn, undoBtn, saveBtn);

  const info = document.createElement("div");
  info.className = "graph-edit-info";
  const hint = document.createElement("span");
  hint.className = "graph-edit-hint";
  hint.textContent = t("graph.edit.hint");
  const status = document.createElement("span");
  status.className = "graph-edit-status";
  status.setAttribute("aria-live", "polite");
  info.append(hint, status);

  container.append(toolbar, info);
  container.hidden = true;

  return {
    toolbar,
    setStatus: (text: string) => {
      status.textContent = text;
    },
    setButtonStates: (states: ToolbarButtonStates) => {
      addNodeBtn.disabled = !states.addNode;
      addEdgeBtn.disabled = !states.addEdge;
      deleteBtn.disabled = !states.deleteSelected;
      undoBtn.disabled = !states.undo;
      saveBtn.disabled = !states.save;
    },
    setVisible: (visible: boolean) => {
      container.hidden = !visible;
    },
  };
}
