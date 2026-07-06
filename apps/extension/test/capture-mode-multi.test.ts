import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapturePicker } from "../src/content/capture-mode.js";

let picker: CapturePicker;

beforeEach(() => {
  document.body.innerHTML = `<button id="a">A</button><button id="b">B</button><button id="c">C</button>`;
  picker = new CapturePicker(document);
});

afterEach(() => {
  picker.stop();
  document.body.innerHTML = "";
});

function clickEl(id: string): void {
  const el = document.getElementById(id) as HTMLElement;
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("startMulti", () => {
  it("accumulates picks and finishes on Enter", () => {
    const onDone = vi.fn();
    picker.startMulti(onDone);
    clickEl("a");
    clickEl("c");
    pressKey("Enter");
    expect(onDone).toHaveBeenCalledTimes(1);
    const els = onDone.mock.calls[0][0] as Element[];
    expect(els.map((e) => e.id)).toEqual(["a", "c"]);
    expect(picker.isActive).toBe(false);
  });

  it("toggles an element out when clicked twice", () => {
    const onDone = vi.fn();
    picker.startMulti(onDone);
    clickEl("a");
    clickEl("b");
    clickEl("a"); // deselect a
    pressKey("Enter");
    const els = onDone.mock.calls[0][0] as Element[];
    expect(els.map((e) => e.id)).toEqual(["b"]);
  });

  it("cancels on Escape with no selection delivered", () => {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    picker.startMulti(onDone, onCancel);
    clickEl("a");
    pressKey("Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(picker.isActive).toBe(false);
  });

  it("paints a persistent selection outline per pick", () => {
    picker.startMulti(vi.fn());
    clickEl("a");
    clickEl("b");
    const layer = document.getElementById("specpin-capture-selection");
    expect(layer?.childElementCount).toBe(2);
  });
});

describe("single-shot start is unchanged (regression lock)", () => {
  it("picks one element and tears down (no multi behavior)", () => {
    const onPick = vi.fn();
    picker.start(onPick);
    clickEl("a");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect((onPick.mock.calls[0][0] as Element).id).toBe("a");
    expect(picker.isActive).toBe(false);
    // No selection layer is ever created in single-shot mode.
    expect(document.getElementById("specpin-capture-selection")).toBeNull();
  });

  it("Enter does nothing in single-shot mode", () => {
    const onPick = vi.fn();
    picker.start(onPick);
    pressKey("Enter");
    expect(onPick).not.toHaveBeenCalled();
    expect(picker.isActive).toBe(true);
  });
});
