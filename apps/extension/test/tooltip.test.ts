import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipRenderer } from "../src/renderers/tooltip.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const spec: Spec = {
  id: "login",
  title: "Login button",
  description: "submits the login form",
  businessRules: ["Lock after 5 failures"],
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
});
