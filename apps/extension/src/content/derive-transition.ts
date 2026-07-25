// Pure transition derivation for auto-capture: turns an ordered (fromUrl,
// toUrl) navigation pair into a candidate screen-transition edge. No DOM, no
// storage, no messaging -- see url-generalize.ts for the privacy core this
// builds on.

import type { Transition } from "@specpin/spec-schema";
import { generalizeUrl } from "./url-generalize.js";

/** `deriveTransition`'s output maps 1:1 onto the schema `Transition` shape,
 *  so B3's write-back needs no reshaping before it upserts into
 *  `screens.json`. Kept as an alias (not a subtype) so a schema change to
 *  `Transition` is felt here automatically. */
export type CapturedTransition = Transition;

export interface DeriveTransitionOptions {
  /** Emit a transition even when `fromUrl`/`toUrl` generalize to the same
   *  screen (self-loop). Defaults to false: a param-only URL change (e.g. a
   *  query string update on the same page) is not a real navigation. */
  allowSelf?: boolean;
}

/** Neutral, non-PII trigger label for every auto-captured edge -- auto-
 *  capture observes navigation only, never a specific click/label, so the
 *  trigger text itself must never carry page content. */
const AUTO_CAPTURED_TRIGGER = { en: "navigation" };

/**
 * Derive a candidate screen-transition from one observed navigation.
 *
 * Returns `null` for a self-navigation (both URLs generalize to the same
 * screen) unless `opts.allowSelf` is set -- e.g. `/orders/123?tab=a` ->
 * `/orders/123?tab=b` is the same screen, not a real transition, since query
 * strings are stripped before comparison.
 *
 * The returned id is deterministic (`${fromScreenId}__${toScreenId}`): the
 * same navigation shape always derives the same id, so repeated
 * observations of the same edge dedupe instead of piling up duplicates.
 */
export function deriveTransition(
  fromUrl: string,
  toUrl: string,
  opts: DeriveTransitionOptions = {},
): CapturedTransition | null {
  const from = generalizeUrl(fromUrl);
  const to = generalizeUrl(toUrl);
  const isSelfNav = from.urlGlob === to.urlGlob;
  if (isSelfNav && !opts.allowSelf) return null;

  return {
    id: `${from.screenId}__${to.screenId}`,
    from: from.screenId,
    to: to.screenId,
    trigger: AUTO_CAPTURED_TRIGGER,
    source: "auto-captured",
  };
}
