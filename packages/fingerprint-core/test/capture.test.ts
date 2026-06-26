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
});
