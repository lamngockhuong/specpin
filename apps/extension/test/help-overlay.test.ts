import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHORDS } from "../src/content/chords.js";
import { createHelpOverlay } from "../src/content/help-overlay.js";
import { initI18n } from "../src/i18n/index.js";

function host(): HTMLElement | null {
  return document.getElementById("specpin-help");
}

beforeEach(() => {
  initI18n("en");
});

afterEach(() => {
  document.body.innerHTML = "";
  host()?.remove();
});

describe("createHelpOverlay", () => {
  it("toggles open and closed, listing every chord", () => {
    const overlay = createHelpOverlay(document);
    expect(host()).toBeNull();

    overlay.toggle("system");
    const shadow = host()?.shadowRoot;
    expect(shadow).toBeTruthy();
    expect(shadow?.querySelector('[role="dialog"]')).toBeTruthy();
    // One row per chord.
    expect(shadow?.querySelectorAll(".row").length).toBe(CHORDS.length);

    overlay.toggle("system");
    expect(host()).toBeNull();
  });

  it("closes on Escape", () => {
    const overlay = createHelpOverlay(document);
    overlay.toggle("system");
    expect(host()).toBeTruthy();

    const shadow = host()?.shadowRoot;
    shadow?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(host()).toBeNull();
  });

  it("destroy() removes an open overlay", () => {
    const overlay = createHelpOverlay(document);
    overlay.toggle("system");
    expect(host()).toBeTruthy();
    overlay.destroy();
    expect(host()).toBeNull();
  });
});
