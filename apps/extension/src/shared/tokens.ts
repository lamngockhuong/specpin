import tokensCss from "./tokens.gen.css?inline";

// tokens.gen.css defines the design tokens on `:root` (correct for the popup/options
// documents). Inside a Shadow DOM tree `:root` matches nothing - the shadow root
// is targeted by `:host` - so scope the same generated CSS to `:host` for the
// in-page renderers (sidebar, tooltip, capture form). The match is anchored to
// the start of a line so it only rewrites the block selectors the generator
// emits, never a `:root` substring that might appear inside a token value.
const shadowTokens = tokensCss.replace(/^(\s*):root\b/gm, "$1:host");

// The invariant preamble every Shadow DOM surface needs: the `:host`-scoped
// tokens plus the isolation reset. Renderers prepend this to their own rules so
// the tokens-and-reset contract lives in one place (component-specific resets
// like `box-sizing` stay at each call site). Custom properties are not reset by
// `all`, so the vars survive `:host { all: initial }`.
export const SHADOW_PREAMBLE = `${shadowTokens}\n:host { all: initial; }`;
