// In-page keyboard cheat-sheet: a Shadow-DOM overlay listing every chord from
// the shared `CHORDS` table. Read-only (no rebinding). Singleton per page: a
// second toggle closes it. Esc / backdrop / re-press close; focus is trapped
// while open and restored on close; reduced-motion honored.
import { t } from "../i18n/index.js";
import { createShadowHost } from "../shared/shadow.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { CHORDS } from "./chords.js";

const HOST_ID = "specpin-help";

const STYLES = `${SHADOW_PREAMBLE}
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: var(--sp-overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.card {
  width: 420px; max-width: 92vw; max-height: 86vh; overflow: auto;
  background: var(--sp-surface); color: var(--sp-text);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-card);
  padding: 24px; font: 15px/1.5 var(--sp-font-ui);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}
.head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 16px; }
.title { margin: 0; font-size: 16px; font-weight: 600; }
.close {
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
  background: var(--sp-control); color: var(--sp-text); cursor: pointer;
  width: 28px; height: 28px; font: 600 16px/1 var(--sp-font-ui);
}
.close:hover { filter: brightness(0.97); }
.close:focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 2px; }
.row { display: flex; align-items: baseline; gap: 14px; padding: 7px 0; border-top: 1px solid var(--sp-border); }
.row:first-of-type { border-top: none; }
kbd {
  flex: none; min-width: 116px;
  font: 600 12px/1.4 var(--sp-font-mono, ui-monospace, monospace);
  color: var(--sp-text-2, var(--sp-text)); white-space: nowrap;
}
.desc { color: var(--sp-text); }
@media (prefers-reduced-motion: reduce) { .close { transition: none; } }`;

export interface HelpOverlay {
  /** Open when closed, close when open. */
  toggle(theme: Theme): void;
  /** Remove any open overlay and its listeners. */
  destroy(): void;
}

export function createHelpOverlay(doc: Document): HelpOverlay {
  let host: HTMLElement | null = null;
  let controller: AbortController | null = null;
  let lastFocused: HTMLElement | null = null;

  function close(): void {
    controller?.abort();
    controller = null;
    host?.remove();
    host = null;
    lastFocused?.focus?.();
    lastFocused = null;
  }

  function open(theme: Theme): void {
    lastFocused = (doc.activeElement as HTMLElement | null) ?? null;
    const mounted = createShadowHost(doc, HOST_ID, STYLES, theme);
    host = mounted.host;
    const { shadow } = mounted;
    controller = new AbortController();
    const { signal } = controller;

    const backdrop = doc.createElement("div");
    backdrop.className = "backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", t("shortcuts.title"));

    const card = doc.createElement("div");
    card.className = "card";

    const head = doc.createElement("div");
    head.className = "head";
    const title = doc.createElement("h2");
    title.className = "title";
    title.textContent = t("shortcuts.title");
    const closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "close";
    closeBtn.textContent = "×"; // multiplication sign as a close glyph
    closeBtn.setAttribute("aria-label", t("shortcuts.close"));
    head.append(title, closeBtn);
    card.appendChild(head);

    for (const chord of CHORDS) {
      const row = doc.createElement("div");
      row.className = "row";
      const key = doc.createElement("kbd");
      key.textContent = chord.keyLabel;
      const desc = doc.createElement("span");
      desc.className = "desc";
      desc.textContent = t(chord.descKey);
      row.append(key, desc);
      card.appendChild(row);
    }

    backdrop.appendChild(card);
    shadow.appendChild(backdrop);

    closeBtn.addEventListener("click", close, { signal });
    backdrop.addEventListener(
      "mousedown",
      (e) => {
        if (e.target === backdrop) close();
      },
      { signal },
    );
    // Trap focus + close on Esc while the overlay owns the keyboard.
    shadow.addEventListener(
      "keydown",
      (e) => {
        const ev = e as KeyboardEvent;
        if (ev.key === "Escape") {
          ev.preventDefault();
          close();
        } else if (ev.key === "Tab") {
          // Only the close button is focusable; keep focus on it.
          ev.preventDefault();
          closeBtn.focus();
        }
      },
      { signal },
    );

    closeBtn.focus();
  }

  return {
    toggle(theme: Theme): void {
      if (host) close();
      else open(theme);
    },
    destroy(): void {
      close();
    },
  };
}
