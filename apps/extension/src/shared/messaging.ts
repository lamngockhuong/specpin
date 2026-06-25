import { browser } from "#imports";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import type { SpecWithFile } from "@specpin/api-client";

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
  | { type: "SPECS_CHANGED" }
  | { type: "START_CAPTURE" }
  | { type: "SET_DISPLAY_MODE"; mode: DisplayMode | null };

export interface SaveSpecResult {
  ok: boolean;
  errors?: string[];
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
