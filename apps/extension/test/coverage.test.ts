import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SCAN_CAP,
  findGaps,
  isInteractiveCandidate,
  isVisibleEnabled,
  stableGapKey,
} from "../src/content/coverage.js";

// happy-dom reports a 0x0 box for every element, so give the elements under test a
// real layout size where isVisibleEnabled's rect check would otherwise fire.
function sized(el: Element, w = 24, h = 16): Element {
  el.getBoundingClientRect = () =>
    ({
      width: w,
      height: h,
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  return el;
}

function mount(html: string): void {
  document.body.innerHTML = html;
  for (const el of document.body.querySelectorAll("*")) sized(el);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isInteractiveCandidate", () => {
  it("accepts native controls and links with href", () => {
    mount(
      `<button id="b">x</button><a id="a" href="/x">l</a><input id="i"><select id="s"></select><textarea id="t"></textarea>`,
    );
    for (const id of ["b", "a", "i", "s", "t"]) {
      expect(isInteractiveCandidate(document.getElementById(id) as Element)).toBe(true);
    }
  });

  it("rejects a plain div/span and a bare anchor with no href", () => {
    mount(`<div id="d">x</div><span id="p">y</span><a id="a">no href</a>`);
    expect(isInteractiveCandidate(document.getElementById("d") as Element)).toBe(false);
    expect(isInteractiveCandidate(document.getElementById("p") as Element)).toBe(false);
    expect(isInteractiveCandidate(document.getElementById("a") as Element)).toBe(false);
  });

  it("rejects a hidden input", () => {
    mount(`<input id="h" type="hidden">`);
    expect(isInteractiveCandidate(document.getElementById("h") as Element)).toBe(false);
  });

  it("accepts widget roles, onclick, tabindex>=0, contenteditable", () => {
    mount(
      `<div id="r" role="button"></div><div id="o" onclick="void 0"></div><div id="tb" tabindex="0"></div><div id="ce" contenteditable="true"></div>`,
    );
    expect(isInteractiveCandidate(document.getElementById("r") as Element)).toBe(true);
    expect(isInteractiveCandidate(document.getElementById("o") as Element)).toBe(true);
    expect(isInteractiveCandidate(document.getElementById("tb") as Element)).toBe(true);
    expect(isInteractiveCandidate(document.getElementById("ce") as Element)).toBe(true);
  });

  it("rejects a non-interactive role and a negative tabindex", () => {
    mount(`<div id="h" role="heading"></div><div id="n" tabindex="-1"></div>`);
    expect(isInteractiveCandidate(document.getElementById("h") as Element)).toBe(false);
    expect(isInteractiveCandidate(document.getElementById("n") as Element)).toBe(false);
  });
});

describe("isVisibleEnabled", () => {
  it("accepts a plain sized enabled control", () => {
    mount(`<button id="b">x</button>`);
    expect(isVisibleEnabled(document.getElementById("b") as Element)).toBe(true);
  });

  it("rejects disabled and aria-disabled", () => {
    mount(`<button id="d" disabled>x</button><button id="a" aria-disabled="true">y</button>`);
    expect(isVisibleEnabled(document.getElementById("d") as Element)).toBe(false);
    expect(isVisibleEnabled(document.getElementById("a") as Element)).toBe(false);
  });

  it("rejects the hidden attribute", () => {
    mount(`<button id="h" hidden>x</button>`);
    expect(isVisibleEnabled(document.getElementById("h") as Element)).toBe(false);
  });

  it("rejects a zero-size box (display:none in a real browser)", () => {
    document.body.innerHTML = `<button id="z">x</button>`;
    const el = document.getElementById("z") as Element;
    sized(el, 0, 0);
    expect(isVisibleEnabled(el)).toBe(false);
  });

  it("rejects opacity:0 (custom file input behind a styled button)", () => {
    mount(`<input id="o" type="file" style="opacity:0">`);
    expect(isVisibleEnabled(document.getElementById("o") as Element)).toBe(false);
  });

  it("rejects an sr-only clip-path: inset(50%)", () => {
    mount(`<input id="cp" style="clip-path:inset(50%)">`);
    expect(isVisibleEnabled(document.getElementById("cp") as Element)).toBe(false);
  });

  it("rejects the legacy sr-only clip: rect(0 0 0 0)", () => {
    document.body.innerHTML = `<input id="c">`;
    const el = sized(document.getElementById("c") as Element);
    // happy-dom does not compute the deprecated `clip` property, so stub the
    // computed style to the canonical sr-only shape for this element.
    const orig = window.getComputedStyle;
    window.getComputedStyle = ((target: Element) =>
      target === el
        ? ({
            display: "",
            visibility: "",
            opacity: "1",
            clip: "rect(0px, 0px, 0px, 0px)",
            clipPath: "none",
          } as CSSStyleDeclaration)
        : orig(target as Element)) as typeof window.getComputedStyle;
    try {
      expect(isVisibleEnabled(el)).toBe(false);
    } finally {
      window.getComputedStyle = orig;
    }
  });

  it("rejects a ~1px sr-only box", () => {
    document.body.innerHTML = `<input id="p">`;
    const el = document.getElementById("p") as Element;
    sized(el, 1, 1);
    expect(isVisibleEnabled(el)).toBe(false);
  });

  it("rejects an element positioned off the top-left (left:-9999px)", () => {
    document.body.innerHTML = `<button id="off">x</button>`;
    const el = document.getElementById("off") as Element;
    // Off-screen positioning: negative even after adding the (zero) scroll offset.
    el.getBoundingClientRect = () =>
      ({
        width: 24,
        height: 16,
        left: -9999,
        top: 0,
        right: -9975,
        bottom: 16,
        x: -9999,
        y: 0,
        toJSON() {},
      }) as DOMRect;
    expect(isVisibleEnabled(el)).toBe(false);
  });

  it("still accepts a real control scrolled above the viewport (not off-screen)", () => {
    document.body.innerHTML = `<button id="scr">x</button>`;
    const el = document.getElementById("scr") as Element;
    const prev = window.scrollY;
    // Page scrolled 400px down: a control near the top has a negative viewport rect
    // (bottom < 0) but a positive DOCUMENT position, so it must remain a gap.
    (window as unknown as { scrollY: number }).scrollY = 400;
    el.getBoundingClientRect = () =>
      ({
        width: 24,
        height: 16,
        left: 10,
        top: -300,
        right: 34,
        bottom: -284,
        x: 10,
        y: -300,
        toJSON() {},
      }) as DOMRect;
    try {
      expect(isVisibleEnabled(el)).toBe(true);
    } finally {
      (window as unknown as { scrollY: number }).scrollY = prev;
    }
  });

  it("still accepts a normal on-screen control (no over-hiding)", () => {
    mount(`<button id="ok" style="opacity:1">x</button>`);
    expect(isVisibleEnabled(document.getElementById("ok") as Element)).toBe(true);
  });
});

describe("stableGapKey", () => {
  it("prefers a test-id attribute", () => {
    mount(`<button data-spec-id="save-btn">Save</button>`);
    expect(stableGapKey(document.querySelector("button") as Element)).toBe("data-spec-id=save-btn");
  });

  it("falls back to a non-generated id", () => {
    mount(`<button id="checkout">Go</button>`);
    expect(stableGapKey(document.getElementById("checkout") as Element)).toBe("#checkout");
  });

  it("uses a uniquely-resolving css selector when no anchor exists", () => {
    mount(`<nav class="topbar"><button class="cta">Go</button></nav>`);
    const key = stableGapKey(document.querySelector("button.cta") as Element);
    expect(key).not.toBeNull();
    expect(key?.startsWith("css:")).toBe(true);
  });

  it("returns null when nothing stable identifies the element", () => {
    // A detached, anchor-less element: no test-id, no stable id, and no selector
    // resolves back to it in the document tree, so there is no durable ignore key.
    document.body.innerHTML = "";
    const orphan = document.createElement("button");
    expect(stableGapKey(orphan)).toBeNull();
  });
});

describe("findGaps", () => {
  it("returns interactive elements minus matched minus ignored", () => {
    mount(
      `<button id="a">A</button><button id="b">B</button><button id="c">C</button><div id="x">not interactive</div>`,
    );
    const a = document.getElementById("a") as Element;
    const c = document.getElementById("c") as Element;
    const matched = new Set<Element>([a]);
    const ignore = new Set<string>(["#b"]);
    const scan = findGaps(document, matched, ignore);
    expect(scan.gaps).toEqual([c]);
    expect(scan.interactive).toBe(3);
    expect(scan.documented).toBe(1);
    expect(scan.truncated).toBe(false);
  });

  it("caps the scan and flags truncation", () => {
    const buttons = Array.from({ length: 5 }, (_, i) => `<button id="k${i}">${i}</button>`).join(
      "",
    );
    mount(buttons);
    const scan = findGaps(document, new Set(), new Set(), 3);
    expect(scan.truncated).toBe(true);
    expect(scan.considered).toBe(5);
    expect(scan.gaps.length).toBeLessThanOrEqual(3);
  });

  it("has a sane default cap", () => {
    expect(DEFAULT_SCAN_CAP).toBeGreaterThan(0);
  });
});
