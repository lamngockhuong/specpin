// Keyboard shortcuts for the content script. Alt+Shift is the modifier base to
// avoid clashing with common page/browser shortcuts:
//   Alt+Shift+S  toggle Specpin on/off
//   Alt+Shift+M  cycle display mode
//   Alt+Shift+C  toggle capture mode
//   Alt+Shift+G  start (or stop) the default guide tour
//   Alt+Shift+N  cycle focus through the matched specs (flash each in turn)
// Note: while a tour is running it owns Left/Right/Esc itself (its own listener,
// see GuideController); these Alt+Shift chords stay global.
export interface KeyboardHandlers {
  onToggleEnabled(): void;
  onCycleMode(): void;
  onToggleCapture(): void;
  onToggleGuide(): void;
  onCycleSpec(): void;
}

export function registerKeyboard(target: EventTarget, handlers: KeyboardHandlers): () => void {
  const listener = (event: Event) => {
    const e = event as KeyboardEvent;
    if (!e.altKey || !e.shiftKey) return;
    switch (e.key.toLowerCase()) {
      case "s":
        e.preventDefault();
        handlers.onToggleEnabled();
        break;
      case "m":
        e.preventDefault();
        handlers.onCycleMode();
        break;
      case "c":
        e.preventDefault();
        handlers.onToggleCapture();
        break;
      case "g":
        e.preventDefault();
        handlers.onToggleGuide();
        break;
      case "n":
        e.preventDefault();
        handlers.onCycleSpec();
        break;
    }
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
