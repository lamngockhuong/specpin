// On-screen picker HUD: a small fixed banner shown while the element picker is
// active, so the user is never left guessing what to click or how to finish.
// Single-pick flows (capture, clone, re-link) show a contextual instruction + a
// Cancel control; multi-pick (bulk) adds a live "N selected" count and a Done
// button that stays disabled until at least one element is picked.
//
// Drawn in its own Shadow-DOM host (same isolation pattern as toast.ts) so it
// stays out of the page's styles/CSP. The banner container is pointer-events:none
// so it never intercepts element-picking clicks; only its buttons are interactive.

import { type MessageKey, t } from "../i18n/index.js";
import { createIcon } from "../shared/icons.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";

const HOST_ID = "specpin-picker-hud-host";

/** Which flow the picker is serving, so the instruction reads for that intent. */
export type PickerHudVariant = "capture" | "clone" | "relink" | "bulk";

const HINT_KEY: Record<PickerHudVariant, MessageKey> = {
  capture: "picker.hint.capture",
  clone: "picker.hint.clone",
  relink: "picker.hint.relink",
  bulk: "picker.hint.bulk",
};

const STYLES = `
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.hud {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  z-index: 2147483646; pointer-events: none;
  display: flex; align-items: center; gap: 14px;
  max-width: 92vw; padding: 10px 10px 10px 16px;
  border-radius: var(--sp-radius-card);
  background: var(--sp-surface); color: var(--sp-text);
  border: 1px solid var(--sp-border);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  font: 600 14px/1.4 var(--sp-font-ui);
}
.hud-hint { min-width: 0; }
.hud-count { flex: 0 0 auto; color: var(--sp-text-2); font-weight: 600; }
.hud-actions { flex: 0 0 auto; display: flex; gap: 8px; }
.hud button {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; font: 600 14px/1 var(--sp-font-ui); cursor: pointer;
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
  background: var(--sp-control); color: var(--sp-text);
}
.hud button:hover { background: var(--sp-elevated); }
.hud button:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
.hud button.done {
  background: var(--sp-accent); color: var(--sp-accent-on); border-color: var(--sp-accent);
}
.hud button.done:hover { background: var(--sp-accent-hover); }
.hud button.done:disabled {
  opacity: 0.5; cursor: not-allowed;
  background: var(--sp-control); color: var(--sp-text-3); border-color: var(--sp-border);
}
`;

export interface PickerHudOptions {
  /** Multi-pick (bulk): shows the count + a Done button. */
  multi: boolean;
  variant: PickerHudVariant;
  theme?: Theme;
  /** Abort the pick (same path as Escape). */
  onCancel: () => void;
  /** Finish a multi-pick (same path as Enter). Ignored when `multi` is false. */
  onDone?: () => void;
}

/** The picker HUD banner. One instance per picker session; `mount` draws it,
 *  `setCount` keeps the multi count live, `destroy` tears it down. */
export class PickerHud {
  private host: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private doneBtn: HTMLButtonElement | null = null;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  mount(opts: PickerHudOptions): void {
    this.destroy();
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, opts.theme);
    const hud = this.doc.createElement("div");
    hud.className = "hud";
    hud.setAttribute("role", "toolbar");
    hud.setAttribute("aria-label", t("picker.hudLabel"));

    const hint = this.doc.createElement("span");
    hint.className = "hud-hint";
    hint.textContent = t(HINT_KEY[opts.variant]);
    hud.appendChild(hint);

    if (opts.multi) {
      const count = this.doc.createElement("span");
      count.className = "hud-count";
      count.textContent = t("picker.selectedCount", { count: 0 });
      this.countEl = count;
      hud.appendChild(count);
    }

    const actions = this.doc.createElement("div");
    actions.className = "hud-actions";
    if (opts.multi && opts.onDone) {
      const done = this.doc.createElement("button");
      done.type = "button";
      done.className = "done";
      done.disabled = true; // enabled once >= 1 element is picked
      done.appendChild(createIcon(this.doc, "check", 13));
      const doneLabel = this.doc.createElement("span");
      doneLabel.textContent = t("picker.done");
      done.appendChild(doneLabel);
      done.addEventListener("click", () => opts.onDone?.());
      this.doneBtn = done;
      actions.appendChild(done);
    }
    const cancel = this.doc.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel";
    cancel.appendChild(createIcon(this.doc, "close", 13));
    const cancelLabel = this.doc.createElement("span");
    cancelLabel.textContent = t("common.cancel");
    cancel.appendChild(cancelLabel);
    cancel.addEventListener("click", () => opts.onCancel());
    actions.appendChild(cancel);

    hud.appendChild(actions);
    shadow.appendChild(hud);
    this.host = host;
  }

  /** Update the live selection count and toggle Done (disabled at 0). */
  setCount(n: number): void {
    if (this.countEl) this.countEl.textContent = t("picker.selectedCount", { count: n });
    if (this.doneBtn) this.doneBtn.disabled = n < 1;
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.countEl = null;
    this.doneBtn = null;
  }
}
