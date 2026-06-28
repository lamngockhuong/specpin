// The sidecar binds 127.0.0.1 only, so a connection baseUrl must be localhost.
// This is the security guard (SSRF/phishing): a non-local URL would point the
// extension's bearer-token requests at an arbitrary server. Shared by the Options
// page and the popup/side-panel add-project form so the rule cannot drift between
// them. Pure (no DOM, no i18n) for direct testing.

/** Allowed sidecar host: http(s) on 127.0.0.1 or localhost, optional port, no
 *  path/query/fragment. */
export const LOCAL_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** Normalize a sidecar URL (trim + drop trailing slashes) and check the
 *  localhost-only rule. `valid` is true only for a proper localhost URL; an empty
 *  string is `valid: false`, so callers handle the required-field case separately
 *  (e.g. connection edit keeps the stored URL when the field is left blank). */
export function normalizeLocalUrl(raw: string): { url: string; valid: boolean } {
  const url = raw.trim().replace(/\/+$/, "");
  return { url, valid: LOCAL_URL.test(url) };
}
