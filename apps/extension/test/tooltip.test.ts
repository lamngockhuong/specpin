import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipRenderer } from "../src/renderers/tooltip.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-tooltip-host")?.remove();
  document.getElementById("specpin-reveal-host")?.remove();
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

  it("the pinned tip is height-capped, scrollable, and natively resizable", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const css = must(shadowOf().querySelector("style")).textContent ?? "";
    const pinnedRule = css.match(/\.tip\.pinned\s*\{[^}]*\}/)?.[0] ?? "";
    expect(pinnedRule).toMatch(/max-height:\s*min\(70vh, 640px\)/);
    expect(pinnedRule).toMatch(/overflow:\s*auto/);
    expect(pinnedRule).toMatch(/resize:\s*both/);
    renderer.destroy();
  });

  it("re-pinning resets an inline resize back to the default size (ephemeral per pin)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const { tip, badge } = pin();
    // Simulate the user dragging the native resize grip (writes inline size).
    tip.style.height = "500px";

    fire(must(shadowOf().querySelector(".pin-close")), "click");
    fire(badge, "click");
    // showTip clears the inline height on each open. (The width is reset to
    // "min(360px, 90vw)" too, but happy-dom drops that value from inline style,
    // so only the height reset is observable here; both run in a real browser.)
    expect(tip.style.height).toBe("");
    renderer.destroy();
  });

  it("dragging only starts from the title, not the body text", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")));
    const { tip } = pin();
    mouse(must(tip.querySelector(".d")), "mousedown", { clientX: 100, clientY: 100 });
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

  it("renders a delete control when editable + onDelete and invokes it with the spec id", () => {
    document.body.innerHTML = `<button>x</button>`;
    const onDelete = vi.fn();
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
      editable: true,
      onDelete,
    });
    fire(must(shadowOf().querySelector(".badge")), "click");
    const del = must(shadowOf().querySelector(".pin-delete"));
    fire(del, "click");
    expect(onDelete).toHaveBeenCalledWith("login");
    renderer.destroy();
  });

  it("hides the delete control for a read-only (non-editable) spec", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
      editable: false,
      onDelete: vi.fn(),
    });
    fire(must(shadowOf().querySelector(".badge")), "click");
    expect(shadowOf().querySelector(".pin-delete")).toBeNull();
    renderer.destroy();
  });

  it("revealSpec pins the matching spec's tip and returns true", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
    });
    const tip = must(shadowOf().querySelector(".tip")) as HTMLElement;
    expect(tip.classList.contains("show")).toBe(false);

    expect(renderer.revealSpec("login")).toBe(true);
    expect(tip.classList.contains("show")).toBe(true);
    expect(tip.classList.contains("pinned")).toBe(true);
    expect(must(tip.querySelector("h4")).textContent).toBe("Login button");
    renderer.destroy();
  });

  it("revealSpec returns false for an unknown spec id", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
    });
    expect(renderer.revealSpec("nope")).toBe(false);
    renderer.destroy();
  });

  it("uses a custom host id so an on-demand instance does not clash", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const renderer = new TooltipRenderer(document, "specpin-reveal-host");
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
    });
    expect(document.getElementById("specpin-reveal-host")).not.toBeNull();
    expect(document.getElementById("specpin-tooltip-host")).toBeNull();
    renderer.destroy();
    expect(document.getElementById("specpin-reveal-host")).toBeNull();
  });

  it("with showBadges=false renders no badge but revealSpec still shows the tip", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const renderer = new TooltipRenderer(document, "specpin-reveal-host", false);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
    });
    const shadow = must(must(document.getElementById("specpin-reveal-host")).shadowRoot);
    // No "S" badge stamped on the page.
    expect(shadow.querySelector(".badge")).toBeNull();
    const tip = must(shadow.querySelector(".tip")) as HTMLElement;
    expect(tip.classList.contains("show")).toBe(false);

    expect(renderer.revealSpec("login")).toBe(true);
    expect(tip.classList.contains("show")).toBe(true);
    expect(tip.classList.contains("pinned")).toBe(true);
    expect(must(tip.querySelector("h4")).textContent).toBe("Login button");
    renderer.destroy();
  });

  it("a second badge dodges the first when their corners would overlap", () => {
    document.body.innerHTML = `<button>a</button><span>b</span>`;
    const button = must(document.querySelector("button")) as HTMLElement;
    const span = must(document.querySelector("span")) as HTMLElement;
    // jsdom returns a zero rect for everything; stub two overlapping targets so
    // the solver has real corners to work with.
    const rect = (r: Partial<DOMRect>) => () =>
      ({ left: 0, top: 0, right: 0, bottom: 0, ...r }) as DOMRect;
    button.getBoundingClientRect = rect({ left: 100, top: 100, right: 200, bottom: 140 });
    span.getBoundingClientRect = rect({ left: 100, top: 100, right: 200, bottom: 140 });

    const renderer = new TooltipRenderer(document);
    renderer.render(spec, button);
    renderer.render({ ...spec, id: "second" }, span);
    const [first, second] = [...shadowOf().querySelectorAll(".badge")] as HTMLElement[];
    // Same target rect, but the second badge must not stamp the exact same spot.
    expect(second.style.left !== first.style.left || second.style.top !== first.style.top).toBe(
      true,
    );
    renderer.destroy();
  });

  it("shows the ordinal instead of 'S' when one is assigned (numbering on)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
      ordinal: 4,
    });
    const badge = must(shadowOf().querySelector(".badge")) as HTMLElement;
    expect(badge.textContent).toBe("4");
    // Single digit keeps the circle (no pill widening).
    expect(badge.classList.contains("wide")).toBe(false);
    renderer.destroy();
  });

  it("keeps 'S' when no ordinal is assigned (numbering off)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
    });
    expect(must(shadowOf().querySelector(".badge")).textContent).toBe("S");
    renderer.destroy();
  });

  it("widens a 2+ digit ordinal to a pill (wide modifier)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
      ordinal: 12,
    });
    const badge = must(shadowOf().querySelector(".badge")) as HTMLElement;
    expect(badge.textContent).toBe("12");
    expect(badge.classList.contains("wide")).toBe(true);
    // The pill rule exists in the stylesheet.
    const css = must(shadowOf().querySelector("style")).textContent ?? "";
    expect(css).toMatch(/\.badge\.wide\s*\{[^}]*border-radius/);
    renderer.destroy();
  });

  it("a needsReview badge still carries its number and stays flagged yellow", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 0.7,
      needsReview: true,
      ordinal: 3,
    });
    const badge = must(shadowOf().querySelector(".badge")) as HTMLElement;
    expect(badge.textContent).toBe("3");
    expect(badge.dataset.review).toBe("true");
    renderer.destroy();
  });

  it("paints a custom badge color with an auto-contrasted glyph", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    // A dark pick -> white glyph.
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
      badgeColor: "#1E3A8A",
    });
    const host = must(document.getElementById("specpin-tooltip-host"));
    expect(host.style.getPropertyValue("--sp-badge-bg")).toBe("#1E3A8A");
    expect(host.style.getPropertyValue("--sp-badge-fg")).toBe("#FFFFFF");
    renderer.destroy();
  });

  it("leaves the default teal (no custom properties) when no color is set", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 1,
      needsReview: false,
    });
    const host = must(document.getElementById("specpin-tooltip-host"));
    expect(host.style.getPropertyValue("--sp-badge-bg")).toBe("");
    expect(host.style.getPropertyValue("--sp-badge-fg")).toBe("");
    // The badge CSS falls back to the brand accent token.
    const css = must(shadowOf().querySelector("style")).textContent ?? "";
    expect(css).toMatch(/background:\s*var\(--sp-badge-bg,\s*var\(--sp-accent\)\)/);
    renderer.destroy();
  });

  it("ignores a tampered color and clears it on a later reset (persisted host)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    const target = must(document.querySelector("button"));
    // First a valid color, then a reset to null on the SAME (reused) host.
    renderer.render(spec, target, { confidence: 1, needsReview: false, badgeColor: "#123456" });
    const host = must(document.getElementById("specpin-tooltip-host"));
    expect(host.style.getPropertyValue("--sp-badge-bg")).toBe("#123456");
    renderer.render(spec, target, { confidence: 1, needsReview: false, badgeColor: null });
    expect(host.style.getPropertyValue("--sp-badge-bg")).toBe("");
    // A tampered value never reaches the property.
    renderer.render(spec, target, {
      confidence: 1,
      needsReview: false,
      badgeColor: "url(evil)" as unknown as string,
    });
    expect(host.style.getPropertyValue("--sp-badge-bg")).toBe("");
    renderer.destroy();
  });

  it("keeps the needsReview yellow rule independent of a custom color", () => {
    document.body.innerHTML = `<button>x</button>`;
    const renderer = new TooltipRenderer(document);
    renderer.render(spec, must(document.querySelector("button")), {
      confidence: 0.7,
      needsReview: true,
      badgeColor: "#123456",
    });
    const badge = must(shadowOf().querySelector(".badge")) as HTMLElement;
    expect(badge.dataset.review).toBe("true");
    // The review rule hard-codes the warning token; it does not read --sp-badge-bg.
    const css = must(shadowOf().querySelector("style")).textContent ?? "";
    expect(css).toMatch(/\.badge\[data-review="true"\]\s*\{[^}]*--sp-warning-border/);
    renderer.destroy();
  });

  it("renders the Markdown subset in description and rules", () => {
    document.body.innerHTML = `<button>x</button>`;
    const md: Spec = {
      ...spec,
      description: { en: "Submits the **login** form\n\n- step one\n- step two" },
      businessRules: [{ en: "See [docs](https://x.com)" }],
    };
    const renderer = new TooltipRenderer(document);
    renderer.render(md, must(document.querySelector("button")));
    const { tip } = pin();
    expect(must(tip.querySelector(".d strong")).textContent).toBe("login");
    expect(tip.querySelectorAll(".d ul li")).toHaveLength(2);
    const link = must(tip.querySelector("a")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://x.com");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    renderer.destroy();
  });

  it("renders XSS-laden spec text inert (no live tags)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const evil: Spec = {
      ...spec,
      description: { en: "<img src=x onerror=alert(1)>" },
      businessRules: [{ en: "[x](javascript:alert(1))" }],
    };
    const renderer = new TooltipRenderer(document);
    renderer.render(evil, must(document.querySelector("button")));
    const { tip } = pin();
    expect(tip.querySelector("img")).toBeNull();
    // No anchor carries a javascript: scheme.
    expect(
      [...tip.querySelectorAll("a")].some((a) => /javascript:/i.test(a.getAttribute("href") ?? "")),
    ).toBe(false);
    expect(must(tip.querySelector(".d")).textContent).toContain("<img");
    renderer.destroy();
  });
});
