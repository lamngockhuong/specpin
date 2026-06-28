import tokensCss from "./tokens.gen.css?inline";

// tokens.gen.css defines the design tokens on `:root` (correct for the popup/options
// documents). Inside a Shadow DOM tree `:root` matches nothing - the shadow root
// is targeted by `:host` - so scope the same generated CSS to `:host` for the
// in-page renderers (sidebar, tooltip, capture form).
//
// The generator now emits four selector forms (see sync-css-tokens.mjs): bare
// `:root`, the two forced-theme attribute selectors, and the `:not()`-guarded
// system-default inside @media. Attribute and `:not()` selectors must move INSIDE
// the `:host()` functional selector (`:host([data-theme="dark"])`,
// `:host(:not(...))`), not stay as `:host[data-theme]` which would not match the
// host. Apply the most specific replacements first so a bare-`:root` rewrite can
// never swallow an attribute form. Each pattern is anchored at line start, so a
// `:root` substring inside a token value is never touched.
export function scopeTokensToShadow(css: string): string {
  return css
    .replace(
      /^(\s*):root:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\)/gm,
      '$1:host(:not([data-theme="light"]):not([data-theme="dark"]))',
    )
    .replace(/^(\s*):root\[data-theme="dark"\]/gm, '$1:host([data-theme="dark"])')
    .replace(/^(\s*):root\[data-theme="light"\]/gm, '$1:host([data-theme="light"])')
    .replace(/^(\s*):root\b/gm, "$1:host");
}

const shadowTokens = scopeTokensToShadow(tokensCss);

// The invariant preamble every Shadow DOM surface needs: the `:host`-scoped
// tokens plus the isolation reset. Renderers prepend this to their own rules so
// the tokens-and-reset contract lives in one place (component-specific resets
// like `box-sizing` stay at each call site). Custom properties are not reset by
// `all`, so the vars survive `:host { all: initial }`.
export const SHADOW_PREAMBLE = `${shadowTokens}\n:host { all: initial; }`;
