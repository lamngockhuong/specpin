// The on-page ghost-marker overlay for coverage mode. One dashed "+" marker per
// undocumented interactive element (a gap from `findGaps`), positioned with the
// same `resolveBadgePosition` solver the spec badges use so markers dodge each
// other and stay clear of the viewport edges. Its own Shadow host isolates it
// from the host page's CSS and from the session's tooltip host.
//
// Visually distinct from a spec badge on purpose: dashed muted border + "+"
// glyph, not the solid "S"/number badge, so a gap reads as "nothing here yet".
// Each marker offers Capture (author a spec on the element) and — only when the
// element yields a stable key — Ignore (dismiss the gap, personal + cross-machine).
import { t } from "../i18n/index.js";
import { createIcon } from "../shared/icons.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { type BadgeBox, documentView, resolveBadgePosition } from "./badge-position.js";

const HOST_ID = "specpin-coverage-host";
/** Marker diameter in px. A touch larger than the 16px spec badge so a ghost
 *  marker reads as its own affordance, not a spec badge. */
const MARKER_SIZE = 18;

export interface CoverageMarkerActions {
  /** Author a spec on the gap element (opens single capture). */
  onCapture(el: Element): void;
  /** Dismiss the gap. Only wired when the element has a stable key. */
  onIgnore(el: Element, key: string): void;
}

export interface CoverageRenderOptions {
  theme?: Theme;
  /** Stable ignore key for an element, or null when none (→ no Ignore action). */
  keyFor(el: Element): string | null;
  actions: CoverageMarkerActions;
}

const STYLES = `${SHADOW_PREAMBLE}
.cov-layer { position: absolute; top: 0; left: 0; z-index: 2147483646; }
.cov-marker {
  position: absolute; width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px;
  display: flex; align-items: center; justify-content: center;
}
.cov-capture, .cov-ignore {
  box-sizing: border-box; cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
/* Theme-independent on purpose: the marker sits over the *host page* (any
   background), not extension chrome, so it must not invert with the extension UI
   theme. Following the dark theme here paints a near-black blob on a light page.
   The --sp-overlay-chip-* tokens are defined once (no dark override), so the chip
   reads the same on light and dark pages. */
.cov-capture {
  width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px; border-radius: 50%;
  border: 1.5px dashed var(--sp-overlay-chip-border);
  background: var(--sp-overlay-chip-bg);
  color: var(--sp-overlay-chip-text);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
}
/* Accent is theme-independent too (one value, no dark override), so the teal
   hover matches the spec badge without reintroducing a dark-theme inversion. */
.cov-capture:hover { border-color: var(--sp-accent); color: var(--sp-accent); }
.cov-ignore {
  position: absolute; top: -6px; right: -6px; width: 14px; height: 14px;
  border-radius: 50%; border: none; opacity: 0; transition: opacity 120ms ease;
  background: var(--sp-overlay-chip-dismiss); color: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.3);
}
.cov-marker:hover .cov-ignore, .cov-ignore:focus-visible { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .cov-ignore { transition: none; } }`;

/** Renders + repositions the ghost markers in a dedicated Shadow host. `render`
 *  (re)builds from a gap list; `reposition` re-runs the solver from live rects
 *  (scroll/resize) without a re-scan; `destroy` tears the host down. */
export class CoverageOverlay {
  private readonly doc: Document;
  private host: HTMLElement | null = null;
  private layer: HTMLElement | null = null;
  /** One entry per gap: its element + its marker node. Built once in `render`
   *  (incl. the `keyFor` call for the Ignore button); `reposition` only reads
   *  live rects and mutates `node.style`, so the scroll/resize path does no DOM
   *  rebuild and no per-gap document query. */
  private markers: { el: Element; node: HTMLElement }[] = [];

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  render(gaps: Element[], opts: CoverageRenderOptions): void {
    if (!this.host) {
      const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, opts.theme);
      host.style.position = "absolute";
      host.style.top = "0";
      host.style.left = "0";
      const layer = this.doc.createElement("div");
      layer.className = "cov-layer";
      shadow.appendChild(layer);
      this.host = host;
      this.layer = layer;
    }
    const layer = this.layer;
    if (!layer) return;
    layer.textContent = "";
    this.markers = gaps.map((el) => {
      const node = this.buildMarker(el, opts);
      layer.appendChild(node);
      return { el, node };
    });
    this.layout();
  }

  reposition(): void {
    if (this.host) this.layout();
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.layer = null;
    this.markers = [];
  }

  // Recompute positions from live rects and write them onto the cached marker
  // nodes. Cheap: no DOM teardown, no `keyFor`, just the collision solver + a
  // style mutation per marker. Shared by render + reposition.
  private layout(): void {
    const win = this.doc.defaultView;
    if (!win) return;
    const placed: BadgeBox[] = [];
    const view = documentView(win);
    for (const { el, node } of this.markers) {
      const rect = el.getBoundingClientRect();
      const { left, top } = resolveBadgePosition(rect, view, placed, { size: MARKER_SIZE });
      placed.push({ left, top, width: MARKER_SIZE, height: MARKER_SIZE });
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    }
  }

  private buildMarker(el: Element, opts: CoverageRenderOptions): HTMLElement {
    const wrap = this.doc.createElement("div");
    wrap.className = "cov-marker";

    const capture = this.doc.createElement("button");
    capture.type = "button";
    capture.className = "cov-capture";
    capture.appendChild(createIcon(this.doc, "plus", 10));
    capture.title = t("coverage.capture");
    capture.setAttribute("aria-label", t("coverage.capture"));
    capture.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.actions.onCapture(el);
    });
    wrap.appendChild(capture);

    const key = opts.keyFor(el);
    if (key) {
      const ignore = this.doc.createElement("button");
      ignore.type = "button";
      ignore.className = "cov-ignore";
      ignore.appendChild(createIcon(this.doc, "close", 9));
      ignore.title = t("coverage.ignore");
      ignore.setAttribute("aria-label", t("coverage.ignore"));
      ignore.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.actions.onIgnore(el, key);
      });
      wrap.appendChild(ignore);
    }
    return wrap;
  }
}
