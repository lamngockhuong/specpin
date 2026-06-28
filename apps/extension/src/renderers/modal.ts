import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { localizeSpec } from "../content/localize-spec.js";
import { plural, t } from "../i18n/index.js";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { LauncherSlot } from "./launcher.js";
import {
  projectCaptionHtml,
  type RenderMeta,
  rulesListHtml,
  type SpecRenderer,
} from "./renderer.js";

const HOST_ID = "specpin-modal-host";
const TITLE_ID = "specpin-modal-title";

const STYLES = `
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.root[hidden] { display: none; }
/* A non-blocking layer: it does not dim or capture page events (pointer-events:
   none); only the floating dialog re-enables them, so the page stays interactive
   while the panel is open. Flex centers the dialog on first open; drag offsets it
   via translate from there. */
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  pointer-events: none;
}
.dialog {
  pointer-events: auto;
  width: min(560px, 100%); max-height: 80vh; overflow-y: auto;
  background: var(--sp-surface);
  color: var(--sp-text);
  font: 13px/1.5 var(--sp-font-ui);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  padding: 22px;
  transform: translate(var(--sp-dx, 0px), var(--sp-dy, 0px));
}
.head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  cursor: grab; touch-action: none; user-select: none;
}
.head:active { cursor: grabbing; }
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
.card .project {
  display: block; margin-bottom: 6px;
  font: 700 9px/1 var(--sp-font-mono); letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sp-text-3);
}
.card .t { font-weight: 700; font-size: 14px; color: var(--sp-text); }
.card .d { color: var(--sp-text-2); margin-top: 4px; }
.card ul { margin: 8px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.card li { margin: 2px 0; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } }
`;

/**
 * Modal renderer: a floating, draggable panel listing every matched spec on the
 * page. It is non-blocking - the page stays interactive while it is open (no
 * dimming backdrop, no focus trap) - so it reads more like a movable palette than
 * a true modal. Drag it by the header to reposition; it closes only via the
 * corner close button - clicking a card jumps to its element but leaves the panel
 * open. Read-only (no capture/delete controls). All listeners are bound through an
 * AbortController so destroy() removes every one in a single abort() (no per-node
 * listener leaks across mode cycles).
 */
export class ModalRenderer implements SpecRenderer {
  readonly mode: DisplayMode = "modal";

  private host: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private readonly launcherSlot: LauncherSlot;
  private onSetDismissed: RenderMeta["onSetDismissed"];
  // Current drag offset (px) from the flex-centered origin, applied as a translate.
  private offsetX = 0;
  private offsetY = 0;
  private readonly doc: Document;
  private readonly ac = new AbortController();

  constructor(doc: Document = document) {
    this.doc = doc;
    this.launcherSlot = new LauncherSlot(doc, this.mode);
  }

  private ensureRoot(theme?: Theme): HTMLElement {
    if (this.list) return this.list;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, theme);
    const root = this.doc.createElement("div");
    root.className = "root";
    // role="dialog" without aria-modal: this panel is intentionally non-modal,
    // so it must not tell assistive tech the rest of the page is inert.
    root.innerHTML =
      `<div class="backdrop">` +
      `<div class="dialog" role="dialog" aria-labelledby="${TITLE_ID}">` +
      `<div class="head"><div>` +
      `<div class="eyebrow">${escapeHtml(t("common.specpin"))}</div>` +
      `<h2 class="title" id="${TITLE_ID}">${escapeHtml(t("common.specsOnThisPage"))}</h2>` +
      `</div><button class="close" type="button" aria-label="${escapeHtml(t("common.close"))}">&times;</button></div>` +
      `<div class="summary"></div><div class="list"></div>` +
      `</div></div>`;
    shadow.appendChild(root);

    this.host = host;
    this.root = root;
    this.dialog = root.querySelector(".dialog");
    this.list = root.querySelector(".list");
    this.summary = root.querySelector(".summary");
    this.closeBtn = root.querySelector(".close");

    const signal = this.ac.signal;
    this.closeBtn?.addEventListener("click", () => this.close(), { signal });
    this.wireDrag(root.querySelector(".head"), signal);
    return this.list as HTMLElement;
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    this.onSetDismissed = meta?.onSetDismissed;
    if (meta?.dismissed) {
      // Dismissed: skip the panel, show only the floating relaunch pill.
      this.launcherSlot.show(meta, () => this.onSetDismissed?.(this.mode, false));
      return;
    }
    const list = this.ensureRoot(meta?.theme);
    const card = this.doc.createElement("div");
    card.className = "card";
    // Plain clickable card (mouse jump-to), like the sidebar.
    if (meta?.needsReview) card.dataset.review = "true";
    const tag = meta?.needsReview
      ? `<span class="tag">${escapeHtml(t("common.needsReview"))}</span>`
      : "";
    const text = localizeSpec(spec, meta?.locale, meta?.defaultLocale);
    card.innerHTML =
      tag +
      projectCaptionHtml(meta) +
      `<div class="t">${escapeHtml(text.title)}</div>` +
      `<div class="d">${escapeHtml(text.description)}</div>` +
      rulesListHtml(text.businessRules);
    const onHighlight = meta?.onHighlight;
    // Jump to the element (scroll + outline) but keep the panel open: only the
    // corner close button dismisses it. Drag the panel aside if it covers the
    // highlighted element.
    card.addEventListener("click", () => onHighlight?.(target), {
      signal: this.ac.signal,
    });
    list.appendChild(card);
    this.updateSummary();
  }

  // Counts are derived from the DOM so there is no separate state to keep in sync.
  private updateSummary(): void {
    if (!this.summary || !this.list) return;
    const count = this.list.childElementCount;
    const reviewCount = this.list.querySelectorAll('.card[data-review="true"]').length;
    const review = reviewCount > 0 ? `, ${t("common.needReview", { count: reviewCount })}` : "";
    this.summary.textContent = `${plural(count, "common.specsFoundOne", "common.specsFoundOther")}${review}`;
  }

  /** Drag the panel by its header. Pointer capture keeps tracking when the cursor
   *  leaves the header mid-drag; the close button is excluded so it stays
   *  clickable. The offset is clamped so the whole panel stays on-screen. */
  private wireDrag(handle: HTMLElement | null, signal: AbortSignal): void {
    if (!handle) return;
    const win = this.doc.defaultView;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    // Untranslated top-left of the dialog (rect minus the live offset) and its
    // size, captured at drag start so the clamp keeps it inside the viewport.
    let originLeft = 0;
    let originTop = 0;
    let width = 0;
    let height = 0;
    let dragging = false;
    handle.addEventListener(
      "pointerdown",
      (e) => {
        // Let the close button handle its own click instead of starting a drag.
        if (this.closeBtn?.contains(e.target as Node)) return;
        if (e.button !== 0) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        baseX = this.offsetX;
        baseY = this.offsetY;
        const rect = this.dialog?.getBoundingClientRect();
        originLeft = (rect?.left ?? 0) - this.offsetX;
        originTop = (rect?.top ?? 0) - this.offsetY;
        width = rect?.width ?? 0;
        height = rect?.height ?? 0;
        handle.setPointerCapture?.(e.pointerId);
      },
      { signal },
    );
    handle.addEventListener(
      "pointermove",
      (e) => {
        if (!dragging) return;
        const nx = baseX + (e.clientX - startX);
        const ny = baseY + (e.clientY - startY);
        const maxX = (win?.innerWidth ?? 0) - width - originLeft;
        const maxY = (win?.innerHeight ?? 0) - height - originTop;
        this.setOffset(clamp(nx, -originLeft, maxX), clamp(ny, -originTop, maxY));
      },
      { signal },
    );
    const end = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      handle.releasePointerCapture?.(e.pointerId);
    };
    handle.addEventListener("pointerup", end, { signal });
    handle.addEventListener("pointercancel", end, { signal });
  }

  private setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
    this.dialog?.style.setProperty("--sp-dx", `${x}px`);
    this.dialog?.style.setProperty("--sp-dy", `${y}px`);
  }

  private close(): void {
    // When wired through the content script, persist the dismissal so it survives
    // re-renders and shows the relaunch pill; the content script re-renders this
    // renderer into its dismissed state. Without the callback (unit tests / stubs)
    // fall back to a local hide so the panel still closes.
    if (this.onSetDismissed) {
      this.onSetDismissed(this.mode, true);
      return;
    }
    this.root?.setAttribute("hidden", "");
  }

  destroy(): void {
    this.ac.abort();
    this.host?.remove();
    this.launcherSlot.destroy();
    this.host = null;
    this.root = null;
    this.dialog = null;
    this.list = null;
    this.summary = null;
    this.closeBtn = null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
