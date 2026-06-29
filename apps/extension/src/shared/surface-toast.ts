// A brief, non-blocking message pill for the extension's own surfaces (popup and
// side panel). Unlike content/toast.ts (which injects into an arbitrary host page
// via Shadow DOM), this lives in our own CSP-clean document, so it is a plain
// element styled by surface-toast.css. Used to tell the user when an active-tab
// action could not be delivered (e.g. the current tab is an extension/chrome://
// page with no content script to receive it).

// How long the pill stays fully visible before it fades, in ms.
const DURATION_MS = 2600;
const FADE_MS = 220;

interface Active {
  el: HTMLElement;
  hideTimer: number;
  removeTimer: number;
}

let active: Active | null = null;

function clear(): void {
  if (!active) return;
  clearTimeout(active.hideTimer);
  clearTimeout(active.removeTimer);
  active.el.remove();
  active = null;
}

/** Show a transient message pinned to the top of the surface. A new call replaces
 *  the current pill, so rapid actions never stack. Self-cleans after it fades. */
export function showSurfaceToast(message: string): void {
  clear();
  const el = document.createElement("div");
  el.className = "sp-toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  const state: Active = { el, hideTimer: 0, removeTimer: 0 };
  active = state;
  // Next frame so the opacity transition actually runs.
  requestAnimationFrame(() => el.classList.add("show"));
  state.hideTimer = window.setTimeout(() => {
    el.classList.remove("show");
    state.removeTimer = window.setTimeout(clear, FADE_MS);
  }, DURATION_MS);
}
