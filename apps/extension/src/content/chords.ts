// Single source of truth for the content-script keyboard chords. Both the key
// handler (keyboard.ts) and the cheat-sheet UI (in-page help overlay + the
// Options "Shortcuts" card) derive from this list, so adding or renaming a chord
// updates every surface at once (no drift).
//
// All chords use Alt+Shift as the modifier base to avoid clashing with common
// page/browser shortcuts (including sites that bind a bare "?" to their own help).
import type { MessageKey } from "../i18n/index.js";

/** The action a chord invokes. Maps 1:1 to a `KeyboardHandlers` method named
 *  `on${Capitalize<ChordAction>}` (see keyboard.ts). */
export type ChordAction =
  | "toggleEnabled"
  | "cycleMode"
  | "toggleCapture"
  | "toggleGuide"
  | "cycleSpec"
  | "toggleCoverage"
  | "toggleHelp";

export interface Chord {
  action: ChordAction;
  /** The `event.key` (lowercased) that triggers this chord within the Alt+Shift
   *  guard. Letters arrive uppercased while Shift is held, so keyboard.ts
   *  lowercases before matching. */
  key: string;
  /** Human display of the combo, shown in the cheat-sheet. Not parsed. */
  keyLabel: string;
  /** i18n key for the chord's description in the cheat-sheet. */
  descKey: MessageKey;
}

export const CHORDS: readonly Chord[] = [
  {
    action: "toggleEnabled",
    key: "s",
    keyLabel: "Alt+Shift+S",
    descKey: "shortcuts.toggleEnabled",
  },
  { action: "cycleMode", key: "m", keyLabel: "Alt+Shift+M", descKey: "shortcuts.cycleMode" },
  {
    action: "toggleCapture",
    key: "c",
    keyLabel: "Alt+Shift+C",
    descKey: "shortcuts.toggleCapture",
  },
  { action: "toggleGuide", key: "g", keyLabel: "Alt+Shift+G", descKey: "shortcuts.toggleGuide" },
  { action: "cycleSpec", key: "n", keyLabel: "Alt+Shift+N", descKey: "shortcuts.cycleSpec" },
  {
    action: "toggleCoverage",
    key: "u",
    keyLabel: "Alt+Shift+U",
    descKey: "shortcuts.toggleCoverage",
  },
  { action: "toggleHelp", key: "?", keyLabel: "Alt+Shift+?", descKey: "shortcuts.toggleHelp" },
];

/** The `KeyboardHandlers` method name for a chord action, e.g.
 *  `toggleEnabled` -> `onToggleEnabled`. */
export function handlerName(action: ChordAction): `on${Capitalize<ChordAction>}` {
  return `on${action[0].toUpperCase()}${action.slice(1)}` as `on${Capitalize<ChordAction>}`;
}
