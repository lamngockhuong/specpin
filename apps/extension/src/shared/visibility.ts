// Spec-visibility predicate and facet model. Pure functions, no DOM, no I/O, so
// the content orchestrator, the popup/side-panel filter UI, and the background
// cascade all consume one tested implementation. Backward-compat rule: an empty
// state means "everything visible" (today's behavior).

/** A facet key. One of:
 *  - `tag:<t>`   - the spec carries tag `<t>`
 *  - `file:<f>`  - the spec came from source file `<f>`
 *  - `spec:<id>` - the spec itself, by id
 *  - `url:<glob>` - a page-level gate matching the current path (not a spec property)
 */
export type FacetKey = string;

/** Personal override, persisted per browser profile in `storage.sync`. A
 *  force-show wins over a force-hide (and over a team hide, per the cascade). */
export interface PersonalVisibility {
  forceHide: FacetKey[];
  forceShow: FacetKey[];
}

/** The merged state the predicate consumes. `teamHidden` is the union of every
 *  serving connection's `.specs/views.json` hidden list (empty until Phase 5);
 *  `personal` is the user's local override. */
export interface VisibilityState {
  teamHidden: FacetKey[];
  personal: PersonalVisibility;
}

/** One row in the filter UI inventory. */
export interface FacetItem {
  key: FacetKey;
  /** Display label (the tag/file/title without the prefix). */
  label: string;
  /** How many specs in the current page carry this facet. */
  count: number;
  /** Effective on/off after the cascade (the checkbox state). */
  visible: boolean;
  /** The team default hides this key (drives the "hidden by team" marker). */
  teamHidden: boolean;
  /** A personal force-show/force-hide currently diverges from the team default. */
  overridden: boolean;
}

export interface FacetInventory {
  tags: FacetItem[];
  files: FacetItem[];
  specs: FacetItem[];
}

const EMPTY_PERSONAL: PersonalVisibility = { forceHide: [], forceShow: [] };

/** The empty (all-visible) state, shared by every caller that needs a default
 *  (orchestrator, content script, surface fetch) so the literal lives in one
 *  place. */
export const EMPTY_VISIBILITY: VisibilityState = {
  teamHidden: [],
  personal: { forceHide: [], forceShow: [] },
};

/** The facet keys a spec carries: its tags, source file, and id. Never a
 *  `url:` key (that gates the page, not the spec). */
export function specFacets(spec: { id: string; tags?: string[]; file?: string }): FacetKey[] {
  const keys: FacetKey[] = [];
  for (const tag of spec.tags ?? []) keys.push(`tag:${tag}`);
  if (spec.file) keys.push(`file:${spec.file}`);
  keys.push(`spec:${spec.id}`);
  return keys;
}

/** `effectiveDisabled = (teamHidden ∪ personalForceHide) \ personalForceShow`.
 *  A force-show removes its own key from the disabled set. */
export function effectiveDisabled(state: VisibilityState): Set<FacetKey> {
  const disabled = new Set<FacetKey>(state.teamHidden);
  for (const key of state.personal.forceHide) disabled.add(key);
  for (const key of state.personal.forceShow) disabled.delete(key);
  return disabled;
}

/** "*" matches a single path segment; "**" matches across segments. Path only
 *  (no query/hash). Both sides are normalized (trailing slash dropped except the
 *  root "/"). */
export function matchPathGlob(glob: string, path: string): boolean {
  const g = normalizePath(glob);
  const p = normalizePath(path);
  let re = "^";
  for (let i = 0; i < g.length; i += 1) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        re += ".*";
        i += 1;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c as string)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re).test(p);
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** True when the current page is gated off: some `url:` glob in the effective
 *  disabled set matches the path. A personal force-show of that `url:` key
 *  re-enables the page (handled by `effectiveDisabled`'s subtraction). */
export function pageHidden(url: string, state: VisibilityState): boolean {
  return pathGatedBy(effectiveDisabled(state), url);
}

/** Page-gate check against an already-built disabled set, so the per-spec render
 *  loop and the predicate do not rebuild the set just to test the gate. */
function pathGatedBy(disabled: Set<FacetKey>, url: string): boolean {
  const path = pathOf(url);
  for (const key of disabled) {
    if (key.startsWith("url:") && matchPathGlob(key.slice(4), path)) return true;
  }
  return false;
}

/** Positive per-spec page scope: a spec whose fingerprint carries a `pageUrl`
 *  glob renders only on paths that glob matches. A spec with no `pageUrl`
 *  (absent/null/empty) matches on any page (backward compatible). Distinct from
 *  the `url:` gate in {@link pageHidden}, which is a negative team/personal hide. */
export function pageScopeAllows(pageUrl: string | null | undefined, url: string): boolean {
  if (!pageUrl) return true;
  return matchPathGlob(pageUrl, pathOf(url));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // `url` may already be a bare path.
    return url || "/";
  }
}

/** A reusable predicate for one page render: it precomputes the disabled set and
 *  the page gate ONCE, then decides each spec cheaply. The render loop uses this
 *  to avoid rebuilding the set per spec; `isVisible` is the single-spec wrapper.
 *
 *  Decision: `!pageGate && ( spec:<id> ∈ forceShow || none of the spec's facets ∈
 *  effectiveDisabled )`. Cross-axis rule: a force-show of `spec:<id>` is a hard
 *  per-spec rescue over any `tag:`/`file:` hide; the page gate wins over all. */
export function makeVisibilityFilter(
  url: string,
  state: VisibilityState,
): (spec: { id: string; tags?: string[]; file?: string }) => boolean {
  const disabled = effectiveDisabled(state);
  const gated = pathGatedBy(disabled, url);
  const forceShow = new Set(state.personal.forceShow);
  return (spec) => {
    if (gated) return false;
    if (forceShow.has(`spec:${spec.id}`)) return true;
    return !specFacets(spec).some((key) => disabled.has(key));
  };
}

/** The visibility decision for one spec on the current page (convenience wrapper
 *  over {@link makeVisibilityFilter} for callers outside the render loop). */
export function isVisible(
  spec: { id: string; tags?: string[]; file?: string },
  url: string,
  state: VisibilityState,
): boolean {
  return makeVisibilityFilter(url, state)(spec);
}

/** Merge the raw per-connection team-hidden lists (hide-wins union) with the
 *  personal override into the state the predicate consumes. Pure, so Phase 5's
 *  background cascade is tested here with the rest of the keystone. */
export function buildVisibilityState(
  teamHiddenSets: FacetKey[][],
  personal: PersonalVisibility,
): VisibilityState {
  const teamHidden = [...new Set(teamHiddenSets.flat())];
  return { teamHidden, personal };
}

/** The next `PersonalVisibility` after toggling `key` to `visible`, expressed as
 *  a divergence from the team default:
 *  - default-on key, set hidden  -> add to forceHide
 *  - team-hidden key, set visible -> add to forceShow
 *  - returning to the team default removes the override entry (idempotent).
 */
export function toggleFacet(
  state: VisibilityState,
  key: FacetKey,
  visible: boolean,
): PersonalVisibility {
  const isTeamHidden = state.teamHidden.includes(key);
  const forceHide = state.personal.forceHide.filter((k) => k !== key);
  const forceShow = state.personal.forceShow.filter((k) => k !== key);
  if (visible && isTeamHidden) forceShow.push(key);
  if (!visible && !isTeamHidden) forceHide.push(key);
  return { forceHide, forceShow };
}

/** The next `PersonalVisibility` after a per-spec eye toggle. Unlike
 *  `toggleFacet` (same-key tri-state), this is a hard per-spec override that wins
 *  across axes: showing a spec hidden by a `tag:`/`file:` adds a `spec:<id>`
 *  force-show; hiding one visible by default adds a force-hide. It writes an entry
 *  only when the spec would not already be in the desired state at the team
 *  default, so returning to default stays clean. */
export function setSpecVisibility(
  spec: { id: string; tags?: string[]; file?: string },
  url: string,
  state: VisibilityState,
  visible: boolean,
): PersonalVisibility {
  const key = `spec:${spec.id}`;
  const forceHide = state.personal.forceHide.filter((k) => k !== key);
  const forceShow = state.personal.forceShow.filter((k) => k !== key);
  const cleared: VisibilityState = {
    teamHidden: state.teamHidden,
    personal: { forceHide, forceShow },
  };
  const visibleWhenCleared = isVisible(spec, url, cleared);
  if (visible && !visibleWhenCleared) forceShow.push(key);
  if (!visible && visibleWhenCleared) forceHide.push(key);
  return { forceHide, forceShow };
}

/** Build the facet checklist model for the filter UI: distinct tags/files/specs
 *  present in `specs`, each with a count and its effective on/off + markers. */
export function facetInventory(
  specs: Array<{ id: string; tags?: string[]; file?: string; title?: unknown }>,
  state: VisibilityState,
): FacetInventory {
  const disabled = effectiveDisabled(state);
  const teamHidden = new Set(state.teamHidden);
  const overridden = new Set([...state.personal.forceHide, ...state.personal.forceShow]);

  const tags = new Map<FacetKey, { label: string; count: number }>();
  const files = new Map<FacetKey, { label: string; count: number }>();
  const specRows = new Map<FacetKey, { label: string; count: number }>();

  for (const spec of specs) {
    for (const tag of spec.tags ?? []) bump(tags, `tag:${tag}`, tag);
    if (spec.file) bump(files, `file:${spec.file}`, spec.file);
    bump(specRows, `spec:${spec.id}`, specTitle(spec));
  }

  const toItems = (m: Map<FacetKey, { label: string; count: number }>): FacetItem[] =>
    [...m.entries()]
      .map(([key, { label, count }]) => ({
        key,
        label,
        count,
        visible: !disabled.has(key),
        teamHidden: teamHidden.has(key),
        overridden: overridden.has(key),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return { tags: toItems(tags), files: toItems(files), specs: toItems(specRows) };
}

function bump(map: Map<FacetKey, { label: string; count: number }>, key: FacetKey, label: string) {
  const existing = map.get(key);
  if (existing) existing.count += 1;
  else map.set(key, { label, count: 1 });
}

function specTitle(spec: { id: string; title?: unknown }): string {
  const t = spec.title;
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    const values = Object.values(t as Record<string, unknown>);
    const first = values.find((v) => typeof v === "string");
    if (typeof first === "string") return first;
  }
  return spec.id;
}

export { EMPTY_PERSONAL };
