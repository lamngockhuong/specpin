import { afterEach, describe, expect, it } from "vitest";
import { matchElement } from "../src/match.js";
import type { ElementFingerprint } from "@specpin/spec-schema";

afterEach(() => {
  document.body.innerHTML = "";
});

function baseFp(overrides: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector: "",
    xpath: "",
    domPath: [],
    tagName: "button",
    textContent: null,
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
    ...overrides,
  };
}

describe("matchElement exact anchors", () => {
  it("matches by testId across test-id attributes (confidence 1.0)", () => {
    document.body.innerHTML = `<button data-testid="login-submit">Login</button>`;
    const r = matchElement(baseFp({ testId: "login-submit" }), document);
    expect(r.strategy).toBe("exact");
    expect(r.confidence).toBe(1.0);
    expect(r.el).toBe(document.querySelector("button"));
    expect(r.needsReview).toBe(false);
  });

  it("matches by data-spec-id", () => {
    document.body.innerHTML = `<button data-spec-id="checkout">Buy</button>`;
    expect(matchElement(baseFp({ testId: "checkout" }), document).strategy).toBe("exact");
  });

  it("matches by aria-label", () => {
    document.body.innerHTML = `<button aria-label="Close dialog">x</button>`;
    expect(matchElement(baseFp({ ariaLabel: "Close dialog" }), document).confidence).toBe(1.0);
  });

  it("matches by non-generated id", () => {
    document.body.innerHTML = `<button id="save-btn">Save</button>`;
    expect(matchElement(baseFp({ id: "save-btn" }), document).strategy).toBe("exact");
  });

  it("ignores an auto-generated id anchor", () => {
    document.body.innerHTML = `<button id=":r1:">x</button>`;
    // Generated id must not anchor; no other signal -> no match.
    const r = matchElement(baseFp({ id: ":r1:" }), document);
    expect(r.strategy).toBe("none");
    expect(r.needsReview).toBe(true);
  });
});

describe("matchElement cssSelector fallback", () => {
  it("resolves a unique cssSelector (confidence 0.7)", () => {
    document.body.innerHTML = `<form class="login"><button type="submit">Login</button></form>`;
    const r = matchElement(baseFp({ cssSelector: "form.login button[type=submit]" }), document);
    expect(r.strategy).toBe("css");
    expect(r.confidence).toBe(0.7);
    expect(r.el).toBe(document.querySelector("button"));
  });

  it("flags an ambiguous cssSelector for review without choosing", () => {
    document.body.innerHTML = `<button class="x">a</button><button class="x">b</button>`;
    const r = matchElement(baseFp({ cssSelector: "button.x" }), document);
    expect(r.el).toBeNull();
    expect(r.strategy).toBe("none");
    expect(r.needsReview).toBe(true);
  });

  it("prefers an exact anchor over the cssSelector", () => {
    document.body.innerHTML = `<button data-testid="real" class="x">a</button><button class="x">b</button>`;
    const r = matchElement(baseFp({ testId: "real", cssSelector: "button.x" }), document);
    expect(r.strategy).toBe("exact");
    expect(r.el).toBe(document.querySelector(`[data-testid="real"]`));
  });
});

describe("matchElement no match", () => {
  it("returns needsReview when nothing matches", () => {
    document.body.innerHTML = `<div>nothing here</div>`;
    const r = matchElement(baseFp({ cssSelector: "button.absent" }), document);
    expect(r).toEqual({ el: null, confidence: 0, strategy: "none", needsReview: true });
  });

  it("tolerates a malformed cssSelector", () => {
    document.body.innerHTML = `<div></div>`;
    const r = matchElement(baseFp({ cssSelector: "::::bad((" }), document);
    expect(r.strategy).toBe("none");
  });
});
