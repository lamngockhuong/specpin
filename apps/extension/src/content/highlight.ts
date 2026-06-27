import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";

const HOST_ID = "specpin-highlight-host";
// How long the outline stays on screen before it fades, in ms.
const DURATION_MS = 1600;
const FADE_MS = 260;
// Outline sits this many px outside the element's box so it frames, not covers.
const INSET = 3;
// Stop the tracking loop after the rect is unchanged for this many frames (the
// smooth scroll has settled), so a stationary element costs no further reflows.
const STABLE_FRAMES = 3;

const STYLES = `
${SHADOW_PREAMBLE}
.box {
  position: fixed; z-index: 2147483646; pointer-events: none;
  border: 2px solid var(--sp-accent);
  border-radius: 4px;
  background: var(--sp-accent-glow);
  box-shadow: 0 0 0 3px var(--sp-accent-glow);
  transition: opacity ${FADE_MS}ms ease;
}
@keyframes specpin-highlight-pulse {
  0% { box-shadow: 0 0 0 2px var(--sp-accent-glow); }
  50% { box-shadow: 0 0 0 9px var(--sp-accent-glow); }
  100% { box-shadow: 0 0 0 3px var(--sp-accent-glow); }
}
.box.pulse { animation: specpin-highlight-pulse 0.7s ease-out 2; }
@media (prefers-reduced-motion: reduce) { .box.pulse { animation: none; } }
`;

interface Active {
  host: HTMLElement;
  box: HTMLElement;
  raf: number;
  timer: number;
  view: Window;
}

let active: Active | null = null;

/** Tear down the current overlay (if any) and stop its tracking loop / timers. */
function clear(): void {
  if (!active) return;
  active.view.cancelAnimationFrame(active.raf);
  active.view.clearTimeout(active.timer);
  active.host.remove();
  active = null;
}

/**
 * Scroll `target` into view and frame it with a brief, pulsing outline drawn in
 * its own Shadow-DOM overlay. The overlay is light-DOM agnostic: it tracks the
 * element's viewport rect via rAF (so it follows the smooth scroll) instead of
 * mutating the page element's classes, which never worked from a shadow-scoped
 * stylesheet. A second call cancels the first, so rapid clicks never stack
 * overlays. Self-cleans after the highlight fades.
 */
export function highlightElement(target: Element, doc: Document = document): void {
  clear();
  const view = doc.defaultView;
  if (!view) return;

  const { host, shadow } = createShadowHost(doc, HOST_ID, STYLES);
  const box = doc.createElement("div");
  box.className = "box pulse";
  shadow.appendChild(box);
  active = { host, box, raf: 0, timer: 0, view };

  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

  // Position the box from the element's rounded rect and return a signature so the
  // tracking loop can tell when the element has stopped moving.
  const reposition = (): string => {
    const r = target.getBoundingClientRect();
    const x = Math.round(r.left);
    const y = Math.round(r.top);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    box.style.left = `${x - INSET}px`;
    box.style.top = `${y - INSET}px`;
    box.style.width = `${w + INSET * 2}px`;
    box.style.height = `${h + INSET * 2}px`;
    return `${x},${y},${w},${h}`;
  };
  let lastRect = reposition();
  let stable = 0;

  // Follow the element through the smooth scroll, then stop once it settles. The
  // box is position:fixed so it stays put; the auto-dismiss timer runs regardless.
  const tick = (): void => {
    if (!active) return;
    const rect = reposition();
    if (rect === lastRect) {
      if (++stable >= STABLE_FRAMES) return;
    } else {
      lastRect = rect;
      stable = 0;
    }
    active.raf = view.requestAnimationFrame(tick);
  };
  active.raf = view.requestAnimationFrame(tick);

  active.timer = view.setTimeout(() => {
    if (!active) return;
    view.cancelAnimationFrame(active.raf);
    box.style.opacity = "0";
    // A newer highlight would have run clear() (cancelling this timer), so when it
    // fires this overlay is still the active one - just tear it down.
    active.timer = view.setTimeout(clear, FADE_MS);
  }, DURATION_MS);
}
