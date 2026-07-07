import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../src/i18n/index.js";
import { type CoverageMarkerActions, CoverageOverlay } from "../src/renderers/coverage-overlay.js";

// Give the elements a real box so resolveBadgePosition has something to place.
function sized(el: Element, left = 10, top = 10, w = 40, h = 20): void {
  el.getBoundingClientRect = () =>
    ({
      width: w,
      height: h,
      left,
      top,
      right: left + w,
      bottom: top + h,
      x: left,
      y: top,
      toJSON() {},
    }) as DOMRect;
}

function host(): HTMLElement | null {
  return document.getElementById("specpin-coverage-host");
}

function markers(): NodeListOf<Element> {
  return (
    host()?.shadowRoot?.querySelectorAll(".cov-marker") ?? ([] as unknown as NodeListOf<Element>)
  );
}

let overlay: CoverageOverlay;
let actions: CoverageMarkerActions;

beforeEach(() => {
  initI18n("en");
  document.body.innerHTML = "";
  actions = { onCapture: vi.fn(), onIgnore: vi.fn() };
  overlay = new CoverageOverlay(document);
});

afterEach(() => {
  overlay.destroy();
});

describe("CoverageOverlay", () => {
  it("renders one positioned marker per gap", () => {
    document.body.innerHTML = `<button id="a">A</button><button id="b">B</button>`;
    const a = document.getElementById("a") as Element;
    const b = document.getElementById("b") as Element;
    sized(a, 10, 10);
    sized(b, 200, 10);
    overlay.render([a, b], { keyFor: () => "#k", actions });

    const ms = markers();
    expect(ms.length).toBe(2);
    for (const m of ms) {
      expect((m as HTMLElement).style.left).not.toBe("");
      expect((m as HTMLElement).style.top).not.toBe("");
    }
  });

  it("wires Capture to onCapture", () => {
    document.body.innerHTML = `<button id="a">A</button>`;
    const a = document.getElementById("a") as Element;
    sized(a);
    overlay.render([a], { keyFor: () => "#a", actions });
    (host()?.shadowRoot?.querySelector(".cov-capture") as HTMLButtonElement).click();
    expect(actions.onCapture).toHaveBeenCalledWith(a);
  });

  it("offers Ignore only when the element has a stable key", () => {
    document.body.innerHTML = `<button id="a">A</button><button id="b">B</button>`;
    const a = document.getElementById("a") as Element;
    const b = document.getElementById("b") as Element;
    sized(a, 10, 10);
    sized(b, 200, 10);
    // a → stable key, b → null (no ignore control)
    overlay.render([a, b], { keyFor: (el) => (el === a ? "#a" : null), actions });

    const ms = markers();
    expect(ms[0].querySelector(".cov-ignore")).not.toBeNull();
    expect(ms[1].querySelector(".cov-ignore")).toBeNull();

    (ms[0].querySelector(".cov-ignore") as HTMLButtonElement).click();
    expect(actions.onIgnore).toHaveBeenCalledWith(a, "#a");
  });

  it("destroy() removes the host", () => {
    document.body.innerHTML = `<button id="a">A</button>`;
    const a = document.getElementById("a") as Element;
    sized(a);
    overlay.render([a], { keyFor: () => "#a", actions });
    expect(host()).not.toBeNull();
    overlay.destroy();
    expect(host()).toBeNull();
  });

  it("keeps an edge element's marker on the page (does not clip off-screen)", () => {
    document.body.innerHTML = `<button id="a">A</button>`;
    const a = document.getElementById("a") as Element;
    // Element flush at the document's top-left origin.
    sized(a, 0, 0, 40, 20);
    overlay.render([a], { keyFor: () => "#a", actions });
    // Marker is placed on the page (a visible corner), not clipped off the origin.
    const m = markers()[0] as HTMLElement;
    expect(Number.parseFloat(m.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(m.style.top)).toBeGreaterThanOrEqual(0);
  });

  it("reposition() repaints without a re-scan", () => {
    document.body.innerHTML = `<button id="a">A</button>`;
    const a = document.getElementById("a") as Element;
    sized(a, 10, 10);
    overlay.render([a], { keyFor: () => "#a", actions });
    sized(a, 300, 300);
    overlay.reposition();
    expect(markers().length).toBe(1);
  });
});
