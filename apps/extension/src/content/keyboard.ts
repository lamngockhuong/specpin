// Keyboard shortcuts for the content script. Alt+Shift is the modifier base to
// avoid clashing with common page/browser shortcuts:
//   Alt+Shift+S  toggle Specpin on/off
//   Alt+Shift+M  cycle display mode
//   Alt+Shift+C  toggle capture mode
export interface KeyboardHandlers {
  onToggleEnabled(): void;
  onCycleMode(): void;
  onToggleCapture(): void;
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
    }
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
