import type { SpecsResponse, ViewsConfig } from "@specpin/api-client";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import { browser } from "#imports";
import type { ConnectionStatus, TaggedSpec } from "./connection-types.js";
import type { PersonalVisibility, VisibilityState } from "./visibility.js";

export type { ConnectionStatus, TaggedSpec } from "./connection-types.js";

// Message protocol between content script, popup, options, and the background
// service worker. The SW owns the api-client + token + cache + SSE.
export type Message =
  | { type: "GET_SPECS_FOR_ORIGIN"; origin: string }
  | { type: "GET_STATUS" }
  | { type: "TEST_CONNECTION" }
  | { type: "SAVE_CONFIG"; baseUrl: string; token: string }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "RELOAD" }
  // Reconnect one connection by id, or all when omitted.
  | { type: "RECONNECT"; id?: string }
  // Multi-project connection management (extension-page origin only).
  | {
      type: "ADD_CONNECTION";
      baseUrl: string;
      token: string;
      label?: string;
      applyToAllSites?: boolean;
    }
  | { type: "REMOVE_CONNECTION"; id: string }
  // Edit an existing connection. `label`/`applyToAllSites` are the lightweight
  // (no reconnect) edits. `baseUrl`/`token` change the live endpoint: when either
  // is present the handler recreates the client and re-validates. An omitted
  // `token` keeps the stored secret (RT-SA6: it is never rendered back to edit).
  | {
      type: "UPDATE_CONNECTION";
      id: string;
      label?: string;
      applyToAllSites?: boolean;
      baseUrl?: string;
      token?: string;
    }
  // `connectionId` targets the destination project when several serve the page.
  | { type: "SAVE_SPEC"; file: string; spec: Spec; connectionId?: string }
  // Manual-import specs pushed from the Options page (extension-page origin only).
  // `specs: null` clears them. `seq` guards against out-of-order tab writes.
  | { type: "SET_LOCAL_SPECS"; specs: SpecsResponse | null; seq: number }
  | { type: "SPECS_CHANGED" }
  | { type: "START_CAPTURE" }
  | { type: "SET_DISPLAY_MODE"; mode: DisplayMode | null }
  // Viewer locale change, dispatched popup -> active tab's content script. The
  // popup persists the choice to storage; the content script re-renders with it.
  | { type: "SET_LOCALE"; locale: string }
  // Tooltip pin "open in side panel": content -> background. Best-effort opens
  // the side panel (Chrome only; may no-op if the user gesture is lost) and
  // broadcasts HIGHLIGHT_SPEC so an already-open panel scrolls to the card.
  | { type: "OPEN_SPEC_IN_PANEL"; specId: string }
  // background -> side panel runtime page: scroll the matching card into view.
  | { type: "HIGHLIGHT_SPEC"; specId: string }
  // Personal visibility override change: popup/side panel -> background, which
  // persists it to storage.sync (debounced) and broadcasts SPECS_CHANGED.
  | { type: "SET_PERSONAL_VISIBILITY"; visibility: PersonalVisibility }
  // Options page: read one connection's team-default views (.specs/views.json).
  | { type: "GET_TEAM_VIEWS"; connectionId: string }
  // Options page: write a connection's team-default views to Git via the sidecar.
  | { type: "SAVE_TEAM_VIEWS"; connectionId: string; views: ViewsConfig };

// Message types that mutate stored state and must originate from an extension
// page (popup/options/side panel), never from a web-page content script. The
// background listener rejects these unless the sender URL is the extension's own
// origin. Add new privileged types here.
export const PRIVILEGED_MESSAGE_TYPES = new Set<Message["type"]>([
  "SAVE_CONFIG",
  "SET_LOCAL_SPECS",
  // RT-SA2: connection mutations must come from an extension page, not a web
  // page's content script. RECONNECT is included because it can re-issue a
  // connection's bearer token to the sidecar.
  "ADD_CONNECTION",
  "REMOVE_CONNECTION",
  "UPDATE_CONNECTION",
  "RECONNECT",
  // Mutates the personal visibility override in storage.sync.
  "SET_PERSONAL_VISIBILITY",
  // Writes the team-default views.json to Git via the sidecar.
  "SAVE_TEAM_VIEWS",
]);

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
  specs: TaggedSpec[];
  enabled: boolean;
  /** Union of the matching projects' locales, for the language picker. */
  locales?: string[];
  /** Merged visibility cascade (team default + personal override) for this
   *  origin. Absent/empty means today's behavior (all visible). */
  visibility?: VisibilityState;
}

export interface StatusResult {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  activeSource: string | null;
  project: string | null;
  specCount: number;
  /** Locales the popup language picker can offer: the union of connected
   *  projects' `manifest.settings.locales`, never empty (defaults to the
   *  project's defaultLocale, else "en"). */
  locales?: string[];
  /** Per-connection status for the management UI (Phase 4 consumes this). */
  connections?: ConnectionStatus[];
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
