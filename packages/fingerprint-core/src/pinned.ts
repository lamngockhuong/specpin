import type { ElementFingerprint } from "@specpin/spec-schema";

/** A spec-like object carrying an optional fingerprint. Generic so it applies to
 *  a bare `Spec` and to extension supersets (e.g. `TaggedSpec`) alike. */
type MaybePinned = { fingerprint?: ElementFingerprint | null };

/**
 * True when a spec is PINNED: it has a fingerprint and can be matched to a live
 * element. False for a PENDING (unpinned) spec — authored before the UI exists,
 * fingerprint not yet captured.
 *
 * A type guard, so a `true` result narrows `fingerprint` to non-null (and the
 * narrowing survives into closures, since it narrows the variable's type — not
 * flow state). Callers that deref `spec.fingerprint` should gate on this rather
 * than re-deriving `!spec.fingerprint` inline.
 */
export function isPinned<T extends MaybePinned>(
  spec: T,
): spec is T & { fingerprint: ElementFingerprint } {
  return spec.fingerprint != null;
}
