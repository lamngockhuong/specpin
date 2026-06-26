import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import type { RenderMeta, SpecRenderer } from "./renderer.js";

const HOST_ID = "specpin-modal-host";
const TITLE_ID = "specpin-modal-title";

const STYLES = `
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.root[hidden] { display: none; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.dialog {
  width: min(560px, 100%); max-height: 80vh; overflow-y: auto;
  background: var(--sp-surface);
  color: var(--sp-text);
  font: 13px/1.5 var(--sp-font-ui);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  padding: 22px;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.eyebrow {
  font: 600 10px/1 var(--sp-font-mono); letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--sp-text-3);
}
.title { margin: 8px 0 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.summary { color: var(--sp-text-2); margin: 4px 0 16px; }
.close {
  flex: none; width: 30px; height: 30px; cursor: pointer;
  background: var(--sp-control); color: var(--sp-text);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
  font: 16px/1 var(--sp-font-ui);
}
.close:hover { background: var(--sp-elevated); }
.close:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
.card {
  background: var(--sp-elevated);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  padding: 14px; margin-bottom: 10px; cursor: pointer;
  transition: border-color 0.12s, transform 0.12s;
}
.card:hover { transform: translateY(-1px); border-color: var(--sp-accent); }
.card[data-review="true"] { border-color: var(--sp-warning-border); }
.card .tag {
  display: inline-block; margin-bottom: 8px;
  font: 700 9px/1 var(--sp-font-mono); letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sp-warning); background: var(--sp-warning-bg);
  border: 1px solid var(--sp-warning-border); border-radius: 5px; padding: 4px 6px;
}
.card .t { font-weight: 700; font-size: 14px; color: var(--sp-text); }
.card .d { color: var(--sp-text-2); margin-top: 4px; }
.card ul { margin: 8px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.card li { margin: 2px 0; }
.flash { outline: 3px solid var(--sp-accent) !important; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } }
`;

/**
 * Modal renderer: a centered, focus-trapped dialog listing every matched spec on
 * the page. Read-only (no capture/delete controls). Clicking a card jumps to its
 * element and closes the dialog. Esc and the backdrop also close it. All
 * listeners are bound through an AbortController so destroy() removes every one
 * in a single abort() (no per-node listener leaks across mode cycles).
 */
export class ModalRenderer implements SpecRenderer {
  readonly mode: DisplayMode = "modal";

  private host: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private count = 0;
  private reviewCount = 0;
  private prevFocus: Element | null = null;
  private readonly doc: Document;
  private readonly ac = new AbortController();

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  private ensureRoot(): HTMLElement {
    if (this.list) return this.list;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES);
    const root = this.doc.createElement("div");
    root.className = "root";
    root.innerHTML =
      `<div class="backdrop">` +
      `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="${TITLE_ID}">` +
      `<div class="head"><div>` +
      `<div class="eyebrow">Specpin</div>` +
      `<h2 class="title" id="${TITLE_ID}">Specs on this page</h2>` +
      `</div><button class="close" type="button" aria-label="Close">&times;</button></div>` +
      `<div class="summary"></div><div class="list"></div>` +
      `</div></div>`;
    shadow.appendChild(root);

    this.host = host;
    this.root = root;
    this.list = root.querySelector(".list");
    this.summary = root.querySelector(".summary");
    this.closeBtn = root.querySelector(".close");

    const signal = this.ac.signal;
    this.closeBtn?.addEventListener("click", () => this.close(), { signal });
    // Backdrop click (outside the dialog) closes; clicks inside do not.
    root.querySelector(".backdrop")?.addEventListener(
      "click",
      (e) => {
        if (e.target === e.currentTarget) this.close();
      },
      { signal },
    );
    // Esc closes; Tab is trapped inside the dialog.
    this.doc.addEventListener("keydown", (e) => this.onKeydown(e), { signal });

    this.prevFocus = this.doc.activeElement;
    this.doc.defaultView?.setTimeout(() => this.closeBtn?.focus(), 0);
    return this.list as HTMLElement;
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    const list = this.ensureRoot();
    const card = this.doc.createElement("div");
    card.className = "card";
    // Plain clickable card (mouse jump-to), like the sidebar. Not keyboard-
    // focusable, so the focus trap below can keep Tab on the close button.
    if (meta?.needsReview) {
      card.dataset.review = "true";
      this.reviewCount++;
    }
    const tag = meta?.needsReview ? `<span class="tag">Needs review</span>` : "";
    const rules = (spec.businessRules ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    card.innerHTML =
      tag +
      `<div class="t">${escapeHtml(spec.title)}</div>` +
      `<div class="d">${escapeHtml(spec.description)}</div>` +
      (rules ? `<ul>${rules}</ul>` : "");
    card.addEventListener("click", () => this.jumpTo(target), { signal: this.ac.signal });
    list.appendChild(card);
    this.count++;
    this.updateSummary();
  }

  private updateSummary(): void {
    if (!this.summary) return;
    const review = this.reviewCount > 0 ? `, ${this.reviewCount} need review` : "";
    this.summary.textContent = `${this.count} spec${this.count === 1 ? "" : "s"} found${review}`;
  }

  private onKeydown(e: KeyboardEvent): void {
    if (this.root?.hasAttribute("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    // Only the close button is focusable, so keep Tab on it (trap).
    if (e.key === "Tab") {
      e.preventDefault();
      this.closeBtn?.focus();
    }
  }

  private jumpTo(target: Element): void {
    this.close();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("flash");
    this.doc.defaultView?.setTimeout(() => target.classList.remove("flash"), 1200);
  }

  private close(): void {
    this.root?.setAttribute("hidden", "");
    // Restore focus to where it was, unless that element is gone from the DOM
    // (page scripts may have removed it while the modal was open).
    if (this.prevFocus instanceof HTMLElement && this.prevFocus.isConnected) {
      this.prevFocus.focus();
    } else {
      this.doc.body?.focus();
    }
  }

  destroy(): void {
    this.ac.abort();
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.list = null;
    this.summary = null;
    this.closeBtn = null;
    this.count = 0;
    this.reviewCount = 0;
    this.prevFocus = null;
  }
}
