import { browser } from "#imports";
import { pickLocale } from "../content/localize-spec.js";
import { getLocale } from "./config.js";
import { type SpecsForOrigin, type StatusResult, sendToBackground } from "./messaging.js";
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
}

/** Assemble everything `renderFilters` needs from a fetched surface state. */
export function buildFilterModel(specs: SpecsForOrigin, path: string): FilterModel {
  const state = visibilityOf(specs);
  const inventory = facetInventory(
    specs.specs.map((s) => ({ id: s.id, tags: s.tags, file: s._file, title: s.title })),
    state,
  );
  const hasOverrides = state.personal.forceHide.length > 0 || state.personal.forceShow.length > 0;
  return { inventory, state, path, pageHidden: pageHiddenFor(path, state), hasOverrides };
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
