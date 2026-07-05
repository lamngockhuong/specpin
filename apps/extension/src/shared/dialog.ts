import { t } from "../i18n/index.js";

// Dependency-free, CSP-safe modal dialogs that replace the browser-native
// prompt()/confirm() (which pop unstyled chrome outside our Shadow DOM and are
// blocked in some content-script contexts). One primitive serves both worlds:
// the content-script capture form (mount into its ShadowRoot) and the extension
// pages like Options (mount into the document). No caller value ever reaches
// innerHTML; messages and labels are trusted i18n strings set via textContent.

/** Where the dialog mounts. A ShadowRoot keeps it inside an isolated tree (capture
 *  form); a Document mounts it on `document.body` (Options/popup pages). Both
 *  resolve the `--sp-*` design tokens (`:host` in shadow, `:root` in the page). */
export type DialogRoot = Document | ShadowRoot;

// Live dialogs, tracked by their backdrop element + a cancel thunk that tears the
// dialog down (resolve cancel, remove the keydown listener, detach the backdrop).
// Callers that bind their own Escape handler (the capture form binds keydown on
// `document` in the capture phase, which fires before a shadow-mounted dialog) read
// `anyDialogOpen()` to early-return while a dialog is up, so Escape closes only the
// dialog. The set, not a bare counter, lets us self-heal: if a dialog's host is torn
// down without it resolving (e.g. the capture form re-opens, removing the shadow the
// dialog lives in), its backdrop detaches and the next `anyDialogOpen()` prunes it,
// so a stale entry can never permanently wedge the caller's Escape handling.
const active = new Set<{ backdrop: HTMLElement; cancel: () => void }>();

/** True while at least one dialog is open. Prunes dialogs whose backdrop has been
 *  detached from the DOM (cancelling them) before answering, so a torn-down host
 *  never leaves a phantom "open" dialog behind. */
export function anyDialogOpen(): boolean {
  for (const rec of [...active]) {
    if (!rec.backdrop.isConnected) rec.cancel();
  }
  return active.size > 0;
}

export interface PromptOptions {
  /** Trusted label text (i18n); rendered via textContent. */
  message: string;
  initial?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  root?: DialogRoot;
}

export interface ConfirmOptions {
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (used for delete/clear actions). */
  danger?: boolean;
  root?: DialogRoot;
}

const STYLE_MARK = "data-sp-dialog";

// Scoped to `.sp-dlg-*` so the injected rules never collide with host-page or
// extension-page styles. Reuses the same `--sp-*` tokens the rest of the UI uses,
// so the modal tracks the active light/dark theme on either surface.
const DIALOG_CSS = `
.sp-dlg-backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: var(--sp-overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.sp-dlg-card {
  width: 360px; max-width: 92vw;
  background: var(--sp-surface); color: var(--sp-text);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  padding: 24px;
  font: 15px/1.5 var(--sp-font-ui);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}
.sp-dlg-msg { margin: 0 0 14px; font-weight: 600; }
.sp-dlg-input {
  width: 100%; box-sizing: border-box; padding: 10px 12px;
  font: 15px/1.4 var(--sp-font-ui);
  color: var(--sp-text); background: var(--sp-elevated);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
}
.sp-dlg-input::placeholder { color: var(--sp-text-3); }
.sp-dlg-input:focus {
  outline: none; border-color: var(--sp-accent);
  box-shadow: 0 0 0 3px var(--sp-accent-glow);
}
.sp-dlg-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.sp-dlg-btn {
  padding: 10px 18px;
  font: 600 15px/1 var(--sp-font-ui);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
  background: var(--sp-control); color: var(--sp-text); cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.sp-dlg-btn:hover { filter: brightness(0.97); }
.sp-dlg-btn.primary {
  background: var(--sp-accent); color: var(--sp-accent-on); border-color: var(--sp-accent);
  box-shadow: 0 0 0 4px var(--sp-accent-glow);
}
.sp-dlg-btn.primary:hover { background: var(--sp-accent-hover); border-color: var(--sp-accent-hover); filter: none; }
.sp-dlg-btn.danger {
  background: var(--sp-error-bg); color: var(--sp-error-text); border-color: var(--sp-error-border);
}
.sp-dlg-btn.danger:hover { filter: brightness(0.97); }
`;

/** Mount surfaces for a root, resolved without `instanceof` (which is unreliable
 *  across realms, e.g. happy-dom in tests). A Document is nodeType 9; a ShadowRoot
 *  is a DocumentFragment (nodeType 11). `doc` owns createElement; `styleHost` takes
 *  the injected stylesheet; `mountHost` takes the backdrop. */
function surfacesOf(root: DialogRoot): {
  doc: Document;
  styleHost: ParentNode;
  mountHost: ParentNode;
} {
  if (root.nodeType === 9) {
    const d = root as Document;
    return { doc: d, styleHost: d.head, mountHost: d.body };
  }
  const sr = root as ShadowRoot;
  return { doc: sr.ownerDocument, styleHost: sr, mountHost: sr };
}

/** Inject the dialog stylesheet once per mount root (the shadow root, or the page's
 *  <head>). Idempotent: a second dialog in the same root reuses the first style. */
function ensureStyle(doc: Document, styleHost: ParentNode): void {
  if (styleHost.querySelector(`style[${STYLE_MARK}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_MARK, "");
  style.textContent = DIALOG_CSS;
  styleHost.appendChild(style);
}

/** Core builder shared by prompt + confirm. Resolves the input's value on OK
 *  (`""` when there is no input field, i.e. a confirm), or `null` on cancel
 *  (Escape / Cancel / backdrop). The two public wrappers map that to their own
 *  shapes, so the builder needs no generics or result mappers. */
function buildDialog(
  root: DialogRoot,
  opts: {
    message: string;
    okLabel: string;
    cancelLabel: string;
    danger?: boolean;
    input?: { initial?: string; placeholder?: string };
  },
): Promise<string | null> {
  const { doc, styleHost, mountHost } = surfacesOf(root);
  ensureStyle(doc, styleHost);

  const backdrop = doc.createElement("div");
  backdrop.className = "sp-dlg-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const card = doc.createElement("div");
  card.className = "sp-dlg-card";

  const msg = doc.createElement("p");
  msg.className = "sp-dlg-msg";
  msg.textContent = opts.message;
  card.appendChild(msg);

  let inputEl: HTMLInputElement | null = null;
  if (opts.input) {
    inputEl = doc.createElement("input");
    inputEl.type = "text";
    inputEl.className = "sp-dlg-input";
    if (opts.input.initial) inputEl.value = opts.input.initial;
    if (opts.input.placeholder) inputEl.placeholder = opts.input.placeholder;
    card.appendChild(inputEl);
  }

  const actions = doc.createElement("div");
  actions.className = "sp-dlg-actions";
  const cancelBtn = doc.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "sp-dlg-btn";
  cancelBtn.textContent = opts.cancelLabel;
  const okBtn = doc.createElement("button");
  okBtn.type = "button";
  okBtn.className = `sp-dlg-btn ${opts.danger ? "danger" : "primary"}`;
  okBtn.textContent = opts.okLabel;
  actions.append(cancelBtn, okBtn);
  card.appendChild(actions);
  backdrop.appendChild(card);
  mountHost.appendChild(backdrop);

  return new Promise<string | null>((resolve) => {
    let done = false;
    // OK resolves the field value (`""` for a confirm's missing input); cancel
    // resolves null.
    const confirm = (): void => finish(inputEl ? inputEl.value : "");
    const cancel = (): void => finish(null);
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      active.delete(record);
      doc.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent): void => {
      // The dialog has only a text input (no textarea), so Enter always confirms.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      }
    };
    const record = { backdrop, cancel };
    active.add(record);

    cancelBtn.addEventListener("click", cancel);
    okBtn.addEventListener("click", confirm);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) cancel();
    });
    doc.addEventListener("keydown", onKey, true);

    // Focus the field (prompt) or the confirm button (confirm) so keyboard use is
    // immediate. Deferred a tick so the element is attached + laid out first.
    setTimeout(() => (inputEl ?? okBtn).focus(), 0);
  });
}

/** Modal text input. Resolves the trimmed value, or null if cancelled (Escape,
 *  Cancel, or backdrop click). Parity with the native `prompt()` it replaces. */
export async function promptDialog(opts: PromptOptions): Promise<string | null> {
  const value = await buildDialog(opts.root ?? document, {
    message: opts.message,
    okLabel: opts.okLabel ?? t("common.ok"),
    cancelLabel: opts.cancelLabel ?? t("common.cancel"),
    input: { initial: opts.initial, placeholder: opts.placeholder },
  });
  return value === null ? null : value.trim();
}

/** Modal confirmation. Resolves true on confirm, false on cancel/Escape/backdrop. */
export async function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const value = await buildDialog(opts.root ?? document, {
    message: opts.message,
    okLabel: opts.okLabel ?? t("common.ok"),
    cancelLabel: opts.cancelLabel ?? t("common.cancel"),
    danger: opts.danger,
  });
  return value !== null;
}
