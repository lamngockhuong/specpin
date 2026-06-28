import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { LOCALE_CHANGE_EVENT, localizeSpec } from "../content/localize-spec.js";
import { plural, t } from "../i18n/index.js";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import {
  projectCaptionHtml,
  type RenderMeta,
  rulesListHtml,
  type SpecRenderer,
} from "./renderer.js";

interface Row {
  spec: Spec;
  target: Element;
  el: HTMLElement;
}

const HOST_ID = "specpin-sidebar-host";

const STYLES = `
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.panel {
  position: fixed; top: 0; right: 0; width: 340px; height: 100vh; z-index: 2147483647;
  background:
    radial-gradient(120% 40% at 50% 0%, var(--sp-grad-top), var(--sp-grad-bottom));
  color: var(--sp-text);
  font: 13px/1.5 var(--sp-font-ui);
  border-left: 1px solid var(--sp-border);
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.18);
  overflow-y: auto; padding: 20px; box-sizing: border-box;
}
.eyebrow {
  display: flex; align-items: center; gap: 7px;
  font: 600 10px/1 var(--sp-font-mono); letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--sp-text-3);
}
.eyebrow::before {
  content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--sp-accent);
}
.title { margin: 10px 0 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.locale { margin: 10px 0 0; }
.locale[hidden] { display: none; }
.locale select {
  font: 500 12px/1 var(--sp-font-ui);
  color: var(--sp-text);
  background: var(--sp-control);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  padding: 6px 8px; cursor: pointer;
}
.summary { display: flex; align-items: center; gap: 10px; margin: 6px 0 16px; color: var(--sp-text-2); }
.review-pill {
  display: none;
  font: 600 11px/1 var(--sp-font-ui);
  color: var(--sp-warning);
  background: var(--sp-warning-bg);
  border: 1px solid var(--sp-warning-border);
  border-radius: 999px; padding: 4px 9px;
}
.review-pill.show { display: inline-block; }
.card {
  position: relative;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  padding: 14px 32px 14px 14px; margin-bottom: 12px; cursor: pointer;
  transition: border-color 0.12s, transform 0.12s;
}
.card:hover { transform: translateY(-1px); border-color: var(--sp-accent); }
.card::after {
  content: ""; position: absolute; top: 16px; right: 14px; width: 14px; height: 14px;
  background: var(--sp-text-3);
  -webkit-mask: var(--chev) center / contain no-repeat;
  mask: var(--chev) center / contain no-repeat;
  --chev: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>');
}
.card[data-review="true"] { border-color: var(--sp-warning-border); }
.card .tag {
  display: inline-block; margin-bottom: 8px;
  font: 700 9px/1 var(--sp-font-mono); letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sp-warning);
  background: var(--sp-warning-bg);
  border: 1px solid var(--sp-warning-border);
  border-radius: 5px; padding: 4px 6px;
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
`;

/**
 * Sidebar renderer: a fixed panel listing every matched spec on the page
 * (review mode). Clicking a row scrolls to and highlights its element via the
 * content script's onHighlight callback. Shadow DOM isolated like the tooltip
 * renderer.
 */
export class SidebarRenderer implements SpecRenderer {
  readonly mode: DisplayMode = "sidebar";

  private host: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private summaryCount: HTMLElement | null = null;
  private reviewPill: HTMLElement | null = null;
  private localeBox: HTMLElement | null = null;
  private localeSelectorBuilt = false;
  private rows: Row[] = [];
  private reviewCount = 0;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  private ensureRoot(theme?: Theme): HTMLElement {
    if (this.list) return this.list;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, theme);
    const panel = this.doc.createElement("div");
    panel.className = "panel";
    panel.innerHTML =
      `<div class="eyebrow">${escapeHtml(t("common.specpin"))}</div>` +
      `<h3 class="title">${escapeHtml(t("common.specsOnThisPage"))}</h3>` +
      `<div class="locale" hidden></div>` +
      `<div class="summary"><span class="count">${escapeHtml(
        plural(0, "common.specsFoundOne", "common.specsFoundOther"),
      )}</span>` +
      `<span class="review-pill"></span></div>`;
    const list = this.doc.createElement("div");
    panel.appendChild(list);
    shadow.appendChild(panel);
    this.host = host;
    this.list = list;
    this.summaryCount = panel.querySelector(".count");
    this.reviewPill = panel.querySelector(".review-pill");
    this.localeBox = panel.querySelector(".locale");
    return list;
  }

  /** Build the language selector once, from the first render's meta. Changing it
   *  dispatches a DOM event the content script applies; the renderer stays free
   *  of storage/messaging. */
  private ensureLocaleSelector(meta?: RenderMeta): void {
    if (this.localeSelectorBuilt || !this.localeBox) return;
    const locales = meta?.availableLocales ?? [];
    if (locales.length < 2) return;
    this.localeSelectorBuilt = true;
    const current = meta?.locale ?? locales[0];
    const options = locales
      .map(
        (l) =>
          `<option value="${escapeHtml(l)}"${l === current ? " selected" : ""}>${escapeHtml(l)}</option>`,
      )
      .join("");
    this.localeBox.innerHTML = `<select aria-label="${escapeHtml(t("common.languageLabel"))}">${options}</select>`;
    this.localeBox.hidden = false;
    const select = this.localeBox.querySelector("select");
    select?.addEventListener("change", () => {
      this.doc.dispatchEvent(
        new CustomEvent(LOCALE_CHANGE_EVENT, { detail: (select as HTMLSelectElement).value }),
      );
    });
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    const list = this.ensureRoot(meta?.theme);
    this.ensureLocaleSelector(meta);
    const card = this.doc.createElement("div");
    card.className = "card";
    if (meta?.needsReview) {
      card.dataset.review = "true";
      this.reviewCount++;
    }
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
    card.addEventListener("click", () => onHighlight?.(target));
    list.appendChild(card);
    this.rows.push({ spec, target, el: card });
    this.updateSummary();
  }

  private updateSummary(): void {
    const n = this.rows.length;
    if (this.summaryCount)
      this.summaryCount.textContent = plural(n, "common.specsFoundOne", "common.specsFoundOther");
    if (this.reviewPill) {
      if (this.reviewCount > 0) {
        this.reviewPill.textContent = t("common.needReview", { count: this.reviewCount });
        this.reviewPill.classList.add("show");
      } else {
        this.reviewPill.classList.remove("show");
      }
    }
  }

  get rowCount(): number {
    return this.rows.length;
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.list = null;
    this.summaryCount = null;
    this.reviewPill = null;
    this.localeBox = null;
    this.localeSelectorBuilt = false;
    this.rows = [];
    this.reviewCount = 0;
  }
}
