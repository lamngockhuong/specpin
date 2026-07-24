/**
 * Global keyboard shortcuts for the editor. Ignores key events while the user
 * is typing in an input/textarea so label editing isn't hijacked.
 *   Delete/Backspace → delete selected · A → toggle add/select · Esc → deselect
 */
import { useEffect } from "react";

interface Handlers {
  onDelete: () => void;
  onToggleTool: () => void;
  onEscape: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function useKeyboardShortcuts({ onDelete, onToggleTool, onEscape }: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete();
      } else if (e.key === "a" || e.key === "A") {
        onToggleTool();
      } else if (e.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDelete, onToggleTool, onEscape]);
}
