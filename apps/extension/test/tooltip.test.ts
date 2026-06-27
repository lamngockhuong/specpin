import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipRenderer } from "../src/renderers/tooltip.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-tooltip-host")?.remove();
});

function shadowOf(): ShadowRoot {
  return must(must(document.getElementById("specpin-tooltip-host")).shadowRoot);
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function mouse(target: Element | Window, type: string, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
}

function pin(): { tip: HTMLElement; badge: HTMLElement } {
  const badge = must(shadowOf().querySelector(".badge")) as HTMLElement;
  fire(badge, "click");
  return { tip: must(shadowOf().querySelector(".tip")) as HTMLElement, badge };
}

const spec: Spec = {
  id: "login",
  title: { en: "Login button" },
  description: { en: "submits the login form" },
  businessRules: [{ en: "Lock after 5 failures" }],
  tags: ["auth"],
  fingerprint: {
    cssSelector: "button",
    xpath: "",
    domPath: [],
    tagName: "button",
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
  },
};

describe("TooltipRenderer", () => {
  it("renders inside a Shadow DOM (style isolation)", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const target = must(document.querySelector("button"));
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, target, { confidence: 1, needsReview: false });

    const host = must(document.getElementById("specpin-tooltip-host"));
    expect(host).toBeTruthy();
    expect(host.shadowRoot).toBeTruthy();
    // Badge lives in the shadow root, not the light DOM.
    expect(must(host.shadowRoot).querySelector(".badge")).toBeTruthy();
    expect(document.querySelector(".badge")).toBeNull();
    renderer.destroy();
  });

  it("flags needsReview matches distinctly", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 0.7,
      needsReview: true,
    });
    const host = document.getElementById("specpin-tooltip-host");
    const badge = must(host?.shadowRoot?.querySelector(".badge")) as HTMLElement;
    expect(badge.dataset.review).toBe("true");
    renderer.destroy();
  });

  it("destroy() removes all rendered UI", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    renderer.destroy();
    expect(document.getElementById("specpin-tooltip-host")).toBeNull();
    expect(renderer.pinCount).toBe(0);
  });

  it("the tip carries an explicit width (not shrink-to-fit)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    // The .tip rule must declare an explicit width so the tip does not collapse
    // to shrink-to-fit inside the 0-width absolutely-positioned shadow host.
    const css = must(shadowOf().querySelector("style")).textContent ?? "";
    expect(css).toMatch(/\.tip\s*\{[^}]*width:\s*min\(360px, 90vw\)/);
    renderer.destroy();
  });

  it("clicking a badge pins the tip open through a subsequent mouseleave", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const badge = must(shadowOf().querySelector(".badge"));
    const tip = must(shadowOf().querySelector(".tip"));

    fire(badge, "click");
    expect(tip.classList.contains("show")).toBe(true);
    expect(tip.classList.contains("pinned")).toBe(true);

    fire(badge, "mouseleave");
    expect(tip.classList.contains("show")).toBe(true);
    renderer.destroy();
  });

  it("the pinned tip has a close control that clears the pin", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const badge = must(shadowOf().querySelector(".badge"));
    fire(badge, "click");
    const close = must(shadowOf().querySelector(".pin-close"));
    fire(close, "click");
    const tip = must(shadowOf().querySelector(".tip"));
    expect(tip.classList.contains("show")).toBe(false);
    renderer.destroy();
  });

  it("only one tip is pinned at a time (second badge moves the pin)", () => {
    document.body.innerHTML = `<button>a</button><span>b</span>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    renderer.render({ ...spec, id: "second" }, must(document.querySelector("span")));
    const [first, second] = [...shadowOf().querySelectorAll(".badge")];
    fire(must(first), "click");
    fire(must(second), "click");
    // Still pinned (to the second badge), exactly one tip element shown.
    const tip = must(shadowOf().querySelector(".tip"));
    expect(tip.classList.contains("show")).toBe(true);
    expect(shadowOf().querySelectorAll(".tip")).toHaveLength(1);
    renderer.destroy();
  });

  it("the pinned tip can be dragged by its title to a new position", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const { tip } = pin();
    const title = must(tip.querySelector("h4"));

    mouse(title, "mousedown", { clientX: 100, clientY: 100 });
    expect(tip.classList.contains("dragging")).toBe(true);
    mouse(window, "mousemove", { clientX: 180, clientY: 240 });
    mouse(window, "mouseup");

    expect(tip.classList.contains("dragging")).toBe(false);
    // rect.left is 0 in jsdom, so offset == mousedown coords; moved delta is 80/140.
    expect(tip.style.left).toBe("80px");
    expect(tip.style.top).toBe("140px");
    renderer.destroy();
  });

  it("a dragged tip stays put through scroll (no re-anchor to the badge)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const { tip } = pin();
    mouse(must(tip.querySelector("h4")), "mousedown", { clientX: 100, clientY: 100 });
    mouse(window, "mousemove", { clientX: 180, clientY: 240 });
    mouse(window, "mouseup");

    const left = tip.style.left;
    window.dispatchEvent(new Event("scroll"));
    expect(tip.style.left).toBe(left);
    renderer.destroy();
  });

  it("reopening a tip resets the dragged position back to the badge anchor", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const { tip, badge } = pin();
    mouse(must(tip.querySelector("h4")), "mousedown", { clientX: 100, clientY: 100 });
    mouse(window, "mousemove", { clientX: 180, clientY: 240 });
    mouse(window, "mouseup");
    expect(tip.style.left).toBe("80px");

    fire(must(shadowOf().querySelector(".pin-close")), "click");
    fire(badge, "click");
    // Re-anchored next to the badge (left clamped to the 8px gutter in jsdom).
    expect(tip.style.left).toBe("8px");
    renderer.destroy();
  });

  it("dragging only starts from the title, not the body text", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const { tip } = pin();
    mouse(must(tip.querySelector("p")), "mousedown", { clientX: 100, clientY: 100 });
    expect(tip.classList.contains("dragging")).toBe(false);
    renderer.destroy();
  });

  it("the pinned tip's open control invokes onOpenInPanel with the spec id", () => {
    document.body.innerHTML = `<button>x</button>`;
    const onOpenInPanel = vi.fn();
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
      onOpenInPanel,
    });
    fire(must(shadowOf().querySelector(".badge")), "click");
    fire(must(shadowOf().querySelector(".pin-open")), "click");
    expect(onOpenInPanel).toHaveBeenCalledWith("login");
    renderer.destroy();
  });
});
