import type { FlowsConfig, Screen, ScreensConfig, Transition } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";

// Pure config -> graph derivation for the graph panel (Phase 5). No DOM, no
// layout: just the node/edge shape both `flows.json` and `screens.json` reduce
// to, so the dagre adapter and the SVG renderer share one input type regardless
// of which config produced it.

/** One graph node, whichever config it came from. `category` is the v1 grouping
 *  key (flows: the parent Flow's `object` label; screens: the urlGlob's top
 *  segment) that feeds the category filter tabs. `kind` only applies to flow
 *  states (initial/normal/terminal); screens leave it undefined. */
export interface GraphNode {
  id: string;
  label: string;
  category: string;
  kind?: "initial" | "normal" | "terminal";
  /** The pinned element this node represents, for the specId-click hook
   *  (Phase 6 highlights it on the original tab). Null when the node has none. */
  specId: string | null;
  /** Screens only: the URL glob that identifies the screen in the live UI, shown
   *  as a hint when the element isn't resolvable on the current page. */
  urlGlob?: string;
}

/** One directed edge, whichever config it came from: a flow Transition (state ->
 *  state) or a screens Transition (screen -> screen). Both configs share the
 *  same `Transition` shape, so this is a straight field mapping once `from`/`to`
 *  are resolved to this graph's node ids. */
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  guard: string | null;
  role: string | null;
  specId: string | null;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Drop any edge whose `from`/`to` references a node id absent from `nodes`. The
 *  schema does not enforce that a Transition's endpoints exist among the
 *  states/screens (referential integrity is a runtime concern), so a hand-edited
 *  config can carry a dangling edge; rendering it would draw a line to nothing. */
function dropDanglingEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}

function edgeFrom(
  t: Transition,
  id: string,
  from: string,
  to: string,
  locale: string,
  defaultLocale?: string,
): GraphEdge {
  return {
    id,
    from,
    to,
    label: resolveLocalized(t.trigger, locale, defaultLocale) || t.id,
    guard: t.guard ?? null,
    role: t.role ?? null,
    specId: t.specId ?? null,
  };
}

/** `.specs/flows.json` -> graph. A file holds several independent FSMs (one per
 *  object type); state ids are only unique WITHIN their own Flow (per the
 *  schema), so every node/edge id is prefixed `${flow.id}:` before merging every
 *  flow's states/transitions into one graph -- otherwise two flows that happen to
 *  both use "draft" as a state id would collide. */
export function flowsToGraph(config: FlowsConfig, locale: string, defaultLocale?: string): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const flow of config.flows) {
    const category = resolveLocalized(flow.object, locale, defaultLocale) || flow.id;
    for (const state of flow.states) {
      nodes.push({
        id: `${flow.id}:${state.id}`,
        label: resolveLocalized(state.label, locale, defaultLocale) || state.id,
        category,
        kind: state.kind,
        specId: state.specId ?? null,
      });
    }
    for (const t of flow.transitions) {
      edges.push(
        edgeFrom(
          t,
          `${flow.id}:${t.id}`,
          `${flow.id}:${t.from}`,
          `${flow.id}:${t.to}`,
          locale,
          defaultLocale,
        ),
      );
    }
  }
  return { nodes, edges: dropDanglingEdges(nodes, edges) };
}

/** Group a Screen's urlGlob by its top path segment (v1 category rule from the
 *  phase spec): "/checkout/*" -> "checkout", "/deals/new" -> "deals". A glob with
 *  no concrete first segment (the bare root "/" or an all-wildcard "/*") falls
 *  back to "root" rather than an empty string, which would render as a blank
 *  filter tab. */
export function urlGlobCategory(urlGlob: string): string {
  const segments = urlGlob.split("/").filter(Boolean);
  if (segments.length === 0) return "root";
  const first = segments[0].replace(/[*?[\]{}]/g, "");
  return first || "root";
}

/** `.specs/screens.json` -> graph. Unlike flows, the file holds one flat
 *  screens/transitions list, so ids are already globally unique -- no prefixing
 *  needed. */
export function screensToGraph(
  config: ScreensConfig,
  locale: string,
  defaultLocale?: string,
): Graph {
  const nodes: GraphNode[] = config.screens.map((s: Screen) => ({
    id: s.id,
    label: resolveLocalized(s.name, locale, defaultLocale) || s.id,
    category: urlGlobCategory(s.urlGlob),
    specId: s.specIds?.[0] ?? null,
    urlGlob: s.urlGlob,
  }));
  const edges: GraphEdge[] = config.transitions.map((t) =>
    edgeFrom(t, t.id, t.from, t.to, locale, defaultLocale),
  );
  return { nodes, edges: dropDanglingEdges(nodes, edges) };
}
