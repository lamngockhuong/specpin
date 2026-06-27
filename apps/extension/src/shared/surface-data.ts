import { browser } from "#imports";
import { pickLocale } from "../content/localize-spec.js";
import { getLocale } from "./config.js";
import { type SpecsForOrigin, type StatusResult, sendToBackground } from "./messaging.js";

// Single source of truth for the surface fetch sequence shared by the popup and
// the side panel: query the active tab origin, pull status + specs, and resolve
// the viewer locale. Pure data (no DOM), so each surface renders it its own way.

export interface SurfaceState {
  status: StatusResult;
  specs: SpecsForOrigin;
  /** The active tab's origin, or "" when it has no resolvable URL. */
  origin: string;
  /** Concrete locale to render with (stored -> manifest default -> "en"). */
  activeLocale: string;
}

/** Origin of the active tab in the current window, or "" if not resolvable. */
export async function activeOrigin(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    return tab?.url ? new URL(tab.url).origin : "";
  } catch {
    return "";
  }
}

/** Fetch the full surface state in one call. Both the popup and the side panel
 *  use this so the status/specs/locale sequence has a single definition. */
export async function fetchSurfaceState(): Promise<SurfaceState> {
  const status = await sendToBackground<StatusResult>({ type: "GET_STATUS" });
  const origin = await activeOrigin();
  const specs = await sendToBackground<SpecsForOrigin>({ type: "GET_SPECS_FOR_ORIGIN", origin });
  const activeLocale = pickLocale(await getLocale(), specs.manifest?.settings?.defaultLocale);
  return { status, specs, origin, activeLocale };
}
