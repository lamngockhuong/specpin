import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { pickLocale } from "../content/localize-spec.js";
import { t } from "../i18n/index.js";
import { getLocale } from "./config.js";
import type { TaggedSpec } from "./connection-types.js";
import { localConnId } from "./local-id.js";
import { stripMarkdown } from "./markdown.js";
import { type SpecsForOrigin, type StatusResult, sendToBackground } from "./messaging.js";
import { connectionServesOrigin, originMatchesDomains } from "./origin-match.js";
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

/** Origin + path of the active tab in the current window. */
export async function activeLocation(): Promise<{ origin: string; path: string }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    if (!tab?.url) return { origin: "", path: "/" };
    const url = new URL(tab.url);
    return { origin: url.origin, path: url.pathname };
  } catch {
    return { origin: "", path: "/" };
  }
}

/** Origin of the active tab in the current window, or "" if not resolvable. */
export async function activeOrigin(): Promise<string> {
  return (await activeLocation()).origin;
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
    .filter((b) => originMatchesDomains(origin, b.domains))
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
