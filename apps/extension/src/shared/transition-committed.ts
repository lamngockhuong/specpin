import type { ScreensConfig } from "@specpin/spec-schema";

// Pure predicate: does the project's committed screens.json ALREADY connect the
// same two screens as a captured navigation? Used to keep the auto-recorder from
// re-proposing an edge the user has already authored/approved -- both at capture
// time (background fan-out) and, for entries buffered before the edge existed, at
// overlay time. No DOM, no storage: unit-testable in isolation.
//
// Endpoints resolve by committed screen id OR urlGlob -- the SAME identity rule
// graph-ghost's overlay applies when it maps a candidate onto an existing node --
// so a manually-authored edge whose transition id differs from the recorder's
// deterministic `${from}__${to}` still counts as "already there".

/** The minimal shape of a captured navigation endpoint (a CapturedScreenCandidate
 *  satisfies it): a generalized screen id plus its urlGlob. */
export interface ScreenEndpoint {
  id: string;
  urlGlob: string;
}

export function transitionAlreadyCommitted(
  screens: ScreensConfig,
  from: ScreenEndpoint,
  to: ScreenEndpoint,
): boolean {
  const resolve = (ref: ScreenEndpoint): string => {
    const hit = screens.screens.find((s) => s.id === ref.id || s.urlGlob === ref.urlGlob);
    return hit?.id ?? ref.id;
  };
  const f = resolve(from);
  const t = resolve(to);
  return screens.transitions.some((tr) => tr.from === f && tr.to === t);
}
