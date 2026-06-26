import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import type { RenderMeta, SpecRenderer } from "./renderer.js";

interface Row {
  spec: Spec;
  target: Element;
  el: HTMLElement;
}

const HOST_ID = "specpin-sidebar-host";

const STYLES = `
:host { all: initial; }
.panel {
  position: fixed; top: 0; right: 0; width: 320px; height: 100vh; z-index: 2147483647;
  background: #111827; color: #f9fafb; font: 13px/1.5 system-ui, sans-serif;
  box-shadow: -4px 0 16px rgba(0,0,0,.3); overflow-y: auto; padding: 12px;
  box-sizing: border-box;
}
.panel h3 { margin: 0 0 10px; font-size: 14px; }
.row { padding: 8px; border: 1px solid #374151; border-radius: 6px; margin-bottom: 6px; cursor: pointer; }
.row:hover { background: #1f2937; }
.row[data-review="true"] { border-color: #d97706; }
.row .t { font-weight: 600; }
.row .d { color: #9ca3af; margin-top: 2px; }
.row ul { margin: 4px 0 0; padding-left: 16px; color: #d1d5db; }
.flash { outline: 3px solid #4f46e5 !important; outline-offset: 2px; }
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
  private rows: Row[] = [];
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  private ensureRoot(): HTMLElement {
    if (this.list) return this.list;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES);
    const panel = this.doc.createElement("div");
    panel.className = "panel";
    const heading = this.doc.createElement("h3");
    heading.textContent = "Specpin - specs on this page";
    const list = this.doc.createElement("div");
    panel.append(heading, list);
    shadow.appendChild(panel);
    this.host = host;
    this.list = list;
    return list;
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    const list = this.ensureRoot();
    const row = this.doc.createElement("div");
    row.className = "row";
    if (meta?.needsReview) row.dataset.review = "true";
    const rules = (spec.businessRules ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    row.innerHTML =
      `<div class="t">${escapeHtml(spec.title)}</div>` +
      `<div class="d">${escapeHtml(spec.description)}</div>` +
      (rules ? `<ul>${rules}</ul>` : "");
    row.addEventListener("click", () => this.jumpTo(target));
    list.appendChild(row);
    this.rows.push({ spec, target, el: row });
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
    this.rows = [];
  }
}
