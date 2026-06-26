import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { type LocalizedSpecText, localizeSpec } from "../content/localize-spec.js";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import type { RenderMeta, SpecRenderer } from "./renderer.js";

interface Pin {
  target: Element;
  badge: HTMLElement;
}

const HOST_ID = "specpin-tooltip-host";

const STYLES = `
${SHADOW_PREAMBLE}
.layer { position: absolute; top: 0; left: 0; z-index: 2147483647; }
.badge {
  position: absolute; width: 16px; height: 16px; border-radius: 50%;
  background: var(--sp-accent); color: var(--sp-accent-on);
  font: 600 10px/16px var(--sp-font-ui);
  text-align: center; cursor: help;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 3px var(--sp-accent-glow);
  pointer-events: auto; user-select: none;
}
.badge[data-review="true"] {
  background: var(--sp-warning-border); color: var(--sp-accent-on);
}
.tip {
  position: absolute; max-width: 320px;
  background: var(--sp-elevated); color: var(--sp-text);
  font: 13px/1.45 var(--sp-font-ui);
  padding: 11px 13px;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); display: none; pointer-events: none;
}
.tip .project { display: block; margin: 0 0 4px; font: 700 9px/1 var(--sp-font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sp-text-3); }
.tip h4 { margin: 0 0 4px; font-size: 13px; font-weight: 700; color: var(--sp-text); }
.tip p { margin: 0 0 6px; color: var(--sp-text-2); }
.tip ul { margin: 4px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.tip li { margin: 2px 0; }
.tip .tags { margin-top: 6px; color: var(--sp-accent); font-family: var(--sp-font-mono); font-size: 11px; }
.tip.show { display: block; }
`;

/**
 * Tooltip renderer: a small badge anchored to each matched element; the full
 * spec appears on hover. All UI lives inside a Shadow DOM so host-page styles
 * cannot bleed in or out.
 */
export class TooltipRenderer implements SpecRenderer {
  readonly mode: DisplayMode = "tooltip";

  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private layer: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private pins: Pin[] = [];
  private readonly doc: Document;
  private reposition = () => this.positionAll();

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  private ensureRoot(): HTMLElement {
    if (this.layer) return this.layer;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES);
    host.style.position = "absolute";
    host.style.top = "0";
    host.style.left = "0";

    const layer = this.doc.createElement("div");
    layer.className = "layer";
    const tip = this.doc.createElement("div");
    tip.className = "tip";
    shadow.append(layer, tip);

    this.host = host;
    this.shadow = shadow;
    this.layer = layer;
    this.tip = tip;

    const win = this.doc.defaultView;
    win?.addEventListener("scroll", this.reposition, true);
    win?.addEventListener("resize", this.reposition);
    return layer;
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    const layer = this.ensureRoot();
    const text = localizeSpec(spec, meta?.locale, meta?.defaultLocale);
    const badge = this.doc.createElement("div");
    badge.className = "badge";
    badge.textContent = "S";
    if (meta?.needsReview) badge.dataset.review = "true";
    const project = meta?.showProject && meta.project ? meta.project : "";
    badge.addEventListener("mouseenter", () => this.showTip(text, spec.tags ?? [], project, badge));
    badge.addEventListener("mouseleave", () => this.hideTip());
    layer.appendChild(badge);

    const pin: Pin = { target, badge };
    this.pins.push(pin);
    this.positionBadge(pin);
  }

  private showTip(
    text: LocalizedSpecText,
    specTags: string[],
    project: string,
    badge: HTMLElement,
  ): void {
    if (!this.tip) return;
    const rules = text.businessRules.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    const tags = specTags.length
      ? `<div class="tags">${escapeHtml(specTags.join(", "))}</div>`
      : "";
    this.tip.innerHTML =
      (project ? `<span class="project">${escapeHtml(project)}</span>` : "") +
      `<h4>${escapeHtml(text.title)}</h4>` +
      `<p>${escapeHtml(text.description)}</p>` +
      (rules ? `<ul>${rules}</ul>` : "") +
      tags;
    const rect = badge.getBoundingClientRect();
    const win = this.doc.defaultView;
    if (!win) return;
    this.tip.style.left = `${rect.left + win.scrollX}px`;
    this.tip.style.top = `${rect.bottom + win.scrollY + 6}px`;
    this.tip.classList.add("show");
  }

  private hideTip(): void {
    this.tip?.classList.remove("show");
  }

  private positionBadge(pin: Pin): void {
    const rect = pin.target.getBoundingClientRect();
    const win = this.doc.defaultView;
    if (!win) return;
    pin.badge.style.left = `${rect.left + win.scrollX - 8}px`;
    pin.badge.style.top = `${rect.top + win.scrollY - 8}px`;
  }

  private positionAll(): void {
    for (const pin of this.pins) this.positionBadge(pin);
  }

  /** Number of currently rendered pins (used in tests). */
  get pinCount(): number {
    return this.pins.length;
  }

  destroy(): void {
    const win = this.doc.defaultView;
    win?.removeEventListener("scroll", this.reposition, true);
    win?.removeEventListener("resize", this.reposition);
    this.host?.remove();
    this.host = this.shadow = null;
    this.layer = this.tip = null;
    this.pins = [];
  }
}
