import type { SpecsResponse, ViewsConfig } from "@specpin/api-client";
import type { AnchorStrength, MatchAnchor, MatchResult } from "@specpin/fingerprint-core";
import type {
  DisplayMode,
  ElementFingerprint,
  GuideDef,
  Manifest,
  Spec,
} from "@specpin/spec-schema";
import { browser } from "#imports";
import type { UiLocale } from "../i18n/locales.js";
import type {
  ConnectionStatus,
  ManualBatchSummary,
  TaggedGuide,
  TaggedSpec,
} from "./connection-types.js";
import type { PassiveDriftEntry } from "./drift-corpus.js";
import type { Theme } from "./theme.js";
import type { PersonalVisibility, VisibilityState } from "./visibility.js";

export type {
  ConnectionStatus,
  ManualBatchSummary,
  TaggedGuide,
  TaggedSpec,
} from "./connection-types.js";

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
  // Delete a spec in place (id-addressed). Same trust model as UPDATE_SPEC: from
  // the page content script, routed by origin to the owning connection.
  // `connectionId` pins the owning project (manual:<batchId> for local).
  | { type: "DELETE_SPEC"; id: string; connectionId?: string }
  // Side panel -> active tab content script: open the in-page edit form for this
  // spec id (the form + capture picker only run in the page context).
  | { type: "EDIT_SPEC"; specId: string }
  // Side panel -> active tab content script: run the in-page delete flow (confirm
  // + DELETE_SPEC) for this spec id, so the confirm + origin routing happen where
  // the spec's page context is. Sibling of EDIT_SPEC / SHOW_SPEC_HERE.
  | { type: "DELETE_SPEC_HERE"; specId: string }
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
  // Toggle a local project on/off (the parallel to UPDATE_CONNECTION's `enabled`).
  // A disabled batch serves no page but stays listed. Privileged: extension-page only.
  | { type: "SET_LOCAL_BATCH_ENABLED"; id: string; enabled: boolean }
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
  // Right-click "Pin spec to this element": background -> active tab's content
  // script. The content script captures the element it recorded on the last
  // `contextmenu` event and opens the capture form on it (no hover-pick needed).
  | { type: "PIN_ELEMENT" }
  // Right-click "Show spec here": background -> active tab's content script. The
  // content script highlights the rendered spec matched to the last right-clicked
  // element (or its nearest matched ancestor); no-op if none matches.
  | { type: "SHOW_SPEC_HERE" }
  // Launch a guide tour in the active tab's content script (popup/side panel ->
  // content, or the in-page keyboard shortcut). `steps` is the guide's ordered
  // spec ids; omitted/empty runs the default (all matched specs in default order).
  // `name` is the popover header (a plain string, escaped before render). The
  // content script resolves the steps against its current page specs.
  | { type: "START_GUIDE"; steps?: string[]; name: string }
  | { type: "SET_DISPLAY_MODE"; mode: DisplayMode | null }
  // Viewer locale change, dispatched popup -> active tab's content script. The
  // popup persists the choice to storage; the content script re-renders with it.
  | { type: "SET_LOCALE"; locale: string }
  // UI-chrome theme change, broadcast Options -> all tabs' content scripts. The
  // Options page persists the choice; the content script re-renders renderers with
  // it so their shadow hosts pick up the forced theme. Distinct from SET_LOCALE
  // (spec content) and SET_UI_LOCALE (chrome language).
  | { type: "SET_THEME"; theme: Theme }
  // Badge-numbering toggle, broadcast Options -> all tabs' content scripts. The
  // Options page persists the choice; the content script re-renders so on-page
  // badges switch between "S" and a reading-order number. Appearance-only, like
  // SET_THEME.
  | { type: "SET_BADGE_NUMBERING"; on: boolean }
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
  // popup / side panel -> active tab's content script: report which specs actually
  // resolved to an element on the current page (the live render's match set), so a
  // surface can scope its list to "this page". No content script (chrome://, the
  // store, the extension's own pages) rejects the send, which the caller reads as
  // "unknown" and falls back to the full origin list.
  | { type: "GET_MATCHED_IDS" }
  // Coverage counts for the active tab: popup/side panel -> content script, which
  // scans the live DOM for undocumented interactive elements. Read-only; resolves
  // to CoverageCounts, or null when no content script answers (unsupported tab).
  | { type: "GET_COVERAGE" }
  // Bulk capture: popup/side panel -> active tab content script. START_BULK_CAPTURE
  // opens the multi-select picker; START_BULK_CAPTURE_GAPS pre-loads the bulk form
  // with the page's current coverage gaps. Fire-and-forget.
  | { type: "START_BULK_CAPTURE" }
  | { type: "START_BULK_CAPTURE_GAPS" }
  // Clone a spec onto a newly-picked element: side panel -> active tab content
  // script, which runs the picker + prefilled capture form. Fire-and-forget.
  | { type: "CLONE_SPEC"; specId: string }
  // Personal visibility override change: popup/side panel -> background, which
  // persists it to storage.sync (debounced) and broadcasts SPECS_CHANGED.
  | { type: "SET_PERSONAL_VISIBILITY"; visibility: PersonalVisibility }
  // Options page: read one connection's team-default views (.specs/views.json).
  | { type: "GET_TEAM_VIEWS"; connectionId: string }
  // Options page: write a connection's team-default views to Git via the sidecar.
  | { type: "SAVE_TEAM_VIEWS"; connectionId: string; views: ViewsConfig }
  // Options page: read one sidecar connection's team guides (.specs/guides.json),
  // for the per-connection management list. Mirrors GET_TEAM_VIEWS (not privileged;
  // team guides are not private data).
  | { type: "GET_TEAM_GUIDES"; connectionId: string }
  // The guides (team + the user's personal) that apply to a page. Read-only, but
  // it returns the caller's PRIVATE personal guides, so the background derives the
  // origin from the trusted sender for a web content script and trusts `origin`
  // only from a privileged extension page (popup/side panel querying the active
  // tab). A content script can thus never read another origin's personal guides
  // (RT-C1).
  | { type: "GET_GUIDES_FOR_ORIGIN"; origin: string }
  // Save a guide to a team target: a sidecar connection (PUT /guides) OR a local
  // committed project (storage.local guides blob), routed by `targetId` kind
  // (RT-H7). `origin` bounds the local-project write (RT-SA7). Privileged.
  | { type: "SAVE_TEAM_GUIDE"; targetId: string; guide: GuideDef; origin: string }
  // Save a guide to the user's personal store for `origin` (canonicalized +
  // validated, RT-H2). Privileged: only an extension page may write personal data.
  | { type: "SAVE_PERSONAL_GUIDE"; guide: GuideDef; origin: string }
  // Delete a guide by id from a team target (sidecar or local, by `targetId`) or
  // the personal store (by canonical `origin`), selected by `scope`. Privileged.
  | {
      type: "DELETE_GUIDE";
      scope: "team" | "personal";
      id: string;
      targetId?: string;
      origin?: string;
    }
  // Local drift-corpus append: a re-pin replaced a spec's fingerprint, so record
  // the old->new pair for scorer tuning. UNprivileged — a re-pin legitimately
  // originates from the content script (like UPDATE_SPEC); the background gates on
  // the opt-in flag before persisting and ignores content-only edits.
  | {
      type: "RECORD_DRIFT";
      old: ElementFingerprint;
      new: ElementFingerprint;
      pageUrl: string | null;
      prevStrategy: MatchResult["strategy"];
      prevConfidence: number;
      project?: string;
      /** True for a "Correct" affirmation (new === old): the current match is
       *  confirmed right, so the background records it without the
       *  fingerprint-changed guard. */
      confirmed?: boolean;
    }
  // Local drift-corpus passive append: at match time some specs went orphaned/MID,
  // so the content script snapshotted the candidate fingerprints the scorer weighed.
  // UNprivileged (content-originated, like RECORD_DRIFT); the background gates on
  // the opt-in flag and dedupes per (project, specId, pageUrl) before persisting.
  | { type: "RECORD_DRIFT_PASSIVE"; entries: PassiveDriftInput[] };

/** A passive drift entry as sent from content; the background stamps `ts`. */
export type PassiveDriftInput = Omit<PassiveDriftEntry, "ts">;

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
  "SET_LOCAL_BATCH_ENABLED",
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
  // Guide mutations: a save/delete to a team target (sidecar or local) or the
  // user's PRIVATE personal store must come from an extension page, never a web
  // content script (RT-C1/H2: protects per-user private data + the write path).
  "SAVE_TEAM_GUIDE",
  "SAVE_PERSONAL_GUIDE",
  "DELETE_GUIDE",
]);

export interface SaveSpecResult {
  ok: boolean;
  errors?: string[];
  /** True when the write was rejected because the specs changed elsewhere since
   *  this client last read them (HTTP 409). The connection was reloaded, so the
   *  UI should tell the user to review + retry rather than show a hard failure. */
  conflict?: boolean;
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

/** The guides that apply to a page: team guides (sidecar + local) merged with the
 *  user's personal guides for the origin, each tagged by scope. */
export interface GuidesForOrigin {
  guides: TaggedGuide[];
}

/** Result of a guide save/delete. `error` carries a single human-readable reason
 *  (e.g. a sync quota rejection surfaced rather than swallowed, RT-H1). */
export interface GuideMutationResult {
  ok: boolean;
  error?: string;
}

/** The match tier a spec resolved at, mirroring `MatchResult.strategy`. */
export type MatchTier = MatchResult["strategy"];
export type { AnchorStrength, MatchAnchor } from "@specpin/fingerprint-core";

/** Per-spec match metadata for one page-scoped spec, carried by GET_MATCHED_IDS
 *  so the popup / side panel can render match health (badges, orphaned list,
 *  fragile-anchor scan) without re-running the matcher. Ids + small scalars only,
 *  never spec bodies, so the message stays cheap. */
export interface MatchReportEntry {
  id: string;
  /** True when the fingerprint resolved to an element on the current page. */
  matched: boolean;
  strategy: MatchTier;
  confidence: number;
  /** Which signal resolved the match (null when unmatched). */
  anchor: MatchAnchor;
  needsReview: boolean;
  /** Stored-fingerprint anchor resilience (Phase 1 `anchorStrength`). */
  strength: AnchorStrength;
}

/** The spec ids that resolved to an element on the current page (the content
 *  script's live render match set) plus a per-spec `report` for match health,
 *  returned by GET_MATCHED_IDS. `ids` is the matched subset (unchanged meaning);
 *  `report` covers every page-scoped spec (matched or not). */
export interface MatchedIds {
  ids: string[];
  report: MatchReportEntry[];
}

/** Runtime inverse-coverage counts for the active tab, returned by GET_COVERAGE.
 *  `interactive` = visible + enabled interactive elements; `documented` = those a
 *  spec matches; `gaps` = the undocumented, non-ignored remainder (the on-page
 *  ghost-marker count). `truncated` flags that a huge DOM exceeded the scan cap. */
export interface CoverageCounts {
  interactive: number;
  documented: number;
  gaps: number;
  truncated: boolean;
}

/** Send a message to the background service worker. */
export function sendToBackground<T = unknown>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

/** Send a message to the active tab's content script (popup -> content).
 *  Returns true when a content script received it. Pages with no content script
 *  (the extension's own pages, chrome://, the store) reject the send, so this
 *  resolves false and the caller can surface that (e.g. a toast) instead of
 *  failing silently. */
export async function sendToActiveTab(message: Message): Promise<boolean> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return false;
  try {
    await browser.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    return false;
  }
}

/** Send a message to the active tab's content script and return its response
 *  (popup / side panel -> content, request/response). Resolves null when no
 *  content script received it (the extension's own pages, chrome://, the store)
 *  or the send errored, so the caller can fall back rather than fail. */
export async function queryActiveTab<T>(message: Message): Promise<T | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    return ((await browser.tabs.sendMessage(tab.id, message)) as T) ?? null;
  } catch {
    return null;
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
