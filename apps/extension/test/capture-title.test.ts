import { afterEach, describe, expect, it } from "vitest";
import { deriveTitle, TITLE_MAX } from "../src/content/capture-title.js";

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("deriveTitle precedence", () => {
  it("prefers visible text", () => {
    expect(deriveTitle(el(`<button aria-label="a" title="t">  Save  order </button>`))).toBe(
      "Save order",
    );
  });

  it("falls back to aria-label when there is no text", () => {
    expect(deriveTitle(el(`<button aria-label="Close dialog" title="t"></button>`))).toBe(
      "Close dialog",
    );
  });

  it("falls back to title, then placeholder", () => {
    expect(deriveTitle(el(`<span title="Tooltip name"></span>`))).toBe("Tooltip name");
    expect(deriveTitle(el(`<input placeholder="Email address">`))).toBe("Email address");
  });

  it("humanizes the role, then the tag, as a last resort", () => {
    expect(deriveTitle(el(`<div role="menuitem"></div>`))).toBe("Menuitem");
    expect(deriveTitle(el(`<button></button>`))).toBe("Button");
  });

  it("treats whitespace-only text as empty and falls through", () => {
    expect(deriveTitle(el(`<button aria-label="Real name">   \n  </button>`))).toBe("Real name");
  });

  it("collapses internal whitespace and caps the length", () => {
    const long = "x".repeat(200);
    const out = deriveTitle(el(`<button>${long}</button>`));
    expect(out.length).toBe(TITLE_MAX);
  });

  it("is never empty", () => {
    expect(deriveTitle(el(`<a href="/x"></a>`))).not.toBe("");
  });
});
