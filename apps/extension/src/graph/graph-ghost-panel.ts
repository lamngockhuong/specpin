import { t } from "../i18n/index.js";

// Inline Approve/Discard control for a clicked ghost edge (Phase B3). Split out
// of main.ts to keep the entrypoint within the plan's 200-line-per-file budget
// (mirrors graph-project-picker.ts's split for the same reason). Built ONCE
// into `container` (a fixed panel in the page, like the existing #hint box);
// `show`/`hide` just toggle visibility and rebind the current callbacks rather
// than rebuilding the DOM on every click. Text content only -- no innerHTML --
// since the edge's trigger label is user/spec-author content (CSP risk note).

export interface GhostPanelCallbacks {
  onApprove(): void | Promise<void>;
  onDiscard(): void;
}

export interface GhostPanelHandle {
  /** Show the panel for one ghost edge, replacing whatever was shown before. */
  show(label: string, callbacks: GhostPanelCallbacks): void;
  /** Hide the panel and drop the current callbacks (a background click, a
   *  filter change, or a completed approve/discard all call this). */
  hide(): void;
  /** Disable both buttons while an approve/discard round-trip is in flight. */
  setBusy(busy: boolean): void;
  /** Show (or clear, when null) an inline error under the label. */
  setError(message: string | null): void;
}

export function mountGhostPanel(container: HTMLElement): GhostPanelHandle {
  let current: GhostPanelCallbacks | null = null;

  const label = document.createElement("div");
  label.className = "ghost-panel-label";
  const note = document.createElement("div");
  note.className = "ghost-panel-note";
  note.textContent = t("graph.ghost.note");
  const errorEl = document.createElement("div");
  errorEl.className = "ghost-panel-error";
  errorEl.hidden = true;

  const actions = document.createElement("div");
  actions.className = "ghost-panel-actions";
  const approveBtn = document.createElement("button");
  approveBtn.type = "button";
  approveBtn.textContent = t("graph.ghost.approve");
  approveBtn.addEventListener("click", () => void current?.onApprove());
  const discardBtn = document.createElement("button");
  discardBtn.type = "button";
  discardBtn.textContent = t("graph.ghost.discard");
  discardBtn.addEventListener("click", () => current?.onDiscard());
  actions.append(approveBtn, discardBtn);

  container.append(label, note, errorEl, actions);
  container.hidden = true;

  return {
    show(text, callbacks) {
      current = callbacks;
      label.textContent = text;
      errorEl.hidden = true;
      approveBtn.disabled = false;
      discardBtn.disabled = false;
      container.hidden = false;
    },
    hide() {
      current = null;
      container.hidden = true;
    },
    setBusy(busy) {
      approveBtn.disabled = busy;
      discardBtn.disabled = busy;
    },
    setError(message) {
      errorEl.hidden = !message;
      errorEl.textContent = message ?? "";
    },
  };
}
