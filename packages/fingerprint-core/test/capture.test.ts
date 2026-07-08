import { afterEach, describe, expect, it } from "vitest";
import { captureFingerprint } from "../src/capture.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe("captureFingerprint", () => {
  it("prefers data-spec-id over other test-id attributes", () => {
    const el = mount(`<button data-spec-id="login" data-testid="other">Go</button>`);
    expect(captureFingerprint(el).testId).toBe("login");
  });

  it("falls back to data-testid / data-cy / data-qa", () => {
    expect(captureFingerprint(mount(`<button data-testid="t">x</button>`)).testId).toBe("t");
    expect(captureFingerprint(mount(`<button data-cy="c">x</button>`)).testId).toBe("c");
    expect(captureFingerprint(mount(`<button data-qa="q">x</button>`)).testId).toBe("q");
  });

  it("captures aria-label and drops auto-generated ids", () => {
    const el = mount(`<button id=":r1:" aria-label="Submit form">x</button>`);
    const fp = captureFingerprint(el);
    expect(fp.ariaLabel).toBe("Submit form");
    expect(fp.id).toBeNull();
  });

  it("keeps a human-authored id", () => {
    expect(captureFingerprint(mount(`<button id="login-btn">x</button>`)).id).toBe("login-btn");
  });

  it("normalizes and truncates textContent", () => {
    const el = mount(`<button>  Hello \n  World  </button>`);
    expect(captureFingerprint(el).textContent).toBe("Hello World");
    const long = mount(`<button>${"a".repeat(200)}</button>`);
    expect(captureFingerprint(long).textContent).toHaveLength(100);
  });

  it("whitelists attributes and reduces href to a path pattern", () => {
    const el = mount(`<a href="/users/42?ref=x#top" role="link" type="button">Profile</a>`);
    const attrs = captureFingerprint(el).attributes;
    expect(attrs.role).toBe("link");
    expect(attrs.type).toBe("button");
    expect(attrs.href).toBe("/users/42");
  });

  it("captures domPath excluding html/body", () => {
    const el = must(
      mount(`<form class="login"><button type="submit">Login</button></form>`).querySelector(
        "button",
      ),
    );
    expect(captureFingerprint(el).domPath).toEqual(["form", "button"]);
  });

  it("records position among siblings", () => {
    mount(`<ul><li>a</li><li>b</li><li>c</li></ul>`);
    const second = must(document.querySelectorAll("li")[1]);
    expect(captureFingerprint(second).positionHint).toEqual({ index: 1, siblingCount: 3 });
  });

  it("collects nearby labels (label[for], wrapping label, aria-labelledby)", () => {
    mount(`
      <form>
        <label for="email">Email</label>
        <input id="email" />
        <label>Password <input type="password" /></label>
        <span id="lbl">Remember me</span>
        <input aria-labelledby="lbl" />
      </form>
    `);
    const byFor = captureFingerprint(must(document.getElementById("email")));
    expect(byFor.nearbyLabels).toContain("Email");

    const wrapped = captureFingerprint(must(document.querySelector(`input[type="password"]`)));
    expect(wrapped.nearbyLabels?.some((l) => l.includes("Password"))).toBe(true);

    const labelledBy = captureFingerprint(must(document.querySelector(`input[aria-labelledby]`)));
    expect(labelledBy.nearbyLabels).toContain("Remember me");
  });

  it("produces a cssSelector that resolves uniquely back to the element", () => {
    const el = must(
      mount(`<form class="login"><button type="submit">Login</button></form>`).querySelector(
        "button",
      ),
    );
    const fp = captureFingerprint(el);
    const hits = document.querySelectorAll(fp.cssSelector);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe(el);
  });

  it("uses a stable id for the cssSelector when present", () => {
    const el = mount(`<button id="checkout">Buy</button>`);
    expect(captureFingerprint(el).cssSelector).toBe("#checkout");
  });

  it("captures the current page path as pageUrl (scopes the spec to its route)", () => {
    const el = mount(`<button>Go</button>`);
    // jsdom serves fixtures from http://localhost/, so pathname is "/".
    expect(captureFingerprint(el).pageUrl).toBe(document.location.pathname);
  });

  it("whitelists identity + descriptive attributes, excludes runtime state", () => {
    const el = mount(
      `<button role="checkbox" data-slot="cell" data-part="control" data-scope="checkbox"
               alt="Select" title="Select all" data-state="checked" aria-expanded="true">x</button>`,
    );
    const attrs = captureFingerprint(el).attributes;
    expect(attrs.role).toBe("checkbox");
    expect(attrs["data-slot"]).toBe("cell");
    expect(attrs["data-part"]).toBe("control");
    expect(attrs["data-scope"]).toBe("checkbox");
    expect(attrs.alt).toBe("Select");
    expect(attrs.title).toBe("Select all");
    // State attributes must never be captured as identity.
    expect(attrs["data-state"]).toBeUndefined();
    expect(attrs["aria-expanded"]).toBeUndefined();
  });

  it("prefers identity attributes over classes in the cssSelector compound", () => {
    // Two checkbox buttons force the selector to walk up to the th to
    // disambiguate, exercising identity attributes at both levels.
    const table = mount(
      `<table><thead><tr>
         <th data-slot="select-head"><button role="checkbox" class="gap-1 px-2 bg-red-1">a</button></th>
         <th data-slot="table-head"><button role="checkbox" class="gap-1 px-2 bg-red-1">b</button></th>
       </tr></thead></table>`,
    );
    const el = must(table.querySelectorAll(`th[data-slot="table-head"] button`)[0]);
    const fp = captureFingerprint(el);
    expect(fp.cssSelector).toContain(`button[role="checkbox"]`);
    expect(fp.cssSelector).toContain(`th[data-slot="table-head"]`);
    // Utility classes must not leak into the selector.
    expect(fp.cssSelector).not.toContain("gap-1");
    expect(fp.cssSelector).not.toContain("px-2");
    expect(fp.cssSelector).not.toContain("bg-red-1");
    const hits = document.querySelectorAll(fp.cssSelector);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe(el);
  });

  it("keeps a semantic class in the compound while dropping utility classes", () => {
    const el = must(
      mount(`<div><button class="px-2 submit-btn gap-1">Go</button></div>`).querySelector("button"),
    );
    const fp = captureFingerprint(el);
    expect(fp.cssSelector).toContain("button.submit-btn");
    expect(fp.cssSelector).not.toContain("px-2");
    expect(fp.cssSelector).not.toContain("gap-1");
  });

  it("drops utility-only classes from the compound, falling back to structure", () => {
    const el = must(
      mount(
        `<div><span class="bg-red-1 text-red-6 px-2">a</span><span class="bg-red-1 text-red-6 px-2">b</span></div>`,
      ).querySelectorAll("span")[1],
    );
    const fp = captureFingerprint(el);
    expect(fp.cssSelector).not.toContain("bg-red-1");
    expect(fp.cssSelector).toContain(":nth-of-type");
    const hits = document.querySelectorAll(fp.cssSelector);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe(el);
  });
});
