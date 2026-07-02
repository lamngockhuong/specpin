import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { pickLocale } from "../content/localize-spec.js";
import { t } from "../i18n/index.js";
import { getLocale, getSeen, setSeen } from "./config.js";
import type { TaggedSpec } from "./connection-types.js";
import { localConnId } from "./local-id.js";
import { stripMarkdown } from "./markdown.js";
import {
  type MatchedIds,
  type MatchReportEntry,
  queryActiveTab,
  type SpecsForOrigin,
  type StatusResult,
  sendToBackground,
} from "./messaging.js";
import { connectionServesOrigin, manualSummaryServesOrigin } from "./origin-match.js";
import type { ExportTarget } from "./project-actions.js";
import {
  EMPTY_VISIBILITY,
  type FacetInventory,
  type FacetKey,
  facetInventory,
  type PersonalVisibility,
  pageHidden as pageHiddenFor,
  toggleFacet,
  type VisibilityState,
} from "./visibility.js";

// Single source of truth for the surface fetch sequence shared by the popup and
// the side panel: query the active tab origin, pull status + specs, and resolve
// the viewer locale. Pure data (no DOM), so each surface renders it its own way.

export interface SurfaceState {
  status: StatusResult;
  specs: SpecsForOrigin;
  /** The active tab's origin, or "" when it has no resolvable URL. */
  origin: string;
  /** The active tab's path (for the "This page" URL filter), or "/" if unknown. */
  path: string;
  /** Concrete locale to render with (stored -> manifest default -> "en"). */
  activeLocale: string;
}

/** The active tab's full URL in the current window, or "" when unresolvable. The
 *  single active-tab lookup that `activeLocation`/`activeOrigin`/`activeTabUrl`
 *  share, so the `tabs.query` shape lives in one place. */
async function activeTabHref(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? "";
}

/** Origin + path of the active tab in the current window. */
export async function activeLocation(): Promise<{ origin: string; path: string }> {
  const href = await activeTabHref();
  try {
    if (!href) return { origin: "", path: "/" };
    const url = new URL(href);
    return { origin: url.origin, path: url.pathname };
  } catch {
    return { origin: "", path: "/" };
  }
}

/** Origin of the active tab in the current window, or "" if not resolvable. */
export async function activeOrigin(): Promise<string> {
  return (await activeLocation()).origin;
}

/** Full URL of the active tab in the current window, or "" when unresolvable. A
 *  deep link needs the whole URL (query + any app fragment), not just the
 *  origin + path `activeLocation` returns, so `buildSpecLink` preserves them. */
export async function activeTabUrl(): Promise<string> {
  return activeTabHref();
}

/** Fetch the full surface state in one call. Both the popup and the side panel
 *  use this so the status/specs/locale sequence has a single definition. */
export async function fetchSurfaceState(): Promise<SurfaceState> {
  const status = await sendToBackground<StatusResult>({ type: "GET_STATUS" });
  const { origin, path } = await activeLocation();
  const specs = await sendToBackground<SpecsForOrigin>({ type: "GET_SPECS_FOR_ORIGIN", origin });
  const activeLocale = pickLocale(await getLocale(), specs.manifest?.settings?.defaultLocale);
  return { status, specs, origin, path, activeLocale };
}

/** The spec-list scope: only the specs pinned to the current page, or the full
 *  origin set. Both surfaces default to "page"; the toggle switches to "all". */
export type SpecScope = "page" | "all";

/** The active tab's match state in one round trip: the matched-id Set (for the
 *  "This page" scope) and the full per-spec `report` (for match health), or null
 *  when no content script could answer (unsupported tab) so callers fall back.
 *  Both surfaces fetch this once instead of querying GET_MATCHED_IDS twice. */
export interface MatchState {
  /** Matched-id membership Set, or null when unknown (no content script). */
  ids: Set<string> | null;
  /** Per-spec match report, or null when unknown. */
  report: MatchReportEntry[] | null;
}

/** Fetch the active tab's match state (ids + report) in a single query. Returns a
 *  Set for O(1) `ids` membership, or null when no content script could answer
 *  (unsupported tab) so callers fall back to the full list. An empty Set (page
 *  pins none) is distinct from null. */
export async function fetchMatchState(): Promise<MatchState> {
  const res = await queryActiveTab<MatchedIds>({ type: "GET_MATCHED_IDS" });
  return { ids: res ? new Set(res.ids) : null, report: res?.report ?? null };
}

/** Page-level match health derived from a `report`: totals per match tier plus
 *  the orphaned count. `needsReview` is a distinct axis (a matched-but-low-
 *  confidence spec); today the MVP matcher only marks unmatched specs for review,
 *  so it stays 0 until the weighted scorer lands. Pure, DOM-free, unit-tested. */
export interface PageHealth {
  total: number;
  exact: number;
  fuzzy: number;
  needsReview: number;
  orphaned: number;
}

export function pageHealth(report: MatchReportEntry[]): PageHealth {
  let exact = 0;
  let fuzzy = 0;
  let needsReview = 0;
  let orphaned = 0;
  for (const e of report) {
    if (!e.matched) {
      orphaned += 1;
      continue;
    }
    if (e.needsReview) needsReview += 1;
    if (e.strategy === "exact") exact += 1;
    else if (e.strategy === "css") fuzzy += 1;
  }
  return { total: report.length, exact, fuzzy, needsReview, orphaned };
}

/** The orphaned specs: report entries whose fingerprint matched no element on the
 *  current page. The report is already page-scoped upstream (content.ts gates it
 *  by `pageScopeAllows`), so a spec that fails only because it targets another
 *  route never enters the report — no extra url/visibility argument is needed. */
export function orphanedSpecs(report: MatchReportEntry[]): MatchReportEntry[] {
  return report.filter((e) => !e.matched);
}

/** Scope a spec list to the current page. "all" (or an unknown match set, i.e.
 *  `matchedIds === null`) returns the input untouched; "page" keeps only specs
 *  whose id is in the current render's match set. Pure, so both surfaces share
 *  one tested implementation and it runs before the search filter. */
export function scopeSpecs<T extends { id: string }>(
  specs: T[],
  scope: SpecScope,
  matchedIds: Set<string> | null,
): T[] {
  if (scope === "all" || matchedIds === null) return specs;
  return specs.filter((s) => matchedIds.has(s.id));
}

/** Case-insensitive match of a search query against a spec's localized title,
 *  file path, and tags (plus the localized description when `includeBody`). A
 *  blank query matches everything. Pure, so both surfaces share one predicate
 *  and it is unit-testable without a DOM. */
export function specMatchesQuery(
  spec: TaggedSpec,
  query: string,
  locale: string,
  defaultLocale: string | undefined,
  includeBody = false,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    resolveLocalized(spec.title, locale, defaultLocale),
    spec._file,
    ...(spec.tags ?? []),
    // Description carries a Markdown subset; strip it so a query matches the
    // visible text the reader sees, not the markup (e.g. "bold" hits "**bold**").
    ...(includeBody
      ? [stripMarkdown(resolveLocalized(spec.description, locale, defaultLocale) ?? "")]
      : []),
  ];
  return haystack.some((s) => s?.toLowerCase().includes(q));
}

/** The projects serving `origin` that can be exported, one entry per project: the
 *  local batches (their stored bundle) plus the connected sidecars (their live
 *  cache). Ids use the connection-id form so the background routes each to the
 *  right source; the display name carries a `(manual)`/`(sidecar)` provenance
 *  suffix to disambiguate the picker. Pure data, so both surfaces build the same
 *  list one way. */
export function buildExportTargets(status: StatusResult, origin: string): ExportTarget[] {
  const local = (status.manualBatches ?? [])
    // A disabled batch serves no page, so it is not a page-level export target
    // (the Options per-batch Export still reaches it by id).
    .filter((b) => manualSummaryServesOrigin(b, origin))
    .map((b) => ({
      id: localConnId(b.id),
      project: `${b.project || b.label} (${t("common.sourceManual")})`,
    }));
  const sidecar = (status.connections ?? [])
    .filter((c) => c.connected && connectionServesOrigin(c, origin))
    .map((c) => ({
      id: c.id,
      project: `${c.label || c.project || c.baseUrl} (${t("common.sourceSidecar")})`,
    }));
  return [...local, ...sidecar];
}

/** The visibility cascade state carried by a specs response, or the empty
 *  (all-visible) default. */
export function visibilityOf(specs: SpecsForOrigin): VisibilityState {
  return specs.visibility ?? EMPTY_VISIBILITY;
}

export interface FilterModel {
  inventory: FacetInventory;
  state: VisibilityState;
  path: string;
  pageHidden: boolean;
  hasOverrides: boolean;
  /** Specpin's master on/off. The whole filter block is hidden when off (nothing
   *  renders to filter), independent of any cached facets. */
  enabled: boolean;
}

/** Assemble everything `renderFilters` needs from a fetched surface state. */
export function buildFilterModel(specs: SpecsForOrigin, path: string): FilterModel {
  const state = visibilityOf(specs);
  const inventory = facetInventory(
    specs.specs.map((s) => ({ id: s.id, tags: s.tags, file: s._file, title: s.title })),
    state,
  );
  const hasOverrides = state.personal.forceHide.length > 0 || state.personal.forceShow.length > 0;
  return {
    inventory,
    state,
    path,
    pageHidden: pageHiddenFor(path, state),
    hasOverrides,
    enabled: specs.enabled,
  };
}

/** Apply a facet toggle: compute the next personal override and persist it via
 *  the background (debounced write). The caller refreshes afterward. */
export async function applyFacetToggle(
  state: VisibilityState,
  key: FacetKey,
  visible: boolean,
): Promise<void> {
  const next: PersonalVisibility = toggleFacet(state, key, visible);
  await sendToBackground({ type: "SET_PERSONAL_VISIBILITY", visibility: next });
}

/** Clear all personal overrides (Reset control). */
export async function resetPersonalVisibility(): Promise<void> {
  await sendToBackground({
    type: "SET_PERSONAL_VISIBILITY",
    visibility: { forceHide: [], forceShow: [] },
  });
}

// ---------------------------------------------------------------------------
// What-changed digest: pure, DOM-free content hashing + diff over a per-project
// snapshot kept in storage.local (getSeen/setSeen in config.ts). Unit-tested.
// ---------------------------------------------------------------------------

/** The stored snapshot: `<project>\0<specId>` -> content hash. Keyed by project
 *  so one project's edits never blur another's. */
export type SeenSnapshot = Record<string, string>;

/** The added / edited / removed buckets from comparing the current specs to a
 *  snapshot. `removed` is scoped to projects present on the page (a snapshot key
 *  for a project not currently loaded is just off-page, not a removal). */
export interface SeenDiff {
  added: TaggedSpec[];
  edited: TaggedSpec[];
  removed: string[];
}

const SEEN_KEY_SEP = "\u0000";

/** The snapshot key for a spec: project + id (NUL-separated). */
export function seenKey(spec: Pick<TaggedSpec, "project" | "id">): string {
  return `${spec.project}${SEEN_KEY_SEP}${spec.id}`;
}

/** The project portion of a snapshot key. */
function seenKeyProject(key: string): string {
  return key.slice(0, key.indexOf(SEEN_KEY_SEP));
}

/** Deterministic JSON with recursively sorted object keys, so an incidental key
 *  reorder in a LocalizedString never fabricates a change. Arrays keep their
 *  order (reordering business rules IS a content change). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/** FNV-1a (32-bit) over a string, as an 8-char hex digest. Non-crypto: this is
 *  change detection, not security, so a fast, dependency-free hash is enough. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Content hash of a spec over `title` + `description` + `businessRules` only,
 *  hashed as the raw `LocalizedString` objects across ALL locales (a translation
 *  edit in any locale counts as changed). Locale-agnostic — no locale param — so
 *  switching the viewer language never fabricates a diff. `_file`, tags, and
 *  metadata are excluded to avoid churn noise. */
export function specContentHash(
  spec: Pick<TaggedSpec, "title" | "description" | "businessRules">,
): string {
  return fnv1a(
    stableStringify({
      title: spec.title,
      description: spec.description,
      businessRules: spec.businessRules ?? [],
    }),
  );
}

/** Compare the current specs to a snapshot: a spec absent from the snapshot is
 *  `added`, a spec whose hash differs is `edited`, and a snapshot key whose spec
 *  is gone (for a project present on the page) is `removed`. Pure. */
export function diffSeen(specs: TaggedSpec[], snapshot: SeenSnapshot): SeenDiff {
  const added: TaggedSpec[] = [];
  const edited: TaggedSpec[] = [];
  const present = new Set<string>();
  const projectsOnPage = new Set<string>();
  for (const spec of specs) {
    const key = seenKey(spec);
    present.add(key);
    projectsOnPage.add(spec.project);
    const prev = snapshot[key];
    if (prev === undefined) added.push(spec);
    else if (prev !== specContentHash(spec)) edited.push(spec);
  }
  const removed = Object.keys(snapshot).filter(
    (k) => !present.has(k) && projectsOnPage.has(seenKeyProject(k)),
  );
  return { added, edited, removed };
}

/** Merge the current specs' hashes into a prior snapshot: refresh/insert every
 *  current spec and drop stale keys for projects present on the page (true
 *  removals), while leaving other projects' entries untouched. Used both to seed
 *  a first-seen project silently and to persist "Mark all seen". Pure. */
export function mergeSeen(prev: SeenSnapshot, specs: TaggedSpec[]): SeenSnapshot {
  const projectsOnPage = new Set(specs.map((s) => s.project));
  const next: SeenSnapshot = {};
  for (const [k, v] of Object.entries(prev)) {
    if (!projectsOnPage.has(seenKeyProject(k))) next[k] = v;
  }
  for (const spec of specs) next[seenKey(spec)] = specContentHash(spec);
  return next;
}

/** The set of projects that already have at least one entry in the snapshot, so a
 *  surface can silently seed a first-seen project instead of flagging all its
 *  specs as new. */
export function knownProjects(snapshot: SeenSnapshot): Set<string> {
  const projects = new Set<string>();
  for (const key of Object.keys(snapshot)) projects.add(seenKeyProject(key));
  return projects;
}

/** Compute the digest for the current specs against the stored snapshot, silently
 *  seeding any first-seen project (so a newly-connected project never reads as
 *  "everything new", including the first-ever visit with an empty snapshot).
 *  Returns null when there is nothing to show (Specpin off, or no specs). Persists
 *  the seed when it seeds. The seed-then-diff sequence lives here so both surfaces
 *  share it. */
export async function computeSeenDigest(
  specs: TaggedSpec[],
  enabled: boolean,
): Promise<SeenDiff | null> {
  if (!enabled || specs.length === 0) return null;
  const seen = await getSeen();
  const known = knownProjects(seen);
  const fresh = specs.filter((s) => !known.has(s.project));
  let effective = seen;
  if (fresh.length) {
    effective = mergeSeen(seen, fresh);
    await setSeen(effective);
  }
  return diffSeen(specs, effective);
}

/** Persist the current specs as the seen baseline (the "Mark all seen" action),
 *  merged so other projects' snapshot entries survive. */
export async function markAllSeen(specs: TaggedSpec[]): Promise<void> {
  await setSeen(mergeSeen(await getSeen(), specs));
}
