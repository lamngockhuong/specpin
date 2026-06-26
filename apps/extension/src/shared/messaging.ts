import type { SpecsResponse, SpecWithFile } from "@specpin/api-client";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import { browser } from "#imports";

// Message protocol between content script, popup, options, and the background
// service worker. The SW owns the api-client + token + cache + SSE.
export type Message =
  | { type: "GET_SPECS_FOR_ORIGIN"; origin: string }
  | { type: "GET_STATUS" }
  | { type: "TEST_CONNECTION" }
  | { type: "SAVE_CONFIG"; baseUrl: string; token: string }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "RELOAD" }
  | { type: "RECONNECT" }
  | { type: "SAVE_SPEC"; file: string; spec: Spec }
  // Manual-import specs pushed from the Options page (extension-page origin only).
  // `specs: null` clears them. `seq` guards against out-of-order tab writes.
  | { type: "SET_LOCAL_SPECS"; specs: SpecsResponse | null; seq: number }
  | { type: "SPECS_CHANGED" }
  | { type: "START_CAPTURE" }
  | { type: "SET_DISPLAY_MODE"; mode: DisplayMode | null };

export interface SaveSpecResult {
  ok: boolean;
  errors?: string[];
}

export interface SetLocalSpecsResult {
  ok: boolean;
  specCount: number;
  /** False when an older (out-of-order) write was ignored. */
  applied?: boolean;
}

export interface SpecsForOrigin {
  manifest: Manifest | null;
  specs: SpecWithFile[];
  enabled: boolean;
}

export interface StatusResult {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  activeSource: string | null;
  project: string | null;
  specCount: number;
}

export interface TestConnectionResult {
  ok: boolean;
  project?: string;
  error?: string;
}

/** Send a message to the background service worker. */
export function sendToBackground<T = unknown>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

/** Send a message to the active tab's content script (popup -> content). */
export async function sendToActiveTab(message: Message): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    await browser.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
