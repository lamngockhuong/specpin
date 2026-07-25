import type { Transition } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import type { CaptureBufferEntry } from "../shared/messaging.js";
import type { Graph, GraphEdge, GraphNode } from "./config-to-graph.js";
import { dropDanglingEdges, urlGlobCategory } from "./config-to-graph.js";

// Phase B3: overlay the Track B auto-capture draft buffer onto the committed
// screens Graph as pending "ghost" nodes/edges, for the graph panel's inline
// review. Pure -- no DOM, no messaging -- so the overlay itself is unit-
// testable independent of the panel wiring (main.ts renders whatever this
// returns through the SAME layoutGraph/renderGraphSvg path as the committed
// graph; graph-svg.ts just adds a style hook keyed on `.pending`).
//
// Only meaningful for the SCREENS dataset: auto-capture observes navigation
// between screens, never a flow-state change, so callers should only invoke
// this when the panel is showing `screensToGraph(...)`, never `flowsToGraph`.

/** Resolve a captured transition's trigger label the same way
 *  config-to-graph.ts's `edgeFrom` does, falling back to the transition id. */
function triggerLabel(
  trigger: Transition["trigger"],
  locale: string,
  defaultLocale?: string,
): string {
  return resolveLocalized(trigger, locale, defaultLocale) || "";
}

/** Overlay `buffer` (one project's draft capture entries) onto `committed`
 *  (that project's current screensToGraph output). An entry is skipped
 *  entirely when its transition id is ALREADY a committed edge (a stale
 *  buffer entry -- approved elsewhere, or on a prior load of this panel). A
 *  candidate screen (`entry.from`/`entry.to`) is skipped as a ghost NODE when
 *  its id OR urlGlob already names a committed node -- the same identity-
 *  clash rule graph-write-back.ts's merge applies on write, so the overlay
 *  never promises a ghost node approve would not actually create. Only the
 *  EDGE is pending in that case; its endpoints resolve to the existing node. */
export function overlayGhostBuffer(
  committed: Graph,
  buffer: readonly CaptureBufferEntry[],
  locale: string,
  defaultLocale?: string,
): Graph {
  const committedNodeIds = new Set(committed.nodes.map((n) => n.id));
  const committedEdgeIds = new Set(committed.edges.map((e) => e.id));
  const committedUrlGlobToId = new Map(
    committed.nodes
      .filter((n): n is GraphNode & { urlGlob: string } => Boolean(n.urlGlob))
      .map((n) => [n.urlGlob, n.id]),
  );

  const ghostNodes = new Map<string, GraphNode>();
  const ghostEdges = new Map<string, GraphEdge>();
  // Candidate id -> the node id its ghost edge should reference: itself when a
  // fresh ghost node was added, or the existing node's id when the candidate's
  // urlGlob collided with an already-committed screen.
  const resolvedId = new Map<string, string>();

  for (const entry of buffer) {
    if (committedEdgeIds.has(entry.transition.id)) continue;

    for (const candidate of [entry.from, entry.to]) {
      if (resolvedId.has(candidate.id)) continue;
      if (committedNodeIds.has(candidate.id)) {
        resolvedId.set(candidate.id, candidate.id);
        continue;
      }
      const existingByUrlGlob = committedUrlGlobToId.get(candidate.urlGlob);
      if (existingByUrlGlob) {
        resolvedId.set(candidate.id, existingByUrlGlob);
        continue;
      }
      resolvedId.set(candidate.id, candidate.id);
      if (!ghostNodes.has(candidate.id)) {
        ghostNodes.set(candidate.id, {
          id: candidate.id,
          label: candidate.name,
          category: urlGlobCategory(candidate.urlGlob),
          specId: null,
          urlGlob: candidate.urlGlob,
          pending: true,
        });
      }
    }

    const from = resolvedId.get(entry.transition.from) ?? entry.transition.from;
    const to = resolvedId.get(entry.transition.to) ?? entry.transition.to;
    ghostEdges.set(entry.transition.id, {
      id: entry.transition.id,
      from,
      to,
      label: triggerLabel(entry.transition.trigger, locale, defaultLocale) || entry.transition.id,
      guard: entry.transition.guard ?? null,
      role: entry.transition.role ?? null,
      specId: entry.transition.specId ?? null,
      pending: true,
    });
  }

  const nodes = [...committed.nodes, ...ghostNodes.values()];
  const edges = dropDanglingEdges(nodes, [...committed.edges, ...ghostEdges.values()]);
  return { nodes, edges };
}
