import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { type LocalizedSpecText, localizeSpec } from "../content/localize-spec.js";
import { escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import type { RenderMeta, SpecRenderer } from "./renderer.js";
import { rulesListHtml } from "./renderer.js";

interface Pin {
  target: Element;
  badge: HTMLElement;
  specId: string;
  text: LocalizedSpecText;
  tags: string[];
  project: string;
}

const HOST_ID = "specpin-tooltip-host";

// When max < min (viewport narrower than the tip) the outer Math.max wins and
// pins to min, so no extra guard is needed.
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const STYLES = `
${SHADOW_PREAMBLE}
.layer { position: absolute; top: 0; left: 0; z-index: 2147483647; }
.badge {
  position: absolute; width: 16px; height: 16px; border-radius: 50%;
  background: var(--sp-accent); color: var(--sp-accent-on);
  font: 600 10px/16px var(--sp-font-ui);
  text-align: center; cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 3px var(--sp-accent-glow);
  pointer-events: auto; user-select: none;
}
.badge[data-review="true"] {
  background: var(--sp-warning-border); color: var(--sp-accent-on);
}
.tip {
  position: absolute; box-sizing: border-box; width: min(360px, 90vw);
  background: var(--sp-elevated); color: var(--sp-text);
  font: 13px/1.45 var(--sp-font-ui);
  padding: 11px 13px;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); display: none; pointer-events: none;
}
.tip.pinned { pointer-events: auto; }
/* When pinned, the title area is the drag handle so the tip can be moved off
   elements it covers. Body text stays selectable; only the header grabs. */
.tip.pinned .project, .tip.pinned h4 { cursor: move; user-select: none; }
.tip.dragging { box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45); }
.tip .project { display: block; margin: 0 0 4px; font: 700 9px/1 var(--sp-font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sp-text-3); }
.tip h4 { margin: 0 0 4px; padding-right: 18px; font-size: 13px; font-weight: 700; color: var(--sp-text); }
.tip p { margin: 0 0 6px; color: var(--sp-text-2); }
.tip ul { margin: 4px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.tip li { margin: 2px 0; }
.tip .tags { margin-top: 6px; color: var(--sp-accent); font-family: var(--sp-font-mono); font-size: 11px; }
.tip .pin-close {
  position: absolute; top: 6px; right: 6px; width: 18px; height: 18px;
  display: grid; place-items: center; padding: 0;
  background: transparent; border: none; cursor: pointer;
  color: var(--sp-text-3); font: 600 14px/1 var(--sp-font-ui); border-radius: 4px;
}
.tip .pin-close:hover { background: var(--sp-border); color: var(--sp-text); }
.tip .pin-open {
  margin-top: 9px; width: 100%; padding: 6px 8px; cursor: pointer;
  background: var(--sp-accent); color: var(--sp-accent-on); border: none;
  border-radius: var(--sp-radius-control); font: 600 12px/1.2 var(--sp-font-ui);
}
.tip.show { display: block; }
`;

/**
 * Tooltip renderer: a small badge anchored to each matched element. Hovering a
 * badge shows the spec for a quick peek; clicking it pins the tip open with a
 * close button and an "open in side panel" action. Only one tip is pinned at a
 * time. All UI lives inside a Shadow DOM so host-page styles cannot bleed.
 */
export class TooltipRenderer implements SpecRenderer {
  readonly mode: DisplayMode = "tooltip";

  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private layer: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private pins: Pin[] = [];
  private pinnedBadge: HTMLElement | null = null;
  private onOpenInPanel?: (specId: string) => void;
  private readonly doc: Document;
  private reposition = () => this.positionAll();
  // Drag state for the pinned tip. `dragged` is reset on every (re)open so the
  // tip starts anchored to its badge; once dragged it stays put through scroll.
  // `x`/`y` are the grab offset; `w`/`h` are the tip size measured once at grab
  // (it does not change mid-drag) to avoid a layout reflow on every mousemove.
  private dragOffset: { x: number; y: number; w: number; h: number } | null = null;
  private dragged = false;

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
    // Explicit width so the tip never shrink-to-fits inside its 0-width
    // absolutely-positioned shadow host (that collapse was the "too narrow" bug).
    tip.style.width = "min(360px, 90vw)";
    tip.style.boxSizing = "border-box";
    shadow.append(layer, tip);

    this.host = host;
    this.shadow = shadow;
    this.layer = layer;
    this.tip = tip;

    tip.addEventListener("mousedown", this.startDrag);

    const win = this.doc.defaultView;
    win?.addEventListener("scroll", this.reposition, true);
    win?.addEventListener("resize", this.reposition);
    return layer;
  }

  render(spec: Spec, target: Element, meta?: RenderMeta): void {
    const layer = this.ensureRoot();
    if (meta?.onOpenInPanel) this.onOpenInPanel = meta.onOpenInPanel;
    const text = localizeSpec(spec, meta?.locale, meta?.defaultLocale);
    const badge = this.doc.createElement("div");
    badge.className = "badge";
    badge.textContent = "S";
    if (meta?.needsReview) badge.dataset.review = "true";
    const project = meta?.showProject && meta.project ? meta.project : "";

    const pin: Pin = { target, badge, specId: spec.id, text, tags: spec.tags ?? [], project };
    badge.addEventListener("mouseenter", () => {
      if (!this.pinnedBadge) this.showTip(pin, false);
    });
    badge.addEventListener("mouseleave", () => {
      if (!this.pinnedBadge) this.hideTip();
    });
    badge.addEventListener("click", () => this.togglePin(pin));
    layer.appendChild(badge);

    this.pins.push(pin);
    this.positionBadge(pin);
  }

  private togglePin(pin: Pin): void {
    if (this.pinnedBadge === pin.badge) {
      this.unpin();
      return;
    }
    this.pinnedBadge = pin.badge;
    this.showTip(pin, true);
  }

  private unpin(): void {
    this.pinnedBadge = null;
    this.hideTip();
  }

  private showTip(pin: Pin, pinned: boolean): void {
    const tip = this.tip;
    if (!tip) return;
    // Fresh open: drop any prior drag so the tip re-anchors to its badge.
    this.dragged = false;
    tip.classList.remove("dragging");
    const tags = pin.tags.length
      ? `<div class="tags">${escapeHtml(pin.tags.join(", "))}</div>`
      : "";
    tip.innerHTML =
      (pinned ? `<button type="button" class="pin-close" aria-label="Close">×</button>` : "") +
      (pin.project ? `<span class="project">${escapeHtml(pin.project)}</span>` : "") +
      `<h4>${escapeHtml(pin.text.title)}</h4>` +
      `<p>${escapeHtml(pin.text.description)}</p>` +
      rulesListHtml(pin.text.businessRules) +
      tags +
      (pinned ? `<button type="button" class="pin-open">Open in side panel</button>` : "");
    tip.classList.toggle("pinned", pinned);
    if (pinned) {
      tip.querySelector(".pin-close")?.addEventListener("click", () => this.unpin());
      tip.querySelector(".pin-open")?.addEventListener("click", () => {
        this.onOpenInPanel?.(pin.specId);
      });
    }
    this.positionTip(pin.badge);
    tip.classList.add("show");
  }

  private hideTip(): void {
    this.tip?.classList.remove("show", "pinned");
  }

  private positionTip(badge: HTMLElement): void {
    const tip = this.tip;
    const win = this.doc.defaultView;
    if (!tip || !win) return;
    const rect = badge.getBoundingClientRect();
    const tipW = tip.offsetWidth || 360;
    const maxLeft = win.scrollX + win.innerWidth - tipW - 8;
    let left = rect.left + win.scrollX;
    if (left > maxLeft) left = maxLeft;
    if (left < win.scrollX + 8) left = win.scrollX + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.bottom + win.scrollY + 6}px`;
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
    // Keep the pinned tip anchored to its badge through scroll/resize, unless the
    // user has dragged it somewhere deliberately.
    if (this.pinnedBadge && !this.dragged) this.positionTip(this.pinnedBadge);
  }

  // Drag the pinned tip by its title area. Document-absolute coordinates keep
  // the moved tip consistent with the badges (which are also document-anchored).
  private startDrag = (e: MouseEvent): void => {
    const tip = this.tip;
    const win = this.doc.defaultView;
    if (!tip || !win || e.button !== 0) return;
    if (!tip.classList.contains("pinned")) return;
    const handle = e.target as Element | null;
    if (!handle?.closest("h4, .project")) return;
    e.preventDefault();
    const rect = tip.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
    tip.classList.add("dragging");
    win.addEventListener("mousemove", this.onDrag, true);
    win.addEventListener("mouseup", this.endDrag, true);
  };

  private onDrag = (e: MouseEvent): void => {
    const tip = this.tip;
    const win = this.doc.defaultView;
    if (!tip || !win || !this.dragOffset) return;
    e.preventDefault();
    this.dragged = true;
    const { x, y, w, h } = this.dragOffset;
    // Clamp to the viewport so the tip cannot be dragged out of reach.
    const left = clamp(e.clientX - x, 4, win.innerWidth - w - 4);
    const top = clamp(e.clientY - y, 4, win.innerHeight - h - 4);
    tip.style.left = `${left + win.scrollX}px`;
    tip.style.top = `${top + win.scrollY}px`;
  };

  private endDrag = (): void => {
    this.dragOffset = null;
    this.tip?.classList.remove("dragging");
    const win = this.doc.defaultView;
    win?.removeEventListener("mousemove", this.onDrag, true);
    win?.removeEventListener("mouseup", this.endDrag, true);
  };

  /** Number of currently rendered pins (used in tests). */
  get pinCount(): number {
    return this.pins.length;
  }

  destroy(): void {
    const win = this.doc.defaultView;
    win?.removeEventListener("scroll", this.reposition, true);
    win?.removeEventListener("resize", this.reposition);
    this.endDrag();
    this.host?.remove();
    this.host = this.shadow = null;
    this.layer = this.tip = null;
    this.pins = [];
    this.pinnedBadge = null;
  }
}
