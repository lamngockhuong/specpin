import { describe, expect, it } from "vitest";
import { scopeTokensToShadow } from "../src/shared/tokens.js";

// Representative slice of the generated tokens.gen.css shape (see sync-css-tokens.mjs).
// The `?inline` CSS import resolves to empty under vitest, so the rewrite is tested
// as a pure function against a known input instead of the bundled file.
const SAMPLE = `:root {
  --sp-bg: #F2FBF9;
  --sp-text: #06302A;
}

:root[data-theme="dark"] {
  --sp-bg: #04130F;
}

:root[data-theme="light"] {
  --sp-bg: #F2FBF9;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not([data-theme="dark"]) {
    --sp-bg: #04130F;
  }
}
`;

describe("scopeTokensToShadow", () => {
  const out = scopeTokensToShadow(SAMPLE);

  it("maps the bare :root baseline to :host", () => {
    expect(out).toMatch(/^:host\s*\{/m);
  });

  it("moves forced-theme attribute selectors inside :host()", () => {
    expect(out).toContain(':host([data-theme="dark"]) {');
    expect(out).toContain(':host([data-theme="light"]) {');
  });

  it("moves the :not()-guarded system default inside :host()", () => {
    expect(out).toContain(':host(:not([data-theme="light"]):not([data-theme="dark"])) {');
  });

  it("keeps the @media block (works inside shadow DOM)", () => {
    expect(out).toContain("@media (prefers-color-scheme: dark)");
  });

  it("leaves no bare :root block selector in the shadow scope", () => {
    expect(out).not.toMatch(/^\s*:root\b/m);
  });

  it("never corrupts a :root substring inside a token value", () => {
    // A value mentioning `:root` (contrived) must survive untouched: the bare
    // rewrite only fires in selector context ({, whitespace, comma).
    const withValue = `.x {\n  content: ":root";\n}\n`;
    expect(scopeTokensToShadow(withValue)).toContain('content: ":root";');
  });

  // Regression: a production build inlines this CSS minified onto one line with
  // the quotes stripped from attribute values. The rewrite must still scope every
  // forced-theme selector, or Shadow-DOM surfaces stay stuck on the light base.
  it("scopes minified, unquoted, single-line CSS (production ?inline shape)", () => {
    const minified =
      ":root{--sp-bg:#F2FBF9}:root[data-theme=dark]{--sp-bg:#04130F}" +
      ":root[data-theme=light]{--sp-bg:#F2FBF9}" +
      "@media (prefers-color-scheme:dark){:root:not([data-theme=light]):not([data-theme=dark]){--sp-bg:#04130F}}";
    const out = scopeTokensToShadow(minified);
    expect(out).toContain(":host{--sp-bg:#F2FBF9}");
    expect(out).toContain(':host([data-theme="dark"]){');
    expect(out).toContain(':host([data-theme="light"]){');
    expect(out).toContain(':host(:not([data-theme="light"]):not([data-theme="dark"])){');
    // No un-scoped :root block selector may survive (that was the bug).
    expect(out).not.toMatch(/:root[{[]/);
  });
});
