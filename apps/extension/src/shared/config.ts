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

/** One Manual-import, kept as its own removable unit. Persisted in storage.local.
 *  Each paste/file-pick appends one of these so several imports coexist (was a
 *  single overwrite slot). */
export interface ManualBatch {
  /** Stable unique id for remove/dedup. Assigned by the background on add
   *  (crypto.randomUUID()); the legacy migration also gets a fresh uuid. */
  id: string;
  /** Display label: manifest.project, else first file name, else "Pasted bundle". */
  label: string;
  /** How it was imported (drives the row subtitle). */
  source: "paste" | "files";
  /** Base names of picked files (files source only), for the row subtitle. */
  fileNames?: string[];
  /** Epoch ms when added (display only; do not use for ordering). */
  importedAt: number;
  /** The validated bundle: manifest + flattened specs (unchanged shape). */
  specs: SpecsResponse;
}

// Manual-import state: an ordered list of batches, persisted so they survive a
// browser restart. No `seq` version guard: an append model cannot drop a stale
// write losslessly, so concurrency is serialized by the background's mutate()
// chain with the registry set unconditionally from storage truth (single writer).
export interface LocalSpecsState {
  batches: ManualBatch[];
}

/** Aggregate guard so an append-only list cannot exhaust storage.local quota or
 *  balloon specsForOrigin. MAX_SPECS in local-bundle.ts already caps one bundle's
 *  spec count; this caps the batch COUNT. */
export const MAX_MANUAL_BATCHES = 50;

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
  return normalizeLocalSpecsState(stored[LOCAL_SPECS_KEY] as unknown);
}

/** Minimal shape guard for a stored batch: object with string id/label and a
 *  bundle carrying a `specs` array. Shape-only by design (the bundle was
 *  schema-validated at import time, and storage.local is extension-origin-trusted,
 *  so re-running the full schema validator on read adds little). */
export function isManualBatch(x: unknown): x is ManualBatch {
  if (!x || typeof x !== "object") return false;
  const b = x as { id?: unknown; label?: unknown; specs?: unknown };
  if (typeof b.id !== "string" || typeof b.label !== "string") return false;
  const specs = b.specs as { specs?: unknown } | undefined;
  return !!specs && typeof specs === "object" && Array.isArray(specs.specs);
}

/** Accept both the new list shape and the legacy single-bundle shape
 *  ({ specs: SpecsResponse; seq }). Returns null when nothing usable is stored.
 *  Pure (no storage writes): the background persists a legacy upgrade separately.
 *  `makeId` is injected so the function stays deterministic in tests; the
 *  background passes () => crypto.randomUUID(). */
export function normalizeLocalSpecsState(
  raw: unknown,
  makeId: () => string = () => crypto.randomUUID(),
): LocalSpecsState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { batches?: unknown; specs?: unknown };
  // New shape: prefer batches when present (resolves a half-migrated value).
  if (Array.isArray(v.batches)) {
    const batches = v.batches.filter(isManualBatch);
    return batches.length ? { batches } : null;
  }
  // Legacy single-bundle shape -> wrap as one batch with a fresh unique id.
  if (v.specs && typeof v.specs === "object") {
    const specs = v.specs as SpecsResponse;
    return {
      batches: [
        {
          id: makeId(),
          label: specs.manifest?.project || "Imported bundle",
          source: "paste",
          importedAt: 0,
          specs,
        },
      ],
    };
  }
  return null;
}

export async function setLocalSpecs(state: LocalSpecsState | null): Promise<void> {
  // An empty list means "no manual specs": drop the key so a default profile
  // carries nothing and reconcile treats it as cleared.
  if (state === null || state.batches.length === 0) {
    await browser.storage.local.remove(LOCAL_SPECS_KEY);
    return;
  }
  await browser.storage.local.set({ [LOCAL_SPECS_KEY]: state });
}
