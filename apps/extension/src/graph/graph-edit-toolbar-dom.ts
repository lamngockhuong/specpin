import { t } from "../i18n/index.js";

// Pure DOM construction for the edit-mode toolbar row (Add node/edge, Delete,
// Undo, Save + a status span), split out of graph-edit-wiring.ts (already
// over the plan's 200-line budget) since it holds no state beyond the status
// text and every click just forwards to a caller-supplied callback.

export interface ToolbarCallbacks {
  addNode(): void;
  addEdge(): void;
  deleteSelected(): void;
  undoLast(): void;
  save(): void;
}

export interface ToolbarHandle {
  /** The toolbar row itself -- callers also mount the C2 flow-controls into
   *  it (wireFlowControls), so the element is exposed, not just its parts. */
  toolbar: HTMLDivElement;
  setStatus(text: string): void;
}

export function mountEditToolbar(
  container: HTMLElement,
  callbacks: ToolbarCallbacks,
): ToolbarHandle {
  const toolbar = document.createElement("div");
  toolbar.className = "ghost-panel-actions";
  toolbar.hidden = true;

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  const status = document.createElement("span");
  toolbar.append(
    button(t("graph.edit.addNode"), callbacks.addNode),
    button(t("graph.edit.addEdge"), callbacks.addEdge),
    button(t("graph.edit.deleteSelected"), callbacks.deleteSelected),
    button(t("graph.edit.undo"), callbacks.undoLast),
    button(t("graph.edit.save"), callbacks.save),
    status,
  );
  container.appendChild(toolbar);

  return {
    toolbar,
    setStatus: (text: string) => {
      status.textContent = text;
    },
  };
}
