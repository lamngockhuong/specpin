// Shareable deep links to a spec: `<pageUrl>#specpin=<id>`. Pure, DOM-free, and
// unit-tested, so the copy-link affordances (side-panel card, tooltip) and the
// content-script resolver all build/parse the link one way.
//
// The URL fragment is treated as `&`-separated `key=value` pairs so an app that
// owns the hash keeps its own fragment: only the `specpin` pair is added/replaced
// on build and read on parse; every other segment is preserved verbatim (a
// value-less segment like a `#/route` hash survives as its own segment).

/** The fragment key that carries the spec id in a deep link. */
export const SPEC_HASH_KEY = "specpin";

/** Split a URL fragment into its `&`-separated segments (the leading "#" and an
 *  empty fragment both yield an empty list). */
function splitFragment(hash: string): string[] {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return raw ? raw.split("&") : [];
}

/** The key portion of a `key=value` segment (the whole segment when it has no
 *  "="), so a value-less app segment like `/route` reads as its own key. */
function segmentKey(segment: string): string {
  const eq = segment.indexOf("=");
  return eq === -1 ? segment : segment.slice(0, eq);
}

/** Build a shareable link to a spec: set `specpin=<id>` on `pageUrl`'s fragment,
 *  preserving any other fragment the host app owns and leaving the path/query
 *  untouched. Returns `pageUrl` unchanged when it is not a parseable URL. */
export function buildSpecLink(pageUrl: string, id: string): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return pageUrl;
  }
  const kept = splitFragment(url.hash).filter((s) => segmentKey(s) !== SPEC_HASH_KEY);
  kept.push(`${SPEC_HASH_KEY}=${encodeURIComponent(id)}`);
  url.hash = kept.join("&");
  return url.toString();
}

/** Extract the `specpin` id from a URL's fragment, or null when absent. Accepts a
 *  full URL or a bare fragment string; tolerates a missing/garbage hash and a
 *  malformed percent-encoding (returns null rather than throwing). */
export function parseSpecLink(url: string): string | null {
  let hash: string;
  try {
    hash = new URL(url).hash;
  } catch {
    // Not a full URL: treat the input itself as the fragment.
    hash = url;
  }
  for (const segment of splitFragment(hash)) {
    if (segmentKey(segment) !== SPEC_HASH_KEY) continue;
    const eq = segment.indexOf("=");
    if (eq === -1) return "";
    try {
      return decodeURIComponent(segment.slice(eq + 1));
    } catch {
      return null; // malformed encoding: treat as no valid deep link
    }
  }
  return null;
}
