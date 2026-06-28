import type { SpecsResponse, ViewsConfig } from "@specpin/api-client";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import { browser } from "#imports";
import type { UiLocale } from "../i18n/locales.js";
import type { ConnectionStatus, ManualBatchSummary, TaggedSpec } from "./connection-types.js";
import type { Theme } from "./theme.js";
import type { PersonalVisibility, VisibilityState } from "./visibility.js";

export type { ConnectionStatus, ManualBatchSummary, TaggedSpec } from "./connection-types.js";

// Message protocol between content script, popup, options, and the background
// service worker. The SW owns the api-client + token + cache + SSE.
export type Message =
  | { type: "GET_SPECS_FOR_ORIGIN"; origin: string }
  | { type: "GET_STATUS" }
  | { type: "TEST_CONNECTION" }
  | { type: "SAVE_CONFIG"; baseUrl: string; token: string }
  | { type: "SET_ENABLED"; enabled: boolean }
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
      // Per-project on/off (lightweight edit, no endpoint re-validation).
      enabled?: boolean;
      baseUrl?: string;
      token?: string;
    }
  // `connectionId` targets the destination project when several serve the page.
  | { type: "SAVE_SPEC"; file: string; spec: Spec; connectionId?: string }
  // Update an existing spec in place (id-addressed). Same trust model as
  // SAVE_SPEC: from the page content script, routed by origin to the owning
  // connection. `connectionId` pins the owning project (the spec's source).
  | { type: "UPDATE_SPEC"; id: string; spec: Spec; connectionId?: string }
  // Side panel -> active tab content script: open the in-page edit form for this
  // spec id (the form + capture picker only run in the page context).
  | { type: "EDIT_SPEC"; specId: string }
  // Manual-import batches pushed from the Options page (extension-page origin
  // only). Each ADD appends a new batch (never overwrites); REMOVE drops one by
  // id; CLEAR empties the whole list.
  | {
      type: "ADD_LOCAL_BATCH";
      bundle: SpecsResponse;
      source: "paste" | "files";
      fileNames?: string[];
      /** Per-file `group` map from the parse, stored on the batch so export
       *  reconstructs per-file groups (the flatten drops the field). */
      fileGroups?: Record<string, string>;
    }
  | { type: "REMOVE_LOCAL_BATCH"; id: string }
  | { type: "CLEAR_LOCAL_SPECS" }
  // Create an empty local (Manual) project from popup/side panel/Options. Stored
  // in storage.local, never a sidecar. Privileged: a content script must never
  // seed a batch. `applyToAllSites` opts an empty-domains project in as a writable
  // target (RT-SA1 parity).
  | {
      type: "CREATE_LOCAL_PROJECT";
      project: string;
      domains: string[];
      applyToAllSites?: boolean;
    }
  // Rename a local project (and optionally re-scope its domains, i.e. its
  // write-routing surface). Privileged: extension-page only.
  | { type: "RENAME_LOCAL_PROJECT"; id: string; project: string; domains?: string[] }
  // The writable projects (sidecar + local) serving an origin, for the capture
  // "Save to" picker. Unprivileged: the content script needs it, and it exposes no
  // more than GET_SPECS_FOR_ORIGIN for the same origin. Includes EMPTY local
  // projects, which specsForOrigin omits (they have no specs yet).
  | { type: "GET_WRITE_TARGETS"; origin: string }
  // Reconstructed export bundles for local projects: one named by `id` (Options
  // per-batch export), else those serving `origin` (popup/panel; falls back to all
  // when none serve). Privileged: it returns full spec payloads across batches, so
  // a content script must not be able to read every local project's specs.
  | { type: "GET_EXPORT_BUNDLES"; id?: string; origin?: string }
  | { type: "SPECS_CHANGED" }
  | { type: "START_CAPTURE" }
  | { type: "SET_DISPLAY_MODE"; mode: DisplayMode | null }
  // Viewer locale change, dispatched popup -> active tab's content script. The
  // popup persists the choice to storage; the content script re-renders with it.
  | { type: "SET_LOCALE"; locale: string }
  // UI-chrome theme change, broadcast Options -> all tabs' content scripts. The
  // Options page persists the choice; the content script re-renders renderers with
  // it so their shadow hosts pick up the forced theme. Distinct from SET_LOCALE
  // (spec content) and SET_UI_LOCALE (chrome language).
  | { type: "SET_THEME"; theme: Theme }
  // UI-chrome language change, broadcast Options -> all tabs' content scripts (and
  // sent popup/sidepanel -> active tab). Receivers re-init i18n and re-render.
  // `locale` is null when "System default" is chosen (resolve via resolveUiLocale).
  | { type: "SET_UI_LOCALE"; locale: UiLocale | null }
  // Tooltip pin "open in side panel": content -> background. Best-effort opens
  // the side panel (Chrome only; may no-op if the user gesture is lost) and
  // broadcasts HIGHLIGHT_SPEC so an already-open panel scrolls to the card.
  | { type: "OPEN_SPEC_IN_PANEL"; specId: string }
  // background -> side panel runtime page: scroll the matching card into view.
  | { type: "HIGHLIGHT_SPEC"; specId: string }
  // popup / side panel -> active tab's content script: scroll to and highlight
  // the matched element on the page for this spec id.
  | { type: "HIGHLIGHT_ELEMENT"; specId: string }
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
  // Manual-import mutations: an unprivileged content script must never be able to
  // append, drop, or wipe a user's loaded batches.
  "ADD_LOCAL_BATCH",
  "REMOVE_LOCAL_BATCH",
  "CLEAR_LOCAL_SPECS",
  // Local-project authoring: create/rename must come from an extension page. A
  // rename can change a batch's domains (its write-routing surface), so it is as
  // privileged as create. (SAVE_SPEC/UPDATE_SPEC stay UNprivileged: capture
  // legitimately originates from a content script; the local-write origin guard
  // in the background is that boundary.)
  "CREATE_LOCAL_PROJECT",
  "RENAME_LOCAL_PROJECT",
  // Returns full spec payloads for many batches; restrict to extension pages so a
  // content script cannot harvest every local project's specs.
  "GET_EXPORT_BUNDLES",
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

export interface AddLocalBatchResult {
  ok: boolean;
  /** False + reason when rejected (e.g. MAX_MANUAL_BATCHES reached). */
  error?: string;
  batchId?: string;
  /** Total specs across all batches after the add. */
  specCount: number;
  /** Prior batches the new one duplicates (same normalized project); empty when
   *  none. Surfaced as a non-blocking warning in the Options page. */
  duplicateOf: { id: string; label: string; project: string; overlapSpecIds: number }[];
  /** Spec ids this batch shares with another batch that could serve the same page
   *  (render/edit then route first-batch-wins). Non-blocking warning; empty when
   *  none. */
  idCollisions: string[];
}

/** Result of creating a local project. */
export interface CreateLocalProjectResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** One local project's reconstructed export, ready for the surface to zip. */
export interface ExportBundle {
  /** Project name, for the zip file name. */
  project: string;
  /** manifest.json + per-group *.spec.json, keyed by file name. */
  files: Record<string, unknown>;
}

/** One writable destination for a captured/edited spec, for the capture picker. */
export interface WriteTarget {
  /** Connection id: a sidecar uuid, or the `manual:<batchId>` local form. */
  id: string;
  project: string;
  kind: "sidecar" | "local";
}

/** Result of a remove/clear: ok plus the new total spec count across batches. */
export interface ManualMutationResult {
  ok: boolean;
  specCount: number;
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
  enabled: boolean;
  // Connection health (connected / partial / disconnected) and the active source
  // are NOT global fields here: they are origin-scoped and derived by the surface
  // from `connections` + the active origin (see renderStatus). A global
  // any-connection-connected flag masked partial failures, and a global "first
  // connected project" would name a project on a page it does not serve.
  /** Locales the popup language picker can offer: the union of connected
   *  projects' `manifest.settings.locales`, never empty (defaults to the
   *  project's defaultLocale, else "en"). */
  locales?: string[];
  /** Per-connection status for the management UI (Phase 4 consumes this). */
  connections?: ConnectionStatus[];
  /** Manual-import batch summaries for the Options list (no specs payload). */
  manualBatches?: ManualBatchSummary[];
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

/** Broadcast a message to every tab's content script. Used by the Options page,
 *  which (unlike the popup/side panel) has no single active content tab, to push
 *  appearance changes (SET_THEME, SET_UI_LOCALE) to all open pages live. Tabs
 *  with no content script (chrome:// pages, the store) simply ignore it. */
export async function broadcastToTabs(message: Message): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id !== undefined
        ? browser.tabs.sendMessage(tab.id, message).catch(() => {})
        : Promise.resolve(),
    ),
  );
}
