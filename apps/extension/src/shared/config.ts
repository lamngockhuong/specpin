import type { SpecsResponse } from "@specpin/api-client";
import type { DisplayMode } from "@specpin/spec-schema";
import { browser } from "#imports";
import type { Connection } from "./connection-types.js";
import type { PersonalVisibility } from "./visibility.js";

export type { Connection } from "./connection-types.js";

// Connection config + on/off flag, persisted in extension storage. The token
// and URL are pasted once into the Options page from the sidecar's stdout.
export interface ConnectionConfig {
  baseUrl: string;
  token: string;
}

// Manual-import specs (validated in the Options page), persisted so they survive
// a browser restart. `seq` orders concurrent writes; the background applies a
// SET_LOCAL_SPECS only when its seq is newer than the last applied one.
export interface LocalSpecsState {
  specs: SpecsResponse;
  seq: number;
}

const CONFIG_KEY = "specpin:config";
const CONNECTIONS_KEY = "specpin:connections";
const ENABLED_KEY = "specpin:enabled";
export const LOCAL_SPECS_KEY = "specpin:localSpecs";
const LOCALE_KEY = "specpin:locale";
const DISPLAY_MODE_KEY = "specpin:displayMode";
export const SURFACE_KEY = "specpin:defaultSurface";
/** Personal visibility override. In `storage.sync` (not local) so a user's
 *  show/hide choices follow them across machines on the same browser profile. */
export const VISIBILITY_KEY = "specpin:visibility";

/** Which surface a toolbar-icon click opens. Honored on Chrome only (the
 *  background applies it via chrome.action.setPopup + sidePanel behavior);
 *  Firefox always opens the popup from the toolbar and the sidebar from its
 *  native toggle. */
export type DefaultSurface = "popup" | "sidepanel";

export async function getConfig(): Promise<ConnectionConfig | null> {
  const stored = await browser.storage.local.get(CONFIG_KEY);
  const value = stored[CONFIG_KEY] as ConnectionConfig | undefined;
  if (value?.baseUrl && value?.token) return value;
  return null;
}

export async function setConfig(config: ConnectionConfig): Promise<void> {
  await browser.storage.local.set({ [CONFIG_KEY]: config });
}

/** The list of sidecar connections (native storage format, no legacy migration:
 *  a fresh install has none and the Options UI populates it). */
export async function getConnections(): Promise<Connection[]> {
  const stored = await browser.storage.local.get(CONNECTIONS_KEY);
  const value = stored[CONNECTIONS_KEY] as Connection[] | undefined;
  return Array.isArray(value) ? value : [];
}

export async function setConnections(connections: Connection[]): Promise<void> {
  await browser.storage.local.set({ [CONNECTIONS_KEY]: connections });
}

export async function getEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(ENABLED_KEY);
  const value = stored[ENABLED_KEY] as boolean | undefined;
  return value ?? true; // default on
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [ENABLED_KEY]: enabled });
}

/** The viewer's chosen UI locale for rendering spec text, or null if unset.
 *  Resolution to a concrete locale (stored -> manifest defaultLocale -> "en")
 *  is done by `pickLocale` at the render site. */
export async function getLocale(): Promise<string | null> {
  const stored = await browser.storage.local.get(LOCALE_KEY);
  return (stored[LOCALE_KEY] as string | undefined) ?? null;
}

export async function setLocale(locale: string): Promise<void> {
  await browser.storage.local.set({ [LOCALE_KEY]: locale });
}

/** The viewer's forced display mode, or null for per-spec mode (each spec uses
 *  its own preferredDisplayMode). Persisted so the choice survives popup close,
 *  side-panel re-render, and page reload (the content script reads it on init). */
export async function getDisplayMode(): Promise<DisplayMode | null> {
  const stored = await browser.storage.local.get(DISPLAY_MODE_KEY);
  return (stored[DISPLAY_MODE_KEY] as DisplayMode | undefined) ?? null;
}

export async function setDisplayMode(mode: DisplayMode | null): Promise<void> {
  // null = per-spec mode: drop the key so a default profile carries nothing.
  if (mode === null) {
    await browser.storage.local.remove(DISPLAY_MODE_KEY);
    return;
  }
  await browser.storage.local.set({ [DISPLAY_MODE_KEY]: mode });
}

/** The toolbar-click surface preference (default "popup" preserves today's
 *  behavior on a fresh install). */
export async function getDefaultSurface(): Promise<DefaultSurface> {
  const stored = await browser.storage.local.get(SURFACE_KEY);
  return (stored[SURFACE_KEY] as DefaultSurface | undefined) ?? "popup";
}

export async function setDefaultSurface(surface: DefaultSurface): Promise<void> {
  await browser.storage.local.set({ [SURFACE_KEY]: surface });
}

/** The personal visibility override from `storage.sync`, defaulting to empty
 *  (which the predicate treats as "all visible"). */
export async function getPersonalVisibility(): Promise<PersonalVisibility> {
  const stored = await browser.storage.sync.get(VISIBILITY_KEY);
  const value = stored[VISIBILITY_KEY] as PersonalVisibility | undefined;
  return { forceHide: value?.forceHide ?? [], forceShow: value?.forceShow ?? [] };
}

/** Persist the personal visibility override to `storage.sync`. An empty override
 *  removes the key entirely so the stored payload stays small (sync caps item
 *  size at ~8KB) and a default profile carries nothing. */
export async function setPersonalVisibility(visibility: PersonalVisibility): Promise<void> {
  if (visibility.forceHide.length === 0 && visibility.forceShow.length === 0) {
    await browser.storage.sync.remove(VISIBILITY_KEY);
    return;
  }
  await browser.storage.sync.set({ [VISIBILITY_KEY]: visibility });
}

export async function getLocalSpecs(): Promise<LocalSpecsState | null> {
  const stored = await browser.storage.local.get(LOCAL_SPECS_KEY);
  return (stored[LOCAL_SPECS_KEY] as LocalSpecsState | undefined) ?? null;
}

export async function setLocalSpecs(state: LocalSpecsState | null): Promise<void> {
  if (state === null) {
    await browser.storage.local.remove(LOCAL_SPECS_KEY);
    return;
  }
  await browser.storage.local.set({ [LOCAL_SPECS_KEY]: state });
}
