/*
 * "What's new" changelog behavior: decide whether an extension update should open
 * the hosted changelog, and hold the canonical website URLs.
 *
 * Pure + browser-free so it is unit-testable; the background wires it to
 * runtime.onInstalled and browser.tabs.create.
 */

/** The Specpin changelog route (rendered from the extension's CHANGELOG.md at
 *  build time). The single source for this URL across the extension. */
const WEBSITE_URL = "https://specpin.ohnice.app";
export const CHANGELOG_URL = `${WEBSITE_URL}/changelog`;

/** Parse a semver-ish version ("x.y.z", extra segments ignored) into a
 *  [major, minor, patch] tuple, or null when it does not start with three
 *  dot-separated integers. */
export function parseVersion(version: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Whether an update from `prev` to `cur` should surface the changelog.
 *
 *  Rules:
 *  - Both versions must parse and `cur` must be strictly greater than `prev`
 *    (a downgrade or no-op never opens).
 *  - Pre-1.0 (both majors are 0): every version increase is significant, since
 *    release-please emits patch bumps (`0.0.x`) for real features before 1.0.
 *    Without this, the changelog would almost never open before the 1.0 release.
 *  - 1.0 and later: open only on a minor or major bump, not a patch. This is the
 *    behavior the project settles into once it is stable.
 */
export function shouldOpenChangelog(prev: string, cur: string): boolean {
  const p = parseVersion(prev);
  const c = parseVersion(cur);
  if (!p || !c) return false;

  const cmp = compareVersion(c, p);
  if (cmp <= 0) return false; // equal or downgrade

  // Pre-1.0: any forward move counts.
  if (p[0] === 0 && c[0] === 0) return true;

  // 1.0+: minor or major only (patch-only bumps are silent).
  return c[0] > p[0] || c[1] > p[1];
}

/** Lexicographic compare of two [major, minor, patch] tuples: <0, 0, or >0. */
function compareVersion(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
