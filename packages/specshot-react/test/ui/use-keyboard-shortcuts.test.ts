import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "../../src/ui/use-keyboard-shortcuts.js";

function Harness(props: { onDelete: () => void; onToggleTool: () => void; onEscape: () => void }) {
  useKeyboardShortcuts(props);
  return createElement("input", { "data-testid": "typing-target" });
}

function fireKey(key: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useKeyboardShortcuts", () => {
  it("Delete/Backspace triggers onDelete", () => {
    const onDelete = vi.fn();
    render(createElement(Harness, { onDelete, onToggleTool: vi.fn(), onEscape: vi.fn() }));
    fireKey("Delete");
    fireKey("Backspace");
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it("A toggles the tool", () => {
    const onToggleTool = vi.fn();
    render(createElement(Harness, { onDelete: vi.fn(), onToggleTool, onEscape: vi.fn() }));
    fireKey("a");
    fireKey("A");
    expect(onToggleTool).toHaveBeenCalledTimes(2);
  });

  it("Escape deselects", () => {
    const onEscape = vi.fn();
    render(createElement(Harness, { onDelete: vi.fn(), onToggleTool: vi.fn(), onEscape }));
    fireKey("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts while the user is typing in a form field", () => {
    const onDelete = vi.fn();
    const { getByTestId } = render(
      createElement(Harness, { onDelete, onToggleTool: vi.fn(), onEscape: vi.fn() }),
    );
    fireKey("Delete", getByTestId("typing-target"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("detaches the listener on unmount", () => {
    const onDelete = vi.fn();
    const { unmount } = render(
      createElement(Harness, { onDelete, onToggleTool: vi.fn(), onEscape: vi.fn() }),
    );
    unmount();
    fireKey("Delete");
    expect(onDelete).not.toHaveBeenCalled();
  });
});
