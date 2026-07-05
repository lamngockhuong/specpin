import type { DisplayMode } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import type { LauncherPosition } from "../shared/config.js";
import { escapeHtml, setTrustedHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import type { RenderMeta } from "./renderer.js";

// One host per dismissable mode (not a single shared id): a page with mixed
// per-spec modes can have both the sidebar and the modal dismissed at once, and
// each needs its own pill (distinct count + reopen target).
const HOST_PREFIX = "specpin-launcher-host-";
const hostIdFor = (mode: DisplayMode): string => `${HOST_PREFIX}${mode}`;

const STYLES = `
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.pill {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  display: inline-flex; align-items: center; gap: 8px;
  font: 600 14px/1 var(--sp-font-ui);
  color: var(--sp-text);
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 999px; padding: 9px 14px; cursor: grab; touch-action: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  transition: transform 0.12s, border-color 0.12s;
}
.pill:active { cursor: grabbing; }
.pill:hover { transform: translateY(-1px); border-color: var(--sp-accent); }
.pill:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sp-accent); flex: none; }
.count { color: var(--sp-text-3); font: 600 13px/1 var(--sp-font-mono); }
.count:empty { display: none; }
.chev {
  width: 14px; height: 14px; flex: none; background: var(--sp-text-3);
  -webkit-mask: var(--chev) center / contain no-repeat;
  mask: var(--chev) center / contain no-repeat;
  --chev: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>');
}
@media (prefers-reduced-motion: reduce) { .pill { transition: none; } }
`;

export interface Launcher {
  /** Bump the matched-spec count shown on the pill (one call per rendered spec). */
  increment(): void;
  destroy(): void;
}

/**
 * Floating relaunch pill, shown when a sidebar/modal mode is dismissed. A tap
 * invokes `onReopen` (which the content script wires to clear the dismissed flag
 * and re-render); dragging it repositions the pill and reports the new spot via
 * `onMove` so the content script can persist it. Defaults to the bottom-right
 * corner, restoring `position` when given. Shadow-DOM isolated and themed like the
 * panels; the pill carries its own matched-spec count so renderers just call
 * increment().
 */
export function mountLauncher(
  doc: Document,
  opts: {
    mode: DisplayMode;
    theme?: Theme;
    position?: LauncherPosition | null;
    onReopen: () => void;
    onMove?: (pos: LauncherPosition) => void;
  },
): Launcher {
  // Stack offset by how many pills are already up, not by mode, so a lone pill
  // always sits in the same spot regardless of which surface was dismissed; a
  // second simultaneously-dismissed pill stacks above it instead of overlapping.
  // Count before mounting this host so the first pill gets slot 0.
  const slot = doc.querySelectorAll(`[id^="${HOST_PREFIX}"]`).length;
  const { host, shadow } = createShadowHost(doc, hostIdFor(opts.mode), STYLES, opts.theme);
  const win = doc.defaultView;
  const btn = doc.createElement("button");
  btn.className = "pill";
  btn.type = "button";
  const label = t("common.reopenPanel");
  btn.title = label;
  btn.setAttribute("aria-label", label);
  setTrustedHtml(
    btn,
    `<span class="dot"></span>` +
      `<span class="label">${escapeHtml(t("common.specpin"))}</span>` +
      `<span class="count"></span>` +
      `<span class="chev"></span>`,
  );
  shadow.appendChild(btn);

  // Write a clamped top-left. Bounds are passed in so the drag loop can compute
  // them once (the pill's size and the viewport don't change mid-drag) instead of
  // forcing a layout read on every pointermove.
  const writeAt = (left: number, top: number, maxLeft: number, maxTop: number): void => {
    btn.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
    btn.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
    btn.style.right = "auto";
    btn.style.bottom = "auto";
  };
  // Place by top-left, clamped into the viewport so the pill stays reachable even
  // if the window shrank since the position was saved.
  const placeAt = (left: number, top: number): void => {
    const rect = btn.getBoundingClientRect();
    writeAt(
      left,
      top,
      Math.max(0, (win?.innerWidth ?? 0) - rect.width),
      Math.max(0, (win?.innerHeight ?? 0) - rect.height),
    );
  };

  // A stored position wins; otherwise the default corner. The slot offset applies
  // in both so two simultaneously dismissed pills never overlap.
  if (opts.position) placeAt(opts.position.x, opts.position.y + slot * 48);
  else btn.style.bottom = `${16 + slot * 48}px`;

  // Drag to reposition. A small threshold separates a drag from a tap, so a plain
  // click still reopens; pointer capture keeps tracking if the cursor leaves the
  // pill mid-drag.
  const DRAG_THRESHOLD = 4;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  // Clamp bounds captured at drag start (size + viewport are stable during a drag).
  let maxLeft = 0;
  let maxTop = 0;
  let dragging = false;
  let moved = false;
  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    maxLeft = Math.max(0, (win?.innerWidth ?? 0) - rect.width);
    maxTop = Math.max(0, (win?.innerHeight ?? 0) - rect.height);
    btn.setPointerCapture?.(e.pointerId);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    writeAt(originLeft + dx, originTop + dy, maxLeft, maxTop);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    btn.releasePointerCapture?.(e.pointerId);
    if (moved) {
      const rect = btn.getBoundingClientRect();
      opts.onMove?.({ x: rect.left, y: rect.top });
    }
  };
  btn.addEventListener("pointerup", endDrag);
  btn.addEventListener("pointercancel", endDrag);
  // A drag ends in a synthetic click; swallow it so the pill doesn't reopen. A
  // real tap (no movement) falls through to onReopen.
  btn.addEventListener("click", (e) => {
    if (moved) {
      moved = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    opts.onReopen();
  });

  const countEl = btn.querySelector<HTMLElement>(".count");
  let count = 0;
  return {
    increment(): void {
      count += 1;
      if (countEl) countEl.textContent = `· ${count}`;
    },
    destroy(): void {
      host.remove();
    },
  };
}

/**
 * Per-renderer relaunch-pill lifecycle. Aggregate renderers (sidebar, modal) show
 * the floating pill when their mode is dismissed; this owns its lazy mount (once),
 * per-render count, and teardown so each renderer does not re-implement the flow.
 */
export class LauncherSlot {
  private launcher: Launcher | null = null;

  constructor(
    private readonly doc: Document,
    private readonly mode: DisplayMode,
  ) {}

  /** Mount the pill on first call, then bump its count for this matched spec. */
  show(meta: RenderMeta | undefined, onReopen: () => void): void {
    if (!this.launcher) {
      this.launcher = mountLauncher(this.doc, {
        mode: this.mode,
        theme: meta?.theme,
        position: meta?.launcherPosition,
        onReopen,
        onMove: meta?.onLauncherMove,
      });
    }
    this.launcher.increment();
  }

  destroy(): void {
    this.launcher?.destroy();
    this.launcher = null;
  }
}
