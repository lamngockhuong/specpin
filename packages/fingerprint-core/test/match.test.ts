import type { ElementFingerprint } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { anchorStrength } from "../src/anchor-strength.js";
import { matchElement } from "../src/match.js";

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

describe("matchElement ambiguity resolver (scored)", () => {
  it("resolves an ambiguous selector by scoring the hit set", () => {
    document.body.innerHTML = `
      <ul>
        <li><button class="row">Archive</button></li>
        <li><button class="row">Rename</button></li>
        <li><button class="row">Delete account permanently</button></li>
      </ul>`;
    const r = matchElement(
      baseFp({ cssSelector: "button.row", textContent: "Delete account permanently" }),
      document,
    );
    expect(r.strategy).toBe("scored");
    expect(r.el?.textContent).toBe("Delete account permanently");
    expect(r.anchor).toBe("css");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("leaves a tied ambiguous selector for review without guessing", () => {
    document.body.innerHTML = `<button class="row">Save</button><button class="row">Save</button>`;
    const r = matchElement(baseFp({ cssSelector: "button.row", textContent: "Save" }), document);
    expect(r.el).toBeNull();
    expect(r.strategy).toBe("none");
    expect(r.needsReview).toBe(true);
  });

  it("renders a below-MID css-ambiguity winner (no MID floor on this path)", () => {
    // Intentional asymmetry vs the true-orphan path: a surviving selector is a
    // strong prior — its hits ARE what the author targeted — so the best hit
    // renders (as needsReview) even below the 0.6 MID floor, as long as it clears
    // the δ margin. The δ guard still blocks guessing between near-ties.
    document.body.innerHTML = `
      <div><span></span><span></span><button class="row">alpha</button></div>
      <div><button class="row">zzz</button></div>`;
    const r = matchElement(
      baseFp({
        cssSelector: "button.row",
        textContent: "alpha beta gamma",
        domPath: ["main", "section", "article", "button"],
        positionHint: { index: 9, siblingCount: 10 },
      }),
      document,
    );
    expect(r.strategy).toBe("scored");
    expect(r.el?.textContent).toBe("alpha");
    expect(r.confidence).toBeLessThan(0.6); // below MID, yet still rendered
    expect(r.needsReview).toBe(true);
  });

  it("flags a resolved-but-weak scored match as needsReview", () => {
    // Two rows; text distinguishes the winner, but overall score stays below HIGH.
    document.body.innerHTML = `
      <div><span></span><span></span><button class="row">alpha</button></div>
      <div><button class="row">beta gamma delta</button></div>`;
    const r = matchElement(
      baseFp({
        cssSelector: "button.row",
        textContent: "beta gamma delta",
        positionHint: { index: 9, siblingCount: 10 },
        domPath: ["main", "section", "article", "button"],
      }),
      document,
    );
    expect(r.strategy).toBe("scored");
    expect(r.confidence).toBeLessThan(0.85);
    expect(r.needsReview).toBe(true);
  });
});

describe("matchElement full scorer (true orphans)", () => {
  it("recovers a class-hash drift (selector breaks, content/tag/position hold)", () => {
    // Captured selector no longer matches (hashed class changed) but text + attrs remain.
    document.body.innerHTML = `<form><button type="submit">Sign in</button></form>`;
    const r = matchElement(
      baseFp({
        cssSelector: "button.css-9f8e7d",
        textContent: "Sign in",
        tagName: "button",
        attributes: { type: "submit" },
        domPath: ["form", "button"],
        positionHint: { index: 0, siblingCount: 1 },
      }),
      document,
    );
    expect(r.strategy).toBe("scored");
    expect(r.el).toBe(document.querySelector("button"));
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    expect(r.needsReview).toBe(false);
    expect(r.signals?.textContent).toBe(1);
  });

  it("recovers a wrapper-added drift (domPath deepens)", () => {
    document.body.innerHTML = `<main><div class="wrap"><button type="submit">Continue</button></div></main>`;
    const r = matchElement(
      baseFp({
        cssSelector: "main > button", // child combinator no longer holds after the wrap
        textContent: "Continue",
        tagName: "button",
        attributes: { type: "submit" },
        domPath: ["main", "button"],
        positionHint: { index: 0, siblingCount: 1 },
      }),
      document,
    );
    expect(r.strategy).toBe("scored");
    expect(r.el).toBe(document.querySelector("button"));
  });

  it("returns no-match when the best candidate is below threshold (no false positive)", () => {
    document.body.innerHTML = `<button type="button">Home</button>`;
    const r = matchElement(
      baseFp({
        cssSelector: "button.gone",
        textContent: "Delete my account permanently",
        tagName: "button",
        attributes: { type: "submit" },
      }),
      document,
    );
    expect(r.el).toBeNull();
    expect(r.strategy).toBe("none");
    expect(r.needsReview).toBe(true);
  });

  it("returns no-match on a top-2 tie among candidates (margin guard)", () => {
    document.body.innerHTML = `<button type="submit">Submit form</button><button type="submit">Submit form</button>`;
    const r = matchElement(
      baseFp({
        cssSelector: "button.gone",
        textContent: "Submit form",
        tagName: "button",
        attributes: { type: "submit" },
      }),
      document,
    );
    expect(r.el).toBeNull();
    expect(r.strategy).toBe("none");
  });

  it("never overrides an exact anchor with a scored candidate", () => {
    document.body.innerHTML = `<button data-testid="real" type="submit">Save</button>`;
    const r = matchElement(
      baseFp({ testId: "real", cssSelector: "button.other", textContent: "Save" }),
      document,
    );
    expect(r.strategy).toBe("exact");
    expect(r.confidence).toBe(1.0);
  });

  it("skips the candidate scan for a structure-only fingerprint", () => {
    document.body.innerHTML = `<button>a</button><button>b</button>`;
    const r = matchElement(
      baseFp({ cssSelector: "button.gone", tagName: "button" }), // no content signal
      document,
    );
    expect(r.strategy).toBe("none");
    expect(r.el).toBeNull();
  });
});

describe("matchElement no match", () => {
  it("returns needsReview when nothing matches", () => {
    document.body.innerHTML = `<div>nothing here</div>`;
    const r = matchElement(baseFp({ cssSelector: "button.absent" }), document);
    expect(r).toEqual({
      el: null,
      confidence: 0,
      strategy: "none",
      needsReview: true,
      anchor: null,
    });
  });

  it("tolerates a malformed cssSelector", () => {
    document.body.innerHTML = `<div></div>`;
    const r = matchElement(baseFp({ cssSelector: "::::bad((" }), document);
    expect(r.strategy).toBe("none");
  });
});

describe("matchElement anchor reporting", () => {
  it("reports the testId anchor for a test-id match", () => {
    document.body.innerHTML = `<button data-testid="login">Login</button>`;
    expect(matchElement(baseFp({ testId: "login" }), document).anchor).toBe("testId");
  });

  it("reports the aria anchor for an aria-label match", () => {
    document.body.innerHTML = `<button aria-label="Close">x</button>`;
    expect(matchElement(baseFp({ ariaLabel: "Close" }), document).anchor).toBe("aria");
  });

  it("reports the id anchor for a non-generated id match", () => {
    document.body.innerHTML = `<button id="save-btn">Save</button>`;
    expect(matchElement(baseFp({ id: "save-btn" }), document).anchor).toBe("id");
  });

  it("reports the css anchor for a selector-only match", () => {
    document.body.innerHTML = `<form class="login"><button type="submit">Login</button></form>`;
    expect(
      matchElement(baseFp({ cssSelector: "form.login button[type=submit]" }), document).anchor,
    ).toBe("css");
  });

  it("reports a null anchor when nothing matches", () => {
    document.body.innerHTML = `<div>nothing</div>`;
    expect(matchElement(baseFp({ cssSelector: "button.absent" }), document).anchor).toBeNull();
  });
});

describe("anchorStrength", () => {
  it("classifies a test-id fingerprint as strong", () => {
    expect(anchorStrength(baseFp({ testId: "login" }))).toBe("strong");
  });

  it("classifies an aria-only fingerprint as medium", () => {
    expect(anchorStrength(baseFp({ ariaLabel: "Close dialog" }))).toBe("medium");
  });

  it("classifies a non-generated-id fingerprint as medium", () => {
    expect(anchorStrength(baseFp({ id: "save-btn" }))).toBe("medium");
  });

  it("classifies a generated-id-only fingerprint as weak", () => {
    // A generated id is not a stable anchor, so it does not lift the tier.
    expect(anchorStrength(baseFp({ id: ":r1:" }))).toBe("weak");
  });

  it("classifies a css/xpath-only fingerprint as weak", () => {
    expect(anchorStrength(baseFp({ cssSelector: "form.login button", xpath: "//button" }))).toBe(
      "weak",
    );
  });
});
