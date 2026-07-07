// Keyboard shortcuts for the content script. The chord list lives in `chords.ts`
// (single source of truth, shared with the cheat-sheet UI). Every chord uses
// Alt+Shift as the modifier base to avoid clashing with common page/browser
// shortcuts (including sites that bind a bare "?" to their own help dialog).
// Note: while a tour is running it owns Left/Right/Esc itself (its own listener,
// see GuideController); these Alt+Shift chords stay global.
import { CHORDS, type ChordAction, handlerName } from "./chords.js";

export type KeyboardHandlers = {
  [A in ChordAction as `on${Capitalize<A>}`]: () => void;
};

export function registerKeyboard(target: EventTarget, handlers: KeyboardHandlers): () => void {
  const byKey = new Map<string, ChordAction>(CHORDS.map((c) => [c.key, c.action]));

  const listener = (event: Event) => {
    const e = event as KeyboardEvent;
    if (!e.altKey || !e.shiftKey) return;
    const action = byKey.get(e.key.toLowerCase());
    if (!action) return;
    e.preventDefault();
    handlers[handlerName(action)]();
  };

  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
