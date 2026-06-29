import { matchElement } from "@specpin/fingerprint-core";
import type { TaggedSpec } from "../shared/connection-types.js";
import { isLocalConnectionId } from "../shared/local-id.js";

/** A guide step resolved to a live DOM element: the spec plus the element its
 *  fingerprint matched. Resolution happens before the tour starts. */
export interface ResolvedStep {
  spec: TaggedSpec;
  el: Element;
}

export interface ResolveResult {
  /** Matched steps, in the guide's order (unresolved/unmatched ids dropped). */
  steps: ResolvedStep[];
  /** Step ids that did not resolve (unknown id, or spec present but no DOM match),
   *  in the guide's order, so the curation UI can flag them. */
  dropped: string[];
}

/**
 * Default tour order (RT-H4): the real order the runtime serves specs in, since
 * `TaggedSpec` carries `_file` but no explicit order field. A stable sort by
 * (sidecar-before-local, then `_file` alphabetical) preserves the specs' existing
 * array order within a file - i.e. the in-file array index. The sidecar itself
 * sorts filenames (store.go), so alphabetical `_file` reproduces its order; local
 * (`manual:<batchId>`) specs sort last. Pure + unit-tested.
 */
export function defaultGuideOrder(specs: TaggedSpec[]): TaggedSpec[] {
  return specs
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => {
      const aLocal = isLocalConnectionId(a.spec.connectionId) ? 1 : 0;
      const bLocal = isLocalConnectionId(b.spec.connectionId) ? 1 : 0;
      if (aLocal !== bLocal) return aLocal - bLocal; // local/manual batches last
      const byFile = (a.spec._file ?? "").localeCompare(b.spec._file ?? "");
      if (byFile !== 0) return byFile; // alphabetical by _file
      return a.index - b.index; // stable: preserve in-file array index
    })
    .map((x) => x.spec);
}

/**
 * Resolve a guide's ordered step ids to live DOM elements. Each id is looked up
 * in `specs` and matched against the page; an id with no spec (renamed/deleted)
 * or no DOM match is DROPPED while the surviving order is kept (R2). An
 * empty/absent `orderedIds` falls back to ALL specs in the default order - the
 * uncurated default guide, usable with zero setup. Pure (DOM via `doc`).
 */
export function resolveGuideSteps(
  orderedIds: string[] | undefined,
  specs: TaggedSpec[],
  doc: Document = document,
): ResolveResult {
  // Curated: map each id to its spec (or keep the bare id to report as dropped).
  // Uncurated: every spec, in default order.
  const ordered: Array<TaggedSpec | string> = orderedIds?.length
    ? orderedIds.map((id) => specs.find((s) => s.id === id) ?? id)
    : defaultGuideOrder(specs);

  const steps: ResolvedStep[] = [];
  const dropped: string[] = [];
  for (const item of ordered) {
    if (typeof item === "string") {
      dropped.push(item); // unknown id: no spec resolves it
      continue;
    }
    const match = matchElement(item.fingerprint, doc);
    if (!match.el) {
      dropped.push(item.id); // spec present but its element is absent on this page
      continue;
    }
    steps.push({ spec: item, el: match.el });
  }
  return { steps, dropped };
}
