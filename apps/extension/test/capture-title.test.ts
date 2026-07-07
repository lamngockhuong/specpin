import type { ElementFingerprint } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { deriveTitle, suggestTitle, TITLE_MAX } from "../src/content/capture-title.js";

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

describe("suggestTitle", () => {
  const base: ElementFingerprint = {
    cssSelector: "button",
    xpath: "/button",
    domPath: ["button"],
    tagName: "button",
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
  };

  it("prefers aria-label over text/placeholder/name/nearby", () => {
    expect(
      suggestTitle({
        ...base,
        ariaLabel: "Add to cart",
        textContent: "cart text",
        attributes: { placeholder: "ph", name: "nm" },
        nearbyLabels: ["nearby"],
      }),
    ).toBe("Add to cart");
  });

  it("falls back to visible text when no aria-label", () => {
    expect(suggestTitle({ ...base, textContent: "Add to cart" })).toBe("Add to cart");
  });

  it("falls back to placeholder, then name, then nearby label", () => {
    expect(suggestTitle({ ...base, attributes: { placeholder: "Email" } })).toBe("Email");
    expect(suggestTitle({ ...base, attributes: { name: "email_field" } })).toBe("email_field");
    expect(suggestTitle({ ...base, nearbyLabels: ["Your email"] })).toBe("Your email");
  });

  it("collapses whitespace and caps the length like deriveTitle", () => {
    expect(suggestTitle({ ...base, textContent: "  Add   to \n cart  " })).toBe("Add to cart");
    expect(suggestTitle({ ...base, textContent: "a".repeat(120) })).toHaveLength(TITLE_MAX);
  });

  it("returns empty when the element exposes no signal (unlike deriveTitle)", () => {
    expect(suggestTitle(base)).toBe("");
  });
});
