import { afterEach, describe, expect, it } from "vitest";
import { findMatchedSpec, isSpecpinOwned } from "../src/content/context-target.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isSpecpinOwned", () => {
  it("rejects an element inside a Specpin shadow host", () => {
    document.body.innerHTML = `<div id="specpin-tooltip-host"><button id="inner">x</button></div>`;
    const inner = document.getElementById("inner");
    if (!inner) throw new Error("fixture missing");
    expect(isSpecpinOwned(inner)).toBe(true);
  });

  it("rejects the host element itself (event retarget target)", () => {
    document.body.innerHTML = `<div id="specpin-sidebar-host"></div>`;
    const host = document.getElementById("specpin-sidebar-host");
    if (!host) throw new Error("fixture missing");
    expect(isSpecpinOwned(host)).toBe(true);
  });

  it("allows a plain page element", () => {
    document.body.innerHTML = `<main><button id="cta">Buy</button></main>`;
    const cta = document.getElementById("cta");
    if (!cta) throw new Error("fixture missing");
    expect(isSpecpinOwned(cta)).toBe(false);
  });
});

describe("findMatchedSpec", () => {
  it("returns the spec id + element when the start node itself matched", () => {
    document.body.innerHTML = `<button id="b">b</button>`;
    const b = document.getElementById("b");
    if (!b) throw new Error("fixture missing");
    expect(findMatchedSpec(b, new Map([["spec-1", b]]))).toEqual({ specId: "spec-1", el: b });
  });

  it("walks up to the nearest matched ancestor", () => {
    document.body.innerHTML = `<form id="f"><span id="label"><i id="icon"></i></span></form>`;
    const form = document.getElementById("f");
    const icon = document.getElementById("icon");
    if (!form || !icon) throw new Error("fixture missing");
    expect(findMatchedSpec(icon, new Map([["spec-f", form]]))).toEqual({
      specId: "spec-f",
      el: form,
    });
  });

  it("returns null when neither the element nor any ancestor matched", () => {
    document.body.innerHTML = `<div><button id="b">b</button></div>`;
    const b = document.getElementById("b");
    if (!b) throw new Error("fixture missing");
    expect(findMatchedSpec(b, new Map())).toBeNull();
  });

  it("returns null for a null start", () => {
    expect(findMatchedSpec(null, new Map())).toBeNull();
  });
});
