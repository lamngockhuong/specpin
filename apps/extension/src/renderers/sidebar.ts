import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import type { RenderMeta, SpecRenderer } from "./renderer.js";

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
.card .t { font-weight: 700; font-size: 14px; color: var(--sp-text); }
.card .d { color: var(--sp-text-2); margin-top: 4px; }
.card ul { margin: 8px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.card li { margin: 2px 0; }
.flash { outline: 3px solid var(--sp-accent) !important; outline-offset: 2px; }
`;

/**
 * Sidebar renderer: a fixed panel listing every matched spec on the page
 * (review mode). Clicking a row scrolls to and flashes its element. Shadow DOM
 * isolated like the tooltip renderer.
 */
export class SidebarRenderer implements SpecRenderer {
  readonly mode: DisplayMode = "sidebar";

  private host: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private summaryCount: HTMLElement | null = null;
  private reviewPill: HTMLElement | null = null;
  private rows: Row[] = [];
  private reviewCount = 0;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  private ensureRoot(): HTMLElement {
    if (this.list) return this.list;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES);
    const panel = this.doc.createElement("div");
    panel.className = "panel";
    panel.innerHTML =
      `<div class="eyebrow">Specpin</div>` +
      `<h3 class="title">Specs on this page</h3>` +
      `<div class="summary"><span class="count">0 specs found</span>` +
      `<span class="review-pill"></span></div>`;
    const list = this.doc.createElement("div");
    panel.appendChild(list);
    shadow.appendChild(panel);
    this.host = host;
    this.list = list;
    this.summaryCount = panel.querySelector(".count");
    this.reviewPill = panel.querySelector(".review-pill");
    return list;
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    const list = this.ensureRoot();
    const card = this.doc.createElement("div");
    card.className = "card";
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
    card.addEventListener("click", () => this.jumpTo(target));
    list.appendChild(card);
    this.rows.push({ spec, target, el: card });
    this.updateSummary();
  }

  private updateSummary(): void {
    const n = this.rows.length;
    if (this.summaryCount) this.summaryCount.textContent = `${n} spec${n === 1 ? "" : "s"} found`;
    if (this.reviewPill) {
      if (this.reviewCount > 0) {
        this.reviewPill.textContent = `${this.reviewCount} need review`;
        this.reviewPill.classList.add("show");
      } else {
        this.reviewPill.classList.remove("show");
      }
    }
  }

  private jumpTo(target: Element): void {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("flash");
    this.doc.defaultView?.setTimeout(() => target.classList.remove("flash"), 1200);
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
    this.rows = [];
    this.reviewCount = 0;
  }
}
