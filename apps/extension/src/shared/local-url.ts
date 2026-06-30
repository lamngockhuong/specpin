// The sidecar baseUrl guard (SSRF/phishing). A connection points the extension's
// bearer-token requests at this URL, so the rule is deliberately strict and is
// shared by the Options page and the popup/side-panel add-project form so it
// cannot drift between them. Pure (no DOM, no i18n) for direct testing.
//
// Rules:
//  - localhost / 127.0.0.1 may be http OR https (the sidecar's default bind).
//  - any other host MUST be https: the background service worker is a secure
//    context, and a plaintext http request to a remote host is blocked as mixed
//    content, so accepting it would only produce a connection that never works.
//  - no path / query / fragment / userinfo: a path could smuggle a different
//    target, and `user:pass@` userinfo could mask the real host
//    (http://127.0.0.1@evil.com points at evil.com, not 127.0.0.1).
//
// Remote https may resolve to any reachable host, including RFC1918 / cloud
// metadata addresses. That residual SSRF surface is accepted and documented in
// the threat model: a remote connection is user-pasted and gated behind an
// explicit per-origin permission prompt, not an open redirect.

/** Hosts treated as local (http allowed, no permission prompt needed — they are
 *  covered by the declared localhost host_permissions). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export interface SidecarUrlResult {
  /** Trimmed, trailing-slash-stripped input. */
  url: string;
  /** True only for an accepted sidecar URL. */
  valid: boolean;
  /** True when the (valid) host is not localhost/127.0.0.1, so the caller must
   *  request the optional host permission before connecting. Meaningful only
   *  when `valid` is true; for an invalid remote it still reflects intent so the
   *  UI can show the "remote needs https" hint. */
  isRemote: boolean;
}

/** Normalize a sidecar URL (trim + drop trailing slashes) and apply the guard
 *  above. An empty string is `valid: false`, so callers handle the
 *  required-field case separately (e.g. connection edit keeps the stored URL
 *  when the field is left blank). */
export function normalizeSidecarUrl(raw: string): SidecarUrlResult {
  const url = raw.trim().replace(/\/+$/, "");
  // `isRemote` is meaningful only on the remote-https-required rejection; every
  // other rejection is structural and reports isRemote: false.
  const invalid = (isRemote = false): SidecarUrlResult => ({ url, valid: false, isRemote });
  if (!url) return invalid();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return invalid();
  }

  // Structural anti-spoof: scheme + host (+ optional port) only.
  if (parsed.username || parsed.password) return invalid();
  if (parsed.pathname !== "/" && parsed.pathname !== "") return invalid();
  if (parsed.search || parsed.hash) return invalid();
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return invalid();

  const isRemote = !LOCAL_HOSTS.has(parsed.hostname);
  if (!isRemote) return { url, valid: true, isRemote: false };
  // Remote: https only.
  if (parsed.protocol !== "https:") return invalid(true);
  return { url, valid: true, isRemote: true };
}
