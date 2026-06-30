// Optional host-permission helpers for remote sidecar connections. Declared
// host_permissions stay localhost-only (no broad install warning); a remote
// origin is granted at connect time via browser.permissions.request and revoked
// on delete via browser.permissions.remove, so grants never accumulate.
//
// IMPORTANT (gesture): browser.permissions.request must run inside the user
// gesture, i.e. BEFORE any awaited async boundary in the click handler, or
// Chrome/Firefox drops it. Callers run normalizeSidecarUrl (sync) first, then
// `await requestHostPermission(url)` as the first await.
import { browser } from "#imports";
import { canonicalOrigin } from "./config.js";

/** The match pattern for a URL's origin, e.g. "https://specs.example.com/*".
 *  Callers pass an already-validated sidecar URL, so the origin always parses. */
export function originPattern(url: string): string {
  return `${canonicalOrigin(url)}/*`;
}

/** Request the optional host permission for a remote origin. Returns true when
 *  granted (or already held). Must be the first await in the click handler. */
export function requestHostPermission(url: string): Promise<boolean> {
  return browser.permissions.request({ origins: [originPattern(url)] });
}

/** Gate a sidecar connect on the remote host permission, shared by the three
 *  add/edit click handlers (popup/side-panel add-project, Options add, Options
 *  edit-save) so the request + on-deny clearing cannot drift between them.
 *  Local connections need no permission and pass straight through.
 *
 *  GESTURE-CRITICAL: this must be the FIRST `await` in the click handler — only
 *  synchronous work (normalizeSidecarUrl, DOM reads) may precede it, or
 *  Chrome/Firefox drop the user gesture and the prompt never appears. On denial
 *  it runs `onDenied` (clear the secret field + show the message) and returns
 *  false so the caller aborts the connect. */
export async function ensureRemotePermission(
  url: string,
  isRemote: boolean,
  onDenied: () => void,
): Promise<boolean> {
  if (!isRemote) return true;
  if (await requestHostPermission(url)) return true;
  onDenied();
  return false;
}

/** Revoke the optional host permission for `url`'s origin, but only if no other
 *  still-configured connection uses the same origin (so deleting one of two
 *  connections to the same host does not break the other). Localhost origins are
 *  covered by declared host_permissions and never granted optionally, so they are
 *  skipped. Best-effort: a revoke failure is swallowed (the grant is harmless). */
export async function removeHostPermissionIfUnused(
  url: string,
  remainingUrls: string[],
): Promise<void> {
  const origin = canonicalOrigin(url);
  // Only remote https origins were ever granted optionally (a malformed URL
  // yields null and is likewise skipped).
  if (!origin?.startsWith("https://")) return;
  const stillUsed = remainingUrls.some((u) => canonicalOrigin(u) === origin);
  if (stillUsed) return;
  try {
    await browser.permissions.remove({ origins: [`${origin}/*`] });
  } catch {
    // A leftover grant is harmless; never block the delete on it.
  }
}
