import { t } from "../i18n/index.js";
import { MARKDOWN_BODY_CSS, rulesListHtml } from "../renderers/renderer.js";
import { escapeHtml, setTrustedHtml } from "../shared/html.js";
import { renderMarkdownBlock } from "../shared/markdown.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { localizeSpec } from "./localize-spec.js";
import type { ResolvedStep } from "./resolve-guide.js";

const HOST_ID = "specpin-guide-host";
// Outline sits this many px outside the element box so it frames, not covers it.
const INSET = 4;
// Gap between the spotlit element and the popover.
const GAP = 12;
const POPOVER_WIDTH = 340;
// Assumed popover height before its first layout, for flip/clamp math.
const MIN_POP_HEIGHT = 160;

const STYLES = `
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
/* The spotlight: a fixed, non-interactive frame around the current element. It
   owns its own overlay (NOT the shared highlight singleton, RT-H5): no auto-fade,
   no clear() of other overlays, so it never fights a popup HIGHLIGHT_ELEMENT or
   another step. */
.spot {
  position: fixed; z-index: 2147483646; pointer-events: none;
  border: 2px solid var(--sp-accent);
  border-radius: 5px;
  background: var(--sp-accent-glow);
  box-shadow: 0 0 0 3px var(--sp-accent-glow), 0 0 0 9999px rgba(0, 0, 0, 0.0);
  transition: left 0.12s, top 0.12s, width 0.12s, height 0.12s;
}
.spot[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .spot { transition: none; } }
.pop {
  position: fixed; z-index: 2147483647; pointer-events: auto;
  width: min(${POPOVER_WIDTH}px, calc(100vw - 24px));
  background: var(--sp-surface); color: var(--sp-text);
  font: 15px/1.5 var(--sp-font-ui);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-card);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  padding: 16px;
}
.eyebrow {
  font: 600 12px/1 var(--sp-font-mono); letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--sp-text-3);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.title { margin: 8px 0 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.d { color: var(--sp-text-2); margin-top: 6px; }
.d:empty { display: none; }
.rules { margin: 8px 0 0; padding-left: 16px; color: var(--sp-text-3); }
.rules:empty { display: none; }
.miss { color: var(--sp-warning); margin-top: 8px; }
${MARKDOWN_BODY_CSS}
.foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.count { font: 600 13px/1 var(--sp-font-mono); color: var(--sp-text-3); margin-right: auto; }
button {
  cursor: pointer; font: 15px/1 var(--sp-font-ui);
  padding: 7px 12px; border-radius: var(--sp-radius-control);
  border: 1px solid var(--sp-border); background: var(--sp-control); color: var(--sp-text);
}
button:hover { background: var(--sp-elevated); }
button:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
button[disabled] { opacity: 0.5; cursor: default; }
button.primary { background: var(--sp-accent); color: var(--sp-accent-contrast, #fff); border-color: var(--sp-accent); }
.x {
  flex: none; width: 22px; height: 22px; padding: 0; line-height: 1;
  font-size: 16px; border-radius: var(--sp-radius-control);
}
`;

/** Options for one guide run. The content script resolves steps + supplies the
 *  active locale/theme; `onExit` lets it clear `guideActive` and restore the
 *  suspended render session when the tour ends (by Done/Skip/Esc OR a hard-stop). */
export interface GuideStartOptions {
  guideName: string;
  locale: string;
  defaultLocale?: string;
  theme: Theme;
  pageOrigin?: string;
  doc?: Document;
  /** Called exactly once when the tour ends, for any reason. */
  onExit: () => void;
}

/**
 * In-page guide walkthrough: steps through an ordered list of resolved specs,
 * spotlighting each element and showing its localized content in an anchored
 * popover with Prev/Next/Skip/Done + a step counter + keyboard nav. A standalone
 * content-side controller (NOT a DisplayMode): it is launched on demand and
 * coexists with the (suspended) render session. All listeners route through one
 * AbortController so a single stop() tears everything down with no leaks.
 */
export class GuideController {
  private steps: ResolvedStep[] = [];
  private index = 0;
  private opts: GuideStartOptions | null = null;
  private doc: Document = document;
  private host: HTMLElement | null = null;
  private spot: HTMLElement | null = null;
  private pop: HTMLElement | null = null;
  private ac: AbortController | null = null;
  private raf = 0;
  private exited = false;
  // Last applied layout signature, so the per-frame tracking loop skips style
  // writes (and the popover reflow) while the element rect is unchanged.
  private lastSig = "";

  /** Whether a tour is currently running. */
  get active(): boolean {
    return this.host !== null;
  }

  start(steps: ResolvedStep[], opts: GuideStartOptions): void {
    // A no-step guide has nothing to walk; exit immediately so the caller's
    // session restore still runs.
    this.stop();
    if (steps.length === 0) {
      opts.onExit();
      return;
    }
    this.steps = steps;
    this.opts = opts;
    this.doc = opts.doc ?? document;
    this.index = 0;
    this.exited = false;
    this.ac = new AbortController();

    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, opts.theme);
    this.host = host;
    const spot = this.doc.createElement("div");
    spot.className = "spot";
    const pop = this.doc.createElement("div");
    pop.className = "pop";
    shadow.appendChild(spot);
    shadow.appendChild(pop);
    this.spot = spot;
    this.pop = pop;

    // Keyboard nav. Left/Right step; Esc exits. Bound to the host page window
    // (capture) so it works regardless of page focus, and torn down on stop().
    const view = this.doc.defaultView;
    view?.addEventListener("keydown", this.onKeydown, {
      signal: this.ac.signal,
      capture: true,
    });

    this.renderStep();
    this.startTracking();
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.stop();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      this.next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.prev();
    }
  };

  next(): void {
    if (this.index >= this.steps.length - 1) {
      this.stop(); // Next on the last step is Done.
      return;
    }
    this.goTo(this.index + 1);
  }

  prev(): void {
    if (this.index > 0) this.goTo(this.index - 1);
  }

  goTo(i: number): void {
    if (!this.active || i < 0 || i >= this.steps.length) return;
    this.index = i;
    this.renderStep();
  }

  private currentStep(): ResolvedStep | undefined {
    return this.steps[this.index];
  }

  private renderStep(): void {
    const step = this.currentStep();
    if (!step || !this.pop) return;
    const opts = this.opts as GuideStartOptions;
    const text = localizeSpec(step.spec, opts.locale, opts.defaultLocale);
    const total = this.steps.length;
    const isFirst = this.index === 0;
    const isLast = this.index === total - 1;
    // The guide's own name is committed/personal text, so it MUST be escaped
    // before innerHTML (RT-C2); the spec's description/rules go through the
    // escape-first Markdown renderers, same as every other renderer.
    setTrustedHtml(
      this.pop,
      `<div class="eyebrow"><span>${escapeHtml(opts.guideName)}</span>` +
        `<button class="x" type="button" aria-label="${escapeHtml(t("guide.close"))}">&times;</button></div>` +
        `<h2 class="title">${escapeHtml(text.title)}</h2>` +
        `<div class="d">${renderMarkdownBlock(text.description, opts.pageOrigin)}</div>` +
        `<ul class="rules">${rulesListInner(text.businessRules, opts.pageOrigin)}</ul>` +
        missingNoteHtml(step) +
        `<div class="foot">` +
        `<span class="count">${escapeHtml(t("guide.stepCounter", { current: this.index + 1, total }))}</span>` +
        `<button class="prev" type="button"${isFirst ? " disabled" : ""}>${escapeHtml(t("guide.prev"))}</button>` +
        (isLast
          ? ""
          : `<button class="skip" type="button">${escapeHtml(t("guide.skip"))}</button>`) +
        `<button class="next primary" type="button">${escapeHtml(isLast ? t("guide.done") : t("guide.next"))}</button>` +
        `</div>`,
    );

    const signal = this.ac?.signal;
    this.pop.querySelector(".x")?.addEventListener("click", () => this.stop(), { signal });
    this.pop.querySelector(".prev")?.addEventListener("click", () => this.prev(), { signal });
    this.pop.querySelector(".skip")?.addEventListener("click", () => this.stop(), { signal });
    this.pop.querySelector(".next")?.addEventListener("click", () => this.next(), { signal });

    // Scroll the target into view (the rAF loop then keeps the spotlight + popover
    // glued to it through the smooth scroll). reduced-motion users get an instant
    // jump, not an animated scroll.
    const reduceMotion = this.doc.defaultView?.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (step.el.isConnected) {
      step.el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    }
    // Force a reposition for the new step (its element + content changed).
    this.lastSig = "";
    this.position();
    // a11y: move focus to the primary control on each step so keyboard users land
    // on the tour, not the page behind it.
    (this.pop.querySelector(".next") as HTMLElement | null)?.focus();
  }

  /** Track the current element's viewport rect every frame so the spotlight and
   *  popover follow scrolling/layout. Self-cancels on stop(). */
  private startTracking(): void {
    const view = this.doc.defaultView;
    if (!view) return;
    const tick = (): void => {
      if (!this.active) return;
      this.position();
      this.raf = view.requestAnimationFrame(tick);
    };
    this.raf = view.requestAnimationFrame(tick);
  }

  /** Place the spotlight on the current element and the popover beside it (below
   *  when there is room, else above), clamped to the viewport. A detached element
   *  hides the spotlight and centers the popover (the step shows a "missing" note). */
  private position(): void {
    const step = this.currentStep();
    const view = this.doc.defaultView;
    if (!step || !this.spot || !this.pop || !view) return;
    const vw = view.innerWidth;
    const vh = view.innerHeight;

    // Off-screen: a detached OR zero-size element gets no spotlight and a centered
    // popover (one guard for both; the rect is read only when connected).
    const r = step.el.isConnected ? step.el.getBoundingClientRect() : null;
    if (!r || (r.width === 0 && r.height === 0)) {
      if (this.sigChanged(`offscreen:${vw}x${vh}`)) {
        this.spot.setAttribute("hidden", "");
        this.centerPopover(vw, vh);
      }
      return;
    }
    // Skip the style writes + popover reflow while the rect/viewport is unchanged.
    const sig = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${vw}x${vh}`;
    if (!this.sigChanged(sig)) return;

    // Read the popover size BEFORE writing the spotlight, so the spot writes do not
    // force a synchronous reflow for the pop read.
    const { w: popW, h: popH } = this.popSize();
    this.spot.removeAttribute("hidden");
    this.spot.style.left = `${Math.round(r.left) - INSET}px`;
    this.spot.style.top = `${Math.round(r.top) - INSET}px`;
    this.spot.style.width = `${Math.round(r.width) + INSET * 2}px`;
    this.spot.style.height = `${Math.round(r.height) + INSET * 2}px`;
    // Prefer below the element; flip above when it would overflow the viewport.
    let top = r.bottom + GAP;
    if (top + popH > vh - 8) top = r.top - GAP - popH;
    top = clamp(top, 8, Math.max(8, vh - popH - 8));
    // Horizontally align to the element's left edge, clamped on-screen.
    const left = clamp(r.left, 8, Math.max(8, vw - popW - 8));
    this.pop.style.left = `${Math.round(left)}px`;
    this.pop.style.top = `${Math.round(top)}px`;
  }

  /** The popover's current size, falling back to its design width / assumed height
   *  before first layout. One source for both placement paths. */
  private popSize(): { w: number; h: number } {
    const pr = (this.pop as HTMLElement).getBoundingClientRect();
    return { w: pr.width || POPOVER_WIDTH, h: pr.height || MIN_POP_HEIGHT };
  }

  /** True (and records the new signature) when the layout signature differs from
   *  the last applied one; false when unchanged so the caller can skip writes. */
  private sigChanged(sig: string): boolean {
    if (sig === this.lastSig) return false;
    this.lastSig = sig;
    return true;
  }

  private centerPopover(vw: number, vh: number): void {
    if (!this.pop) return;
    const { w: popW, h: popH } = this.popSize();
    this.pop.style.left = `${Math.round((vw - popW) / 2)}px`;
    this.pop.style.top = `${Math.round((vh - popH) / 2)}px`;
  }

  /** End the tour (Done/Skip/Esc, or a programmatic hard-stop from the content
   *  script on SPECS_CHANGED / SPA navigation). Tears everything down and fires
   *  onExit exactly once so the caller restores the suspended session. */
  stop(): void {
    const view = this.doc.defaultView;
    if (this.raf) view?.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ac?.abort();
    this.ac = null;
    this.host?.remove();
    this.host = null;
    this.spot = null;
    this.pop = null;
    this.steps = [];
    const onExit = this.opts?.onExit;
    this.opts = null;
    if (!this.exited) {
      this.exited = true;
      onExit?.();
    }
  }

  /** Alias for stop(): a full teardown. Kept for symmetry with other controllers. */
  destroy(): void {
    this.stop();
  }
}

/** Inner `<li>`s for the rules list (rulesListHtml wraps in its own `<ul>`; here
 *  the popover owns the `<ul class="rules">`, so reuse only the item rendering by
 *  stripping the wrapper). Returns "" for no rules so the empty `<ul>` collapses. */
function rulesListInner(rules: string[], pageOrigin?: string): string {
  const html = rulesListHtml(rules, pageOrigin);
  return html ? html.replace(/^<ul>/, "").replace(/<\/ul>$/, "") : "";
}

function missingNoteHtml(step: ResolvedStep): string {
  return step.el.isConnected
    ? ""
    : `<div class="miss">${escapeHtml(t("guide.elementMissing"))}</div>`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
