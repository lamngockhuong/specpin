import { afterEach, describe, expect, it, vi } from "vitest";
import { CapturePicker } from "../src/content/capture-mode.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-capture-highlight")?.remove();
  document.getElementById("specpin-picker-hud-host")?.remove();
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

  it("mounts a picker HUD host while active and removes it on teardown", () => {
    const picker = new CapturePicker(document);
    picker.start(vi.fn(), vi.fn());
    expect(document.getElementById("specpin-picker-hud-host")).not.toBeNull();
    picker.stop();
    expect(document.getElementById("specpin-picker-hud-host")).toBeNull();
  });

  // The picker suppresses page clicks in the document capture phase; a click on
  // its OWN HUD host must be let through (isOwnUi guard) so the HUD's Done/Cancel
  // buttons work and the host is never mistaken for a picked page element.
  it("does not pick a click landing on its own specpin-* host", () => {
    const onPick = vi.fn();
    const picker = new CapturePicker(document);
    picker.start(onPick, vi.fn());
    const hud = document.getElementById("specpin-picker-hud-host") as HTMLElement;
    hud.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).not.toHaveBeenCalled();
    expect(picker.isActive).toBe(true); // still picking; the HUD click was not a page pick
    picker.stop();
  });

  it("does not add its own HUD host to a multi-select selection", () => {
    const onDone = vi.fn();
    const picker = new CapturePicker(document);
    picker.startMulti(onDone, vi.fn());
    const hud = document.getElementById("specpin-picker-hud-host") as HTMLElement;
    hud.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Finishing now yields an empty selection: the HUD click was ignored, not
    // toggled into the picked set.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onDone).toHaveBeenCalledWith([]);
  });
});
