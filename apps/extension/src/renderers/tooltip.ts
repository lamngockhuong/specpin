import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { type LocalizedSpecText, localizeSpec } from "../content/localize-spec.js";
import { showToast } from "../content/toast.js";
import { t } from "../i18n/index.js";
import { copyText } from "../shared/clipboard.js";
import { buildSpecLink } from "../shared/deep-link.js";
import { escapeHtml } from "../shared/html.js";
import { renderMarkdownBlock } from "../shared/markdown.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { BADGE_SIZE, type BadgeBox, resolveBadgePosition } from "./badge-position.js";
import { CONFIDENCE_BADGE_CSS, confidenceBadge } from "./confidence-badge.js";
import type { RenderMeta, SpecRenderer } from "./renderer.js";
import { MARKDOWN_BODY_CSS, rulesListHtml } from "./renderer.js";

interface Pin {
  target: Element;
  badge: HTMLElement;
  specId: string;
  text: LocalizedSpecText;
  tags: string[];
  project: string;
  editable: boolean;
  /** Precomputed confidence-badge HTML (fuzzy/scored tiers; "" when silent),
   *  shown in the tip beside the title. Built once at render from the match meta. */
  confHtml: string;
  /** True for a hybrid-scorer match, so the pinned tip offers the "Correct"
   *  confirm-loop action. */
  scored: boolean;
  /** Host page origin, so same-origin links in the tip open in the current tab. */
  pageOrigin?: string;
  /** Forced UI theme, so the copy-link confirmation toast matches the host theme. */
  theme?: Theme;
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
  position: absolute; width: ${BADGE_SIZE}px; height: ${BADGE_SIZE}px; border-radius: 50%;
  background: var(--sp-accent); color: var(--sp-accent-on);
  font: 600 10px/${BADGE_SIZE}px var(--sp-font-ui);
  text-align: center; cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 3px var(--sp-accent-glow);
  pointer-events: auto; user-select: none;
}
.badge[data-review="true"] {
  background: var(--sp-warning-border); color: var(--sp-accent-on);
}
.tip {
  /* Match .layer's z-index (not auto, which the layer's explicit z-index would
     always outrank) so the tip sits above the badges; tip is appended after the
     layer, so equal z-index makes it win on paint order. */
  position: absolute; z-index: 2147483647; box-sizing: border-box; width: min(360px, 90vw);
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
.tip .sp-conf { margin: 0 0 6px; }
.tip .d { color: var(--sp-text-2); margin: 0 0 6px; }
.tip ul { margin: 4px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.tip ol { margin: 4px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.tip li { margin: 2px 0; }
${MARKDOWN_BODY_CSS}
.tip .tags { margin-top: 6px; color: var(--sp-accent); font-family: var(--sp-font-mono); font-size: 11px; }
.tip .pin-close {
  position: absolute; top: 6px; right: 6px; width: 18px; height: 18px;
  display: grid; place-items: center; padding: 0;
  background: transparent; border: none; cursor: pointer;
  color: var(--sp-text-3); font: 600 14px/1 var(--sp-font-ui); border-radius: 4px;
}
.tip .pin-close:hover { background: var(--sp-border); color: var(--sp-text); }
.tip .pin-edit {
  margin-top: 9px; width: 100%; padding: 6px 8px; cursor: pointer;
  background: var(--sp-control); color: var(--sp-text); border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control); font: 600 12px/1.2 var(--sp-font-ui);
}
.tip .pin-edit:hover { filter: brightness(0.97); }
.tip .pin-copy {
  margin-top: 9px; width: 100%; padding: 6px 8px; cursor: pointer;
  background: var(--sp-control); color: var(--sp-text); border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control); font: 600 12px/1.2 var(--sp-font-ui);
}
.tip .pin-copy:hover { filter: brightness(0.97); }
.tip .pin-delete {
  margin-top: 9px; width: 100%; padding: 6px 8px; cursor: pointer;
  background: var(--sp-error-bg); color: var(--sp-error-text); border: 1px solid var(--sp-error-border);
  border-radius: var(--sp-radius-control); font: 600 12px/1.2 var(--sp-font-ui);
}
.tip .pin-delete:hover { filter: brightness(0.97); }
.tip .pin-open {
  margin-top: 9px; width: 100%; padding: 6px 8px; cursor: pointer;
  background: var(--sp-accent); color: var(--sp-accent-on); border: none;
  border-radius: var(--sp-radius-control); font: 600 12px/1.2 var(--sp-font-ui);
}
.tip.show { display: block; }
${CONFIDENCE_BADGE_CSS}
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
  // The element the pinned tip is positioned against (also the "is something
  // pinned" flag): a badge in normal mode, or the spec's target element when
  // badges are hidden (the reveal tooltip). Null when no tip is pinned.
  private pinnedAnchor: Element | null = null;
  private onOpenInPanel?: (specId: string) => void;
  private onEdit?: (specId: string) => void;
  private onDelete?: (specId: string) => void;
  private onConfirm?: (specId: string) => void;
  private readonly doc: Document;
  private reposition = () => this.positionAll();
  private readonly hostId: string;
  private readonly showBadges: boolean;
  // Drag state for the pinned tip. `dragged` is reset on every (re)open so the
  // tip starts anchored to its badge; once dragged it stays put through scroll.
  // `x`/`y` are the grab offset; `w`/`h` are the tip size measured once at grab
  // (it does not change mid-drag) to avoid a layout reflow on every mousemove.
  private dragOffset: { x: number; y: number; w: number; h: number } | null = null;
  private dragged = false;

  // `hostId` lets a second, on-demand instance (the context-menu "Show spec here"
  // reveal tooltip) coexist with the session's tooltip renderer without clashing
  // on the same shadow-host element id. `showBadges: false` hides the "S" badges
  // and anchors the tip to the element directly: the reveal tooltip only pins a
  // single tip and must not stamp a badge on the page.
  constructor(doc: Document = document, hostId: string = HOST_ID, showBadges = true) {
    this.doc = doc;
    this.hostId = hostId;
    this.showBadges = showBadges;
  }

  private ensureRoot(theme?: Theme): HTMLElement {
    if (this.layer) return this.layer;
    const { host, shadow } = createShadowHost(this.doc, this.hostId, STYLES, theme);
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
    const layer = this.ensureRoot(meta?.theme);
    if (meta?.onOpenInPanel) this.onOpenInPanel = meta.onOpenInPanel;
    if (meta?.onEdit) this.onEdit = meta.onEdit;
    if (meta?.onDelete) this.onDelete = meta.onDelete;
    if (meta?.onConfirm) this.onConfirm = meta.onConfirm;
    const text = localizeSpec(spec, meta?.locale, meta?.defaultLocale);
    const badge = this.doc.createElement("div");
    badge.className = "badge";
    badge.textContent = "S";
    if (meta?.needsReview) badge.dataset.review = "true";
    const project = meta?.showProject && meta.project ? meta.project : "";

    const pin: Pin = {
      target,
      badge,
      specId: spec.id,
      text,
      tags: spec.tags ?? [],
      project,
      editable: meta?.editable ?? true,
      confHtml: confidenceBadge(meta),
      scored: meta?.strategy === "scored",
      pageOrigin: meta?.pageOrigin,
      theme: meta?.theme,
    };
    this.pins.push(pin);
    // The reveal tooltip (showBadges=false) skips the badge entirely: no hover
    // affordance, no on-page marker. Its single tip is pinned via revealSpec().
    if (this.showBadges) {
      badge.addEventListener("mouseenter", () => {
        if (!this.pinnedAnchor) this.showTip(pin, false);
      });
      badge.addEventListener("mouseleave", () => {
        if (!this.pinnedAnchor) this.hideTip();
      });
      badge.addEventListener("click", () => this.togglePin(pin));
      layer.appendChild(badge);
      // Place only the new badge, dodging the already-placed ones. Cheaper than a
      // full re-lay on every render (one getBoundingClientRect, not N); scroll and
      // resize still trigger positionAll() when every badge genuinely moves.
      this.positionBadge(pin, this.placedBoxes(pin));
    }
  }

  // Boxes of every already-placed badge (all pins except `exclude`), read from
  // their committed style so no layout is forced. Fed to the solver so a newly
  // placed badge dodges its neighbors.
  private placedBoxes(exclude: Pin): BadgeBox[] {
    const boxes: BadgeBox[] = [];
    for (const pin of this.pins) {
      if (pin === exclude) continue;
      boxes.push({
        left: Number.parseFloat(pin.badge.style.left) || 0,
        top: Number.parseFloat(pin.badge.style.top) || 0,
        width: BADGE_SIZE,
        height: BADGE_SIZE,
      });
    }
    return boxes;
  }

  /** Pin the tip for a given spec id so its content shows without a hover (the
   *  context-menu "Show spec here" action). Returns false when no badge for that
   *  spec exists in this renderer (e.g. it rendered in another mode). */
  revealSpec(specId: string): boolean {
    const pin = this.pins.find((p) => p.specId === specId);
    if (!pin) return false;
    // showTip(pinned) sets pinnedAnchor (to the target, since reveal hides badges).
    this.showTip(pin, true);
    return true;
  }

  private togglePin(pin: Pin): void {
    if (this.pinnedAnchor === pin.badge) {
      this.unpin();
      return;
    }
    this.showTip(pin, true);
  }

  private unpin(): void {
    this.pinnedAnchor = null;
    this.hideTip();
  }

  private showTip(pin: Pin, pinned: boolean): void {
    const tip = this.tip;
    if (!tip) return;
    // Fresh open: drop any prior drag so the tip re-anchors to its anchor.
    this.dragged = false;
    tip.classList.remove("dragging");
    // Anchor to the badge in normal mode, or to the element itself when badges are
    // hidden (reveal tooltip).
    const anchor = this.showBadges ? pin.badge : pin.target;
    const tags = pin.tags.length
      ? `<div class="tags">${escapeHtml(pin.tags.join(", "))}</div>`
      : "";
    const canEdit = pin.editable && !!this.onEdit;
    const canDelete = pin.editable && !!this.onDelete;
    // Confirm loop: a scored match can be affirmed (Correct) or re-pinned (Fix,
    // the existing Edit flow). "Correct" shows only when the corpus opt-in gave us
    // an onConfirm callback, so it stays hidden for users who never opted in.
    const canConfirm = pin.scored && !!this.onConfirm;
    tip.innerHTML =
      (pinned
        ? `<button type="button" class="pin-close" aria-label="${escapeHtml(t("common.close"))}">×</button>`
        : "") +
      (pin.project ? `<span class="project">${escapeHtml(pin.project)}</span>` : "") +
      `<h4>${escapeHtml(pin.text.title)}</h4>` +
      pin.confHtml +
      // Description renders its Markdown subset (block: paragraphs + lists). The
      // renderer escapes every leaf and emits only allowlisted tags, so this
      // trusted fragment is safe via innerHTML.
      `<div class="d">${renderMarkdownBlock(pin.text.description, pin.pageOrigin)}</div>` +
      rulesListHtml(pin.text.businessRules, pin.pageOrigin) +
      tags +
      (pinned && canEdit
        ? `<button type="button" class="pin-edit">${escapeHtml(t("tooltip.editSpec"))}</button>`
        : "") +
      (pinned && canDelete
        ? `<button type="button" class="pin-delete">${escapeHtml(t("tooltip.deleteSpec"))}</button>`
        : "") +
      (pinned && canConfirm
        ? `<button type="button" class="pin-correct">${escapeHtml(t("match.correct"))}</button>`
        : "") +
      (pinned
        ? `<button type="button" class="pin-copy">${escapeHtml(t("common.copyLink"))}</button>`
        : "") +
      (pinned
        ? `<button type="button" class="pin-open">${escapeHtml(t("tooltip.openInPanel"))}</button>`
        : "");
    tip.classList.toggle("pinned", pinned);
    if (pinned) {
      this.pinnedAnchor = anchor;
      tip.querySelector(".pin-close")?.addEventListener("click", () => this.unpin());
      tip.querySelector(".pin-edit")?.addEventListener("click", () => {
        this.onEdit?.(pin.specId);
      });
      tip.querySelector(".pin-delete")?.addEventListener("click", () => {
        this.onDelete?.(pin.specId);
      });
      tip.querySelector(".pin-correct")?.addEventListener("click", () => {
        this.onConfirm?.(pin.specId);
        this.unpin();
      });
      tip.querySelector(".pin-copy")?.addEventListener("click", () => {
        void this.copyLink(pin);
      });
      tip.querySelector(".pin-open")?.addEventListener("click", () => {
        this.onOpenInPanel?.(pin.specId);
      });
    }
    this.positionTip(anchor);
    tip.classList.add("show");
  }

  private hideTip(): void {
    this.tip?.classList.remove("show", "pinned");
  }

  // Copy a shareable deep link to this spec. The tooltip runs in the host page, so
  // it builds from the live `location.href` (full URL, app fragment preserved) and
  // confirms via the in-page toast in the pin's theme.
  private async copyLink(pin: Pin): Promise<void> {
    const view = this.doc.defaultView;
    const href = view?.location.href;
    if (!href) return;
    if (await copyText(buildSpecLink(href, pin.specId)))
      showToast(t("common.linkCopied"), this.doc, pin.theme);
  }

  private positionTip(anchor: Element): void {
    const tip = this.tip;
    const win = this.doc.defaultView;
    if (!tip || !win) return;
    const rect = anchor.getBoundingClientRect();
    const tipW = tip.offsetWidth || 360;
    const maxLeft = win.scrollX + win.innerWidth - tipW - 8;
    let left = rect.left + win.scrollX;
    if (left > maxLeft) left = maxLeft;
    if (left < win.scrollX + 8) left = win.scrollX + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.bottom + win.scrollY + 6}px`;
  }

  // Place one badge, dodging the already-placed ones, and return its box so the
  // caller can accumulate it for the next badge to avoid.
  private positionBadge(pin: Pin, placed: BadgeBox[]): BadgeBox | null {
    const win = this.doc.defaultView;
    if (!win) return null;
    const rect = pin.target.getBoundingClientRect();
    const { left, top } = resolveBadgePosition(
      rect,
      {
        scrollX: win.scrollX,
        scrollY: win.scrollY,
        innerWidth: win.innerWidth,
        innerHeight: win.innerHeight,
      },
      placed,
    );
    pin.badge.style.left = `${left}px`;
    pin.badge.style.top = `${top}px`;
    return { left, top, width: BADGE_SIZE, height: BADGE_SIZE };
  }

  private positionAll(): void {
    if (this.showBadges) {
      const placed: BadgeBox[] = [];
      for (const pin of this.pins) {
        const box = this.positionBadge(pin, placed);
        if (box) placed.push(box);
      }
    }
    // Keep the pinned tip anchored through scroll/resize, unless the user has
    // dragged it somewhere deliberately.
    if (this.pinnedAnchor && !this.dragged) this.positionTip(this.pinnedAnchor);
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
    this.pinnedAnchor = null;
  }
}
