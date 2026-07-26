// Pure predicate for the Track B auto-capture ignore-list: does a captured
// navigation fall on a screen the user asked NOT to record? No DOM, no storage,
// no messaging -- so the fan-out filter (background) and the draft-buffer prune
// (capture-buffer.ts) share ONE rule and it stays unit-testable in isolation.
//
// Match syntax is `matchPathGlob`'s (the same globs `.specs/views.json`/screens
// use), applied to a generalized `urlGlob` (query/hash already stripped by B1's
// generalizeUrl), so an entry like `/settings/**` reads the way a user expects.

import { matchPathGlob } from "./visibility.js";

/** Normalize a raw ignore-list: trim each glob, drop blanks, de-dupe (first-seen
 *  order preserved). The single home for the trim/de-dupe policy -- shared by the
 *  storage mutators, the SET_RECORD_EXCLUDE handler, and the graph quick-add so
 *  they can never drift on what a stored glob looks like. */
export function normalizeGlobs(globs: readonly string[]): string[] {
  return [...new Set(globs.map((g) => g.trim()).filter(Boolean))];
}

/** True when `urlGlob` matches any glob in the ignore-list. An absent/empty list
 *  matches nothing (capture everything -- the opt-in default). */
export function matchesRecordExclude(
  exclude: readonly string[] | undefined,
  urlGlob: string,
): boolean {
  if (!exclude?.length) return false;
  return exclude.some((glob) => matchPathGlob(glob, urlGlob));
}

/** True when a captured transition should be dropped: EITHER endpoint's
 *  generalized urlGlob matches the ignore-list. Keying on both ends fully
 *  removes an ignored screen from the flow -- it produces neither an incoming
 *  nor an outgoing ghost edge -- which is what "ignore this route" means. */
export function transitionExcluded(
  exclude: readonly string[] | undefined,
  fromUrlGlob: string,
  toUrlGlob: string,
): boolean {
  return matchesRecordExclude(exclude, fromUrlGlob) || matchesRecordExclude(exclude, toUrlGlob);
}
