import type { SpecsResponse } from "@specpin/api-client";
import { browser } from "#imports";

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
const ENABLED_KEY = "specpin:enabled";
const LOCAL_SPECS_KEY = "specpin:localSpecs";
const LOCALE_KEY = "specpin:locale";

export async function getConfig(): Promise<ConnectionConfig | null> {
  const stored = await browser.storage.local.get(CONFIG_KEY);
  const value = stored[CONFIG_KEY] as ConnectionConfig | undefined;
  if (value?.baseUrl && value?.token) return value;
  return null;
}

export async function setConfig(config: ConnectionConfig): Promise<void> {
  await browser.storage.local.set({ [CONFIG_KEY]: config });
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
