import { afterEach, describe, expect, it, vi } from "vitest";
import { CapturePicker } from "../src/content/capture-mode.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-capture-highlight")?.remove();
});

describe("CapturePicker", () => {
  it("fires onCancel (not onPick) when dismissed with Escape", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const picker = new CapturePicker(document);
    picker.start(onPick, onCancel);
    expect(picker.isActive).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // RT-FM6: the cancel path must notify so the caller releases its capture
    // flag; otherwise re-rendering would freeze.
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(picker.isActive).toBe(false);
  });

  it("fires onPick (not onCancel) when an element is clicked", () => {
    document.body.innerHTML = `<button>x</button>`;
    const target = document.querySelector("button") as HTMLElement;
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const picker = new CapturePicker(document);
    picker.start(onPick, onCancel);

    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(picker.isActive).toBe(false);
  });

  it("external stop() does not fire onCancel (caller owns its state)", () => {
    const onCancel = vi.fn();
    const picker = new CapturePicker(document);
    picker.start(vi.fn(), onCancel);
    picker.stop();
    expect(onCancel).not.toHaveBeenCalled();
    expect(picker.isActive).toBe(false);
  });
});
