// Dependency-free, CSP-safe Markdown-subset renderer for spec text. It turns a
// small, fixed Markdown subset (bold, italic, inline code, link, bullet +
// numbered lists)
// into a trusted HTML string that is safe to assign via innerHTML, because this
// module fully controls the markup: every leaf of user text is escaped BEFORE it
// is wrapped, and the only attribute sink (`<a href>`) is guarded by classifyHref.
//
// Invariant (the security crux): never run a global escapeHtml over already-built
// markup (that would double-escape our own tags). Instead each plain-text segment
// is escaped as it is emitted, so a literal "<" from the user can never become a
// tag. Output contains ONLY the allowlisted tags emitted here: <strong>, <em>,
// <code>, <a>, <ul>, <ol>, <li>, <p>, <br>. No class/style/id/on* attributes are
// emitted;
// the only attribute beyond href/rel/target is the controlled, value-less
// `data-specpin-internal` marker on same-origin links (see classifyHref).
//
// Parsing is line-based for blocks and a non-backtracking scanner for inline
// marks, so there is no ReDoS exposure on long input. This is intentionally NOT a
// full CommonMark engine: anything outside the subset stays literal.

import { escapeAttr, escapeHtml } from "./html.js";

// A link match: [text](url). Text cannot contain "]" (so links never nest); the
// URL is non-space, non-")" so it ends cleanly. Anchored at the scan position.
const LINK_AT_START = /^\[([^\]]*)\]\(([^)\s]*)\)/;
// Same shape, global + unanchored, for stripMarkdown's link -> visible-text pass.
const LINK_GLOBAL = /\[([^\]]*)\]\(([^)\s]*)\)/g;

// Block line classifiers, hoisted so renderMarkdownBlock does not recompile them
// per line. No /g flag, so there is no shared lastIndex state across exec calls.
const BULLET_LINE = /^[ \t]*[-*][ \t]+(.*)$/;
const NUMBERED_LINE = /^[ \t]*\d+\.[ \t]+(.*)$/;

// stripMarkdown passes, hoisted to module scope (the /g forms are safe to share
// because String.replace resets lastIndex on each call).
const STRIP_NEWLINES = /\r\n?|\n/g;
const STRIP_LIST_MARKER = /(^|\s)(?:[-*]|\d+\.)\s+/g; // line-leading or inline
const STRIP_BOLD = /\*\*/g;
const STRIP_EMPHASIS = /[*_]/g;
const STRIP_CODE = /`/g;
const COLLAPSE_WS = /\s+/g;

/** Validate a link URL for the `href` sink. Returns the URL when it carries an
 *  absolute http/https/mailto scheme, else null. The renderer runs inside
 *  arbitrary host pages, so relative and scheme-relative URLs are rejected (their
 *  base would be the host page, not the spec's origin), and dangerous schemes
 *  (javascript:, data:, vbscript:) are dropped. Caller escapes the result. */
export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  // Scheme = leading "word:" per RFC 3986. No scheme -> relative -> reject.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (!scheme) return null;
  const proto = scheme[1].toLowerCase();
  if (proto === "http" || proto === "https" || proto === "mailto") return trimmed;
  return null;
}

/** A link URL resolved for the `href` sink, plus whether it targets the spec's
 *  own page origin. `internal` links open in the current tab; everything else
 *  opens in a new tab. */
export interface ClassifiedHref {
  href: string;
  internal: boolean;
}

/** Classify a link URL against the spec's page origin so the renderer can route
 *  same-origin navigation to the current tab and cross-origin to a new tab.
 *
 *  Without `pageOrigin` this is just safeHref with `internal: false` (legacy
 *  behavior: relative URLs rejected, every link opens in a new tab). With a
 *  `pageOrigin`, an absolute URL is kept verbatim (no normalization, preserving
 *  fragments/queries) and flagged internal only when its origin matches; a
 *  relative URL is resolved against `pageOrigin` (so it is internal by
 *  construction unless it resolves elsewhere, e.g. a scheme-relative "//other").
 *  Only http/https/mailto survive; dangerous schemes return null. */
export function classifyHref(url: string, pageOrigin?: string): ClassifiedHref | null {
  const abs = safeHref(url);
  if (abs) {
    if (!pageOrigin) return { href: abs, internal: false };
    let origin: string;
    try {
      origin = new URL(abs).origin; // "null" for mailto -> never matches an origin
    } catch {
      return { href: abs, internal: false };
    }
    return { href: abs, internal: origin === pageOrigin };
  }
  // Not an allowed absolute URL. With a page origin we can still resolve a
  // relative URL against it; reject (as before) when there is no base origin.
  if (!pageOrigin) return null;
  let resolved: URL;
  try {
    resolved = new URL(url.trim(), pageOrigin);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  return { href: resolved.href, internal: resolved.origin === pageOrigin };
}

/** Render the inline marks (bold/italic/link) of a single text segment to a safe
 *  HTML string. Everything that is not a recognized mark is escaped literal text.
 *  Unbalanced or empty markers stay literal. `pageOrigin`, when given, lets links
 *  to the spec's own origin open in the current tab (see classifyHref). */
export function renderInlineMarkdown(src: string, pageOrigin?: string): string {
  let out = "";
  let literal = "";
  const flush = () => {
    if (literal) {
      out += escapeHtml(literal);
      literal = "";
    }
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    // Inline code first: a backtick span is literal, so "*", "_" or "[" inside it
    // never becomes emphasis or a link. Its content is escaped, not re-parsed.
    const code = matchDelimited(rest, "`");
    if (code) {
      flush();
      out += `<code>${escapeHtml(code.content)}</code>`;
      i += code.length;
      continue;
    }

    // Links next, so "*" inside a URL is never treated as emphasis.
    const link = LINK_AT_START.exec(rest);
    if (link) {
      flush();
      out += renderLink(link[1], link[2], pageOrigin);
      i += link[0].length;
      continue;
    }

    // Bold (**) before italic (*) so "**x**" is one bold, not nested italics.
    const bold = matchDelimited(rest, "**");
    if (bold) {
      flush();
      out += `<strong>${renderInlineMarkdown(bold.content, pageOrigin)}</strong>`;
      i += bold.length;
      continue;
    }

    // Italic with "*".
    const emStar = matchDelimited(rest, "*");
    if (emStar) {
      flush();
      out += `<em>${renderInlineMarkdown(emStar.content, pageOrigin)}</em>`;
      i += emStar.length;
      continue;
    }

    // Italic with "_", but only at word boundaries so snake_case identifiers in
    // legacy plain text are not mangled into emphasis.
    if (src[i] === "_" && isBoundary(src[i - 1]) && i + 1 < src.length) {
      const em = matchDelimited(rest, "_");
      if (em && isBoundary(src[i + em.length])) {
        flush();
        out += `<em>${renderInlineMarkdown(em.content, pageOrigin)}</em>`;
        i += em.length;
        continue;
      }
    }

    literal += src[i];
    i += 1;
  }
  flush();
  return out;
}

/** Render block-level Markdown (paragraphs, bullet + numbered lists, single
 *  newlines as <br>) for descriptions. Inline marks apply within each block.
 *  `pageOrigin` is threaded to the inline pass so same-origin links open in the
 *  current tab (see classifyHref). */
export function renderMarkdownBlock(src: string, pageOrigin?: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let items: string[] = [];
  let listTag: "ul" | "ol" | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map((p) => renderInlineMarkdown(p, pageOrigin)).join("<br>")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (listTag) {
      const li = items.map((it) => `<li>${renderInlineMarkdown(it, pageOrigin)}</li>`).join("");
      out.push(`<${listTag}>${li}</${listTag}>`);
      items = [];
      listTag = null;
    }
  };

  for (const line of lines) {
    const bullet = BULLET_LINE.exec(line);
    const numbered = NUMBERED_LINE.exec(line);
    if (bullet) {
      flushPara();
      if (listTag !== "ul") flushList();
      listTag = "ul";
      items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (listTag !== "ol") flushList();
      listTag = "ol";
      items.push(numbered[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

/** Strip the Markdown markers from `src`, returning the visible plain text. Used
 *  by search so a query matches what the user sees, not the syntax. Returns
 *  un-escaped text (search only lowercases + substring-compares, never injects
 *  into the DOM). */
export function stripMarkdown(src: string): string {
  return src
    .replace(LINK_GLOBAL, "$1") // [text](url) -> text
    .replace(STRIP_NEWLINES, " ")
    .replace(STRIP_LIST_MARKER, "$1")
    .replace(STRIP_BOLD, "")
    .replace(STRIP_EMPHASIS, "")
    .replace(STRIP_CODE, "")
    .replace(COLLAPSE_WS, " ")
    .trim();
}

// --- internals -------------------------------------------------------------

/** Build the anchor for a link, or drop it to its escaped visible text when the
 *  URL fails the href allowlist. A link to the spec's own origin is marked
 *  `data-specpin-internal` and carries no `target`, so it opens in the current
 *  tab; any other link keeps `target="_blank"` and opens in a new tab. */
function renderLink(text: string, url: string, pageOrigin?: string): string {
  const inner = renderInlineMarkdown(text, pageOrigin);
  const link = classifyHref(url, pageOrigin);
  if (!link) return inner; // unsafe/unresolvable link: keep the text, drop the link
  if (link.internal) {
    return `<a href="${escapeAttr(link.href)}" data-specpin-internal="">${inner}</a>`;
  }
  return `<a href="${escapeAttr(link.href)}" rel="noopener noreferrer" target="_blank">${inner}</a>`;
}

/** Match an opening `marker` at the start of `s` and the next occurrence of the
 *  same marker; returns the (non-empty) content between and the consumed length,
 *  or null. Uses indexOf (no backtracking). */
function matchDelimited(s: string, marker: string): { content: string; length: number } | null {
  if (!s.startsWith(marker)) return null;
  const close = s.indexOf(marker, marker.length);
  if (close < 0) return null;
  const content = s.slice(marker.length, close);
  if (!content) return null; // empty (e.g. "**") stays literal
  return { content, length: close + marker.length };
}

/** A word boundary for "_" emphasis: start/end of string or a non-alphanumeric
 *  character. (undefined arises when reading just past either end.) */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[A-Za-z0-9]/.test(ch);
}
