import { afterEach, describe, expect, it, vi } from "vitest";
import { type KeyboardHandlers, registerKeyboard } from "../src/content/keyboard.js";

function handlers(): KeyboardHandlers {
  return {
    onToggleEnabled: vi.fn(),
    onCycleMode: vi.fn(),
    onToggleCapture: vi.fn(),
    onToggleGuide: vi.fn(),
    onCycleSpec: vi.fn(),
    onToggleCoverage: vi.fn(),
  };
}

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

function press(key: string, mods: { altKey?: boolean; shiftKey?: boolean } = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key,
    altKey: mods.altKey ?? true,
    shiftKey: mods.shiftKey ?? true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(e);
  return e;
}

describe("registerKeyboard: Alt+Shift+U coverage toggle", () => {
  it("fires onToggleCoverage and prevents default", () => {
    const h = handlers();
    unregister = registerKeyboard(window, h);
    const e = press("u");
    expect(h.onToggleCoverage).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("does not fire other chords' handlers", () => {
    const h = handlers();
    unregister = registerKeyboard(window, h);
    press("u");
    expect(h.onToggleEnabled).not.toHaveBeenCalled();
    expect(h.onCycleMode).not.toHaveBeenCalled();
    expect(h.onToggleCapture).not.toHaveBeenCalled();
    expect(h.onToggleGuide).not.toHaveBeenCalled();
    expect(h.onCycleSpec).not.toHaveBeenCalled();
  });

  it("ignores U without both Alt and Shift", () => {
    const h = handlers();
    unregister = registerKeyboard(window, h);
    press("u", { altKey: true, shiftKey: false });
    press("u", { altKey: false, shiftKey: true });
    expect(h.onToggleCoverage).not.toHaveBeenCalled();
  });

  it("still routes the existing chords", () => {
    const h = handlers();
    unregister = registerKeyboard(window, h);
    press("s");
    press("n");
    expect(h.onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(h.onCycleSpec).toHaveBeenCalledTimes(1);
    expect(h.onToggleCoverage).not.toHaveBeenCalled();
  });
});
