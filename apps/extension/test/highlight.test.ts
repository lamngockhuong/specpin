import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { highlightElement } from "../src/content/highlight.js";

function host(): HTMLElement | null {
  return document.getElementById("specpin-highlight-host");
}

// Fake timers keep the rAF tracking loop and the auto-dismiss timeout from
// running into the next test; the only synchronous work is the first reposition.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  host()?.remove();
  document.body.innerHTML = "";
});

describe("highlightElement", () => {
  it("scrolls to the element and frames it with an overlay outline", () => {
    const el = document.createElement("button");
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    highlightElement(el, document);

    expect(el.scrollIntoView).toHaveBeenCalled();
    const box = host()?.shadowRoot?.querySelector<HTMLElement>(".box");
    expect(box).toBeTruthy();
    // The box is positioned from the element's rect (fixed coords), not left blank.
    expect(box?.style.left).not.toBe("");
    expect(box?.style.width).not.toBe("");
  });

  it("a second call replaces the overlay instead of stacking hosts", () => {
    const el = document.createElement("button");
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    highlightElement(el, document);
    highlightElement(el, document);

    expect(document.querySelectorAll("#specpin-highlight-host")).toHaveLength(1);
  });

  it("auto-dismisses: the host is gone after the highlight lifetime elapses", () => {
    const el = document.createElement("button");
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    highlightElement(el, document);
    expect(host()).not.toBeNull();

    vi.advanceTimersByTime(2000);
    expect(host()).toBeNull();
  });
});
