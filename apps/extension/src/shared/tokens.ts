import scrollbarCss from "./scrollbar.css?inline";
import tokensCss from "./tokens.gen.css?inline";

// tokens.gen.css defines the design tokens on `:root` (correct for the popup/options
// documents). Inside a Shadow DOM tree `:root` matches nothing - the shadow root
// is targeted by `:host` - so scope the same generated CSS to `:host` for the
// in-page renderers (sidebar, tooltip, capture form).
//
// The generator emits four selector forms (see sync-css-tokens.mjs): bare
// `:root`, the two forced-theme attribute selectors, and the `:not()`-guarded
// system-default inside @media. Attribute and `:not()` selectors must move INSIDE
// the `:host()` functional selector (`:host([data-theme="dark"])`,
// `:host(:not(...))`), not stay as `:host[data-theme]` which would not match the
// host. Apply the most specific replacements first so the bare-`:root` rewrite
// (which runs last) can never swallow an attribute or `:not()` form.
//
// These patterns must survive CSS minification: `?inline` in a production build
// joins the file onto one line and strips quotes from attribute values
// (`[data-theme=dark]`), so matching cannot rely on line anchors and must treat
// the quotes around the value as optional. (The previous line-anchored, quoted
// patterns silently no-op'd on the minified build, leaving every Shadow-DOM
// surface stuck on the base light theme.) The bare-`:root` rewrite keeps a
// selector-context lookahead (`{`, whitespace, or `,`, i.e. what follows a block
// selector even when minified to `:root{`) so a stray `:root` inside a token
// value string is still never touched.
const ROOT_SYSTEM =
  /:root:not\(\[data-theme=["']?light["']?\]\):not\(\[data-theme=["']?dark["']?\]\)/g;
const ROOT_DARK = /:root\[data-theme=["']?dark["']?\]/g;
const ROOT_LIGHT = /:root\[data-theme=["']?light["']?\]/g;

export function scopeTokensToShadow(css: string): string {
  return css
    .replace(ROOT_SYSTEM, ':host(:not([data-theme="light"]):not([data-theme="dark"]))')
    .replace(ROOT_DARK, ':host([data-theme="dark"])')
    .replace(ROOT_LIGHT, ':host([data-theme="light"])')
    .replace(/:root(?=[\s{,])/g, ":host");
}

const shadowTokens = scopeTokensToShadow(tokensCss);

// The invariant preamble every Shadow DOM surface needs: the `:host`-scoped
// tokens, the isolation reset, and the shared thin scrollbar styling. Renderers
// prepend this to their own rules so the tokens-and-reset contract lives in one
// place (component-specific resets like `box-sizing` stay at each call site).
// Custom properties are not reset by `all`, so the vars survive
// `:host { all: initial }`. scrollbar.css uses bare `*`/`::-webkit-scrollbar`
// selectors (no `:root`), so it drops into a shadow root unchanged and keeps the
// modal/sidebar/tooltip scrollbars in sync with the popup and side panel from one
// source (the same file the pages import directly).
export const SHADOW_PREAMBLE = `${shadowTokens}\n:host { all: initial; }\n${scrollbarCss}`;
