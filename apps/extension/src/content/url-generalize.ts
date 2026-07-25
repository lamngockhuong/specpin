// Pure, privacy-critical URL -> screen-identity generalization. No DOM, no
// storage, no messaging: this module's whole job is to turn a live URL into a
// PII-free glob before any auto-capture code ever stores or transmits it.
//
// Limitation (by design): hash-based SPA routers keep their "route" in the
// URL fragment (`#/orders/123`). Because we strip the hash unconditionally
// (it is the most common place tokens/PII hide), such routers are not
// captured -- every hash-routed page generalizes to the same document path.
// Revisit only if a real consumer needs it; out of scope per the phase plan.

import { slugify } from "../shared/slug.js";

/** The privacy-scrubbed identity of a live page: a glob that matches every URL
 *  generalization would consider "the same screen", and a stable id derived
 *  from that glob (same glob -> same id, so repeat navigations dedupe). */
export interface GeneralizedUrl {
  urlGlob: string;
  screenId: string;
}

/** Hard input bound so a pathological URL never costs more than a bounded
 *  amount of work; well beyond any real browser URL length. */
const MAX_URL_LENGTH = 2048;

/** RFC 4122 UUID (any version/variant nibble), case-insensitive. */
const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A segment made up entirely of digits: numeric database/record ids. */
const ALL_DIGITS_REGEXP = /^[0-9]+$/;

/** A segment made up entirely of hex characters. Combined with
 *  {@link LONG_TOKEN_THRESHOLD} this catches Mongo ObjectIds (24 hex chars),
 *  sha-prefixed tokens, etc. without needing a UUID's dashes. */
const HEX_TOKEN_REGEXP = /^[0-9a-f]+$/i;

/** A segment made up entirely of alphanumerics (base62-ish): long random
 *  tokens (API keys, nanoid/ulid-style ids) that aren't pure hex. */
const BASE62_TOKEN_REGEXP = /^[0-9a-zA-Z]+$/;

/** Length at which a pure hex/base62 token reads as a generated id rather
 *  than a short static word. Chosen well under real id lengths (24-36 chars
 *  for ObjectId/UUID/nanoid) while staying above common static path words. */
const LONG_TOKEN_THRESHOLD = 12;

/** Length at which a *mixed* alnum segment (letters AND at least one digit)
 *  is treated as dynamic even though it isn't a pure digit/hex/base62 run --
 *  e.g. slugs like "invoice-2024118", "page-2", or short custom ids like
 *  "ab12"/"x7k9". Deliberately short (4, not 6+): real-world short-id schemes
 *  (ticket codes, invite codes, shortened record refs) commonly run 4-5
 *  mixed alnum characters, and a threshold above that length would let such
 *  an id survive generalization and land in a Git-committed spec. The
 *  tradeoff this accepts: a handful of short static words that happen to mix
 *  a digit into letters (e.g. "web3") also over-generalize to `**`. That
 *  tradeoff is intentional -- this heuristic biases toward over-generalizing
 *  (a privacy win) rather than leaking an id-shaped segment as a literal glob
 *  piece. */
const MIXED_ALNUM_WITH_DIGIT_MIN_LENGTH = 4;

/**
 * Is this path segment "id-like" and therefore replaced by `**` in the glob?
 *
 * Heuristic, deliberately conservative (bias toward "yes, generalize"):
 * 1. all-digits (any length)                              -> dynamic
 * 2. a UUID                                                -> dynamic
 * 3. a long (>= {@link LONG_TOKEN_THRESHOLD}) pure hex run -> dynamic
 * 4. a long pure base62-ish alnum run containing a digit   -> dynamic
 * 5. any alnum run >= {@link MIXED_ALNUM_WITH_DIGIT_MIN_LENGTH} chars that
 *    mixes letters and digits                              -> dynamic
 *
 * A segment with no digits at all (e.g. "checkout", "user-profile") is
 * always treated as a literal, static route word -- routing vocabulary should
 * survive generalization; only id-shaped tokens should not.
 *
 * Exported so the exact rule is directly unit-testable and tunable (see
 * phase doc: this is the single highest-risk, most-reviewed judgment call in
 * Track B).
 */
export function isDynamicSegment(segment: string): boolean {
  if (!segment) return false;
  if (ALL_DIGITS_REGEXP.test(segment)) return true;
  if (UUID_REGEXP.test(segment)) return true;
  if (segment.length >= LONG_TOKEN_THRESHOLD && HEX_TOKEN_REGEXP.test(segment)) return true;
  if (
    segment.length >= LONG_TOKEN_THRESHOLD &&
    BASE62_TOKEN_REGEXP.test(segment) &&
    /[0-9]/.test(segment)
  ) {
    return true;
  }
  if (
    segment.length >= MIXED_ALNUM_WITH_DIGIT_MIN_LENGTH &&
    /[0-9]/.test(segment) &&
    /[a-zA-Z]/.test(segment)
  ) {
    return true;
  }
  return false;
}

/** Turn a live URL into its privacy-scrubbed screen identity. Query and hash
 *  are dropped FIRST (before any generalization even looks at the string), so
 *  no token/PII carried there can ever leak into the returned glob or id.
 *  Never throws: malformed input safely falls back to the root screen. */
export function generalizeUrl(rawUrl: string): GeneralizedUrl {
  const pathname = extractPathname(rawUrl);
  const { glob, segments } = buildGlob(pathname);
  const screenId = deriveScreenId(glob, segments);
  return { urlGlob: glob, screenId };
}

/** `new URL(rawUrl).pathname` is the whole extraction: the WHATWG URL parser
 *  already separates query (`?...`) and hash (`#...`) from `pathname`, so
 *  nothing beyond the path ever reaches the caller. Bare paths (no
 *  scheme/host) are resolved against a throwaway base so callers that already
 *  stripped origin still work; any other malformed input safely falls back
 *  to "/" rather than throwing. */
function extractPathname(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return "/";
  const bounded = rawUrl.slice(0, MAX_URL_LENGTH);
  try {
    return new URL(bounded).pathname || "/";
  } catch {
    try {
      return new URL(bounded, "http://localhost").pathname || "/";
    } catch {
      return "/";
    }
  }
}

/** Same trailing-slash rule as `matchPathGlob`'s `normalizePath` (root "/" is
 *  kept; every other trailing slash is dropped) -- duplicated locally rather
 *  than imported since that helper is private to `shared/visibility.ts`. The
 *  round-trip test suite pins this against the real `matchPathGlob`. */
function normalizeTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** Returns both the display glob AND its post-generalization segment array,
 *  so {@link deriveScreenId} can build the id from the exact segments (never
 *  a substring match against "**" in the joined string, which would risk
 *  false positives if a literal segment ever contained a stray "*"). */
function buildGlob(pathname: string): { glob: string; segments: string[] } {
  const normalized = normalizeTrailingSlash(pathname);
  if (normalized === "/" || normalized === "") return { glob: "/", segments: [] };
  const rawSegments = normalized.split("/").filter(Boolean);
  const mapped = rawSegments.map((segment) => (isDynamicSegment(segment) ? "**" : segment));
  const collapsed = collapseConsecutiveWildcards(mapped);
  return { glob: `/${collapsed.join("/")}`, segments: collapsed };
}

/** Two (or more) adjacent dynamic segments generalize to a single `**` --
 *  `**` already matches across segments (see `matchPathGlob`), so
 *  `/12345/67890` and `/12345` land on the same glob shape when both
 *  segments are dynamic and adjacent. */
function collapseConsecutiveWildcards(segments: string[]): string[] {
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === "**" && result[result.length - 1] === "**") continue;
    result.push(segment);
  }
  return result;
}

/** Stable slug of the *generalized segments*, not the raw glob string --
 *  each `**` segment is remapped to the literal word "star" before
 *  slugifying (exact array-element match, not a substring replace on the
 *  joined glob) so that e.g. "/orders" and "/orders/**" -- a literal list
 *  page vs. a generalized detail page -- never collide onto the same id
 *  just because `slugify` strips `*` characters the same way it strips `/`.
 *  Root is special-cased to the readable "root". Every non-root glob has at
 *  least one segment, so the slug is never empty here. */
function deriveScreenId(urlGlob: string, segments: string[]): string {
  if (urlGlob === "/") return "root";
  const slugSource = segments.map((segment) => (segment === "**" ? "star" : segment)).join("-");
  return slugify(slugSource);
}
