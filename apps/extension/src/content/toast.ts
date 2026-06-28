import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";

// A brief, non-blocking message pill, drawn in its own Shadow-DOM host so it stays
// out of the page's styles/CSP (same isolation pattern as highlight.ts). Used to
// tell the user when a context-menu action found nothing to act on.

const HOST_ID = "specpin-toast-host";
// How long the pill stays fully visible before it fades, in ms.
const DURATION_MS = 2200;
const FADE_MS = 220;

const STYLES = `
${SHADOW_PREAMBLE}
.toast {
  position: fixed; top: 20px; right: 20px;
  z-index: 2147483646; pointer-events: none;
  max-width: 80vw; box-sizing: border-box;
  padding: 10px 16px;
  border-radius: var(--sp-radius-card);
  background: var(--sp-accent);
  color: var(--sp-accent-on);
  border: 1px solid var(--sp-accent-hover);
  box-shadow: 0 6px 20px var(--sp-accent-glow), 0 4px 12px rgba(0, 0, 0, 0.22);
  font-family: var(--sp-font-ui);
  font-size: 13px; font-weight: 600; line-height: 1.4;
  opacity: 0; transform: translateY(-8px);
  transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
}
.toast.show { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) { .toast { transition: none; transform: none; } }
`;

interface Active {
  host: HTMLElement;
  view: Window;
  hideTimer: number;
  removeTimer: number;
}

let active: Active | null = null;

function clear(): void {
  if (!active) return;
  active.view.clearTimeout(active.hideTimer);
  active.view.clearTimeout(active.removeTimer);
  active.host.remove();
  active = null;
}

/** Show a transient message at the bottom of the viewport. A new call replaces
 *  the current pill, so rapid actions never stack. Self-cleans after it fades. */
export function showToast(message: string, doc: Document = document, theme?: Theme): void {
  clear();
  const view = doc.defaultView;
  if (!view) return;
  const { host, shadow } = createShadowHost(doc, HOST_ID, STYLES, theme);
  const el = doc.createElement("div");
  el.className = "toast";
  el.textContent = message;
  shadow.appendChild(el);
  const state: Active = { host, view, hideTimer: 0, removeTimer: 0 };
  active = state;
  // Next frame so the opacity transition actually runs.
  view.requestAnimationFrame(() => el.classList.add("show"));
  state.hideTimer = view.setTimeout(() => {
    el.classList.remove("show");
    state.removeTimer = view.setTimeout(clear, FADE_MS);
  }, DURATION_MS);
}
