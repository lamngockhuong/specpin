import { matchElement } from "@specpin/fingerprint-core";
import type { TaggedSpec } from "../shared/connection-types.js";

// Cross-tab receiver for HIGHLIGHT_SPEC_ON_TAB (Phase 6): the graph page (its
// own tab) sends a specId + connectionId when a node/edge is clicked; this
// resolves it against the CURRENT page's specs/render and reuses the existing
// highlight/scroll path (content/highlight.ts) -- no new overlay chrome.
// Kept out of the content entrypoint so the resolution logic is unit-testable
// without the full content-script runtime.

/** Resolve `specId` to a live DOM element on the current page. Prefers the spec
 *  tagged with `connectionId` (disambiguates a specId that collides across two
 *  connected projects, per the graph's cross-project aggregation); falls back to
 *  matching by id alone when no connection-scoped spec is found, mirroring the
 *  id-only lookups already used elsewhere in the content script (openEditForm,
 *  deleteSpecFlow, etc.) for ids sourced from a single-page context. Prefers an
 *  already-rendered match (`matches`, from the live render session) over a fresh
 *  `matchElement` pass, like the deep-link resolver, so it agrees with what is
 *  currently on screen. Returns null (never throws) when nothing on this page
 *  corresponds to the spec. */
export function resolveSpecElement(
  specId: string,
  connectionId: string,
  specs: readonly TaggedSpec[],
  matches: ReadonlyMap<string, Element> | null | undefined,
  doc: Document,
): Element | null {
  const spec =
    specs.find((s) => s.id === specId && s.connectionId === connectionId) ??
    specs.find((s) => s.id === specId);
  if (!spec) return null;

  const rendered = matches?.get(specId);
  if (rendered) return rendered;

  return matchElement(spec.fingerprint, doc).el;
}

/** Handle a HIGHLIGHT_SPEC_ON_TAB message: resolve the spec to an element on
 *  this page and, if found, hand it to the caller's `highlight` (the existing
 *  scroll+outline path). Returns whether the element was found + highlighted,
 *  so the sender (background -> sendToTab's resolved value) can tell "not on
 *  this page" apart from "delivered but no-op". Never throws: an absent spec or
 *  match is a graceful no-op. */
export function highlightSpecOnTab(
  specId: string,
  connectionId: string,
  specs: readonly TaggedSpec[],
  matches: ReadonlyMap<string, Element> | null | undefined,
  doc: Document,
  highlight: (el: Element) => void,
): boolean {
  const el = resolveSpecElement(specId, connectionId, specs, matches, doc);
  if (!el) return false;
  highlight(el);
  return true;
}
