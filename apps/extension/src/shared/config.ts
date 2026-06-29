import type { SpecsResponse, SpecWithFile } from "@specpin/api-client";
import type { DisplayMode, GuideDef, Manifest, Spec } from "@specpin/spec-schema";
import { browser } from "#imports";
import type { UiLocale } from "../i18n/locales.js";
import type { Connection } from "./connection-types.js";
import { connectionServesOrigin } from "./origin-match.js";
import type { Theme } from "./theme.js";
import type { PersonalVisibility } from "./visibility.js";

export type { Connection } from "./connection-types.js";
export type { Theme } from "./theme.js";

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
   *  (crypto.randomUUID()); the legacy migration also gets a fresh uuid. The
   *  per-batch local connection id is `manual:<id>` (see `shared/local-id.ts`). */
  id: string;
  /** Display label: manifest.project, else first file name, else "Pasted bundle". */
  label: string;
  /** How it was created: imported (paste/files) or authored in the extension
   *  ("manual" = created via CREATE_LOCAL_PROJECT). Drives the row subtitle. */
  source: "paste" | "files" | "manual";
  /** Base names of picked files (files source only), for the row subtitle. */
  fileNames?: string[];
  /** Epoch ms when added (display only; do not use for ordering). */
  importedAt: number;
  /** RT-SA1 parity for the WRITE path: a batch with empty `manifest.domains`
   *  is a writable/capture target for a page only when this is true. Imported
   *  batches leave it undefined (render keeps its historical match-all). */
  applyToAllSites?: boolean;
  /** Per-batch on/off, the local-project parallel to `Connection.enabled`. A
   *  disabled batch serves no page (no specs, no guides, not a write/capture
   *  target) but stays listed in Options to be re-enabled. Undefined = enabled
   *  (backward compatible with batches stored before this field existed). */
  enabled?: boolean;
  /** Map of `_file` -> original file `group`, so a later export reconstructs the
   *  per-file group (a file-level field, not a Spec field). Absent on pre-plan
   *  batches; export then falls back to a file-base-derived group. */
  fileGroups?: Record<string, string>;
  /** Named onboarding guides committed alongside this local project (RT-H7): the
   *  local equivalent of a sidecar's `.specs/guides.json`. Absent until the user
   *  saves one. Stored inline on the batch so a local project is a self-contained
   *  guide target without a sidecar. */
  guides?: GuideDef[];
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

/** Per-batch spec cap for the in-extension WRITE path (capture into a local
 *  project). Mirrors `MAX_SPECS` in local-bundle.ts (the import-path cap); kept as
 *  a separate constant so config.ts stays free of the spec-schema validator
 *  import. A captured spec is rejected once the batch would exceed this. */
export const MAX_SPECS_PER_BATCH = 5000;

const CONFIG_KEY = "specpin:config";
const CONNECTIONS_KEY = "specpin:connections";
const ENABLED_KEY = "specpin:enabled";
export const LOCAL_SPECS_KEY = "specpin:localSpecs";
const LOCALE_KEY = "specpin:locale";
const DISPLAY_MODE_KEY = "specpin:displayMode";
export const SURFACE_KEY = "specpin:defaultSurface";
/** The user's forced UI theme. Distinct from the spec-content locale: this is
 *  the extension's own chrome appearance. Default "system" follows the OS. */
export const THEME_KEY = "specpin:theme";
/** The user's chosen UI-chrome language (`"en" | "vi"`), or null to follow the
 *  browser/system UI language. Independent from the spec-content LOCALE_KEY. */
export const UI_LOCALE_KEY = "specpin:uiLocale";
/** Personal visibility override. In `storage.sync` (not local) so a user's
 *  show/hide choices follow them across machines on the same browser profile. */
export const VISIBILITY_KEY = "specpin:visibility";
/** Personal onboarding guides, private to the user. In `storage.sync` so they
 *  follow the profile across machines. The stored value is an origin-keyed map
 *  (`{ [origin]: GuideDef[] }`) so a guide is scoped to the page it was built for;
 *  an empty map drops the key. This is a per-user trust boundary distinct from
 *  team guides (RT-C1/H2): reads + writes key by a canonical, trusted origin. */
export const GUIDES_KEY = "specpin:guides";
/** Where the user dragged the floating relaunch pill, or null for the default
 *  bottom-right corner. */
export const LAUNCHER_POSITION_KEY = "specpin:launcherPosition";

/** A relaunch-pill position, as viewport pixels from the top-left. Clamped to the
 *  current viewport when applied, so a smaller window still keeps the pill visible. */
export interface LauncherPosition {
  x: number;
  y: number;
}

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

/** The forced UI theme, defaulting to "system" (follow the OS) on a fresh install. */
export async function getTheme(): Promise<Theme> {
  const stored = await browser.storage.local.get(THEME_KEY);
  return (stored[THEME_KEY] as Theme | undefined) ?? "system";
}

export async function setTheme(theme: Theme): Promise<void> {
  // "system" is the default: drop the key so a default profile carries nothing.
  if (theme === "system") {
    await browser.storage.local.remove(THEME_KEY);
    return;
  }
  await browser.storage.local.set({ [THEME_KEY]: theme });
}

/** The user's chosen UI-chrome language, or null to follow the browser/system UI
 *  language. Resolution to a concrete locale is done by `resolveUiLocale`. */
export async function getUiLocale(): Promise<UiLocale | null> {
  const stored = await browser.storage.local.get(UI_LOCALE_KEY);
  return (stored[UI_LOCALE_KEY] as UiLocale | undefined) ?? null;
}

export async function setUiLocale(locale: UiLocale | null): Promise<void> {
  // null = follow the system: drop the key so a default profile carries nothing.
  if (locale === null) {
    await browser.storage.local.remove(UI_LOCALE_KEY);
    return;
  }
  await browser.storage.local.set({ [UI_LOCALE_KEY]: locale });
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

/** Canonicalize a raw origin string to its `URL.origin` form, or null when it is
 *  malformed (RT-H2). The single normalizer so a personal guide's read key always
 *  matches its write key and a foreign/garbage origin can never seed an entry. */
export function canonicalOrigin(raw: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** The user's personal guides for one canonical origin (empty when none). Reads
 *  the origin-keyed `storage.sync` map; a malformed origin yields []. */
export async function getPersonalGuides(origin: string): Promise<GuideDef[]> {
  const key = canonicalOrigin(origin);
  if (!key) return [];
  const stored = await browser.storage.sync.get(GUIDES_KEY);
  const map = stored[GUIDES_KEY] as Record<string, GuideDef[]> | undefined;
  const guides = map?.[key];
  return Array.isArray(guides) ? guides : [];
}

/** Persist the user's personal guides for one canonical origin. An empty list
 *  drops that origin's entry; an empty map drops the whole key so a default
 *  profile carries nothing (sync caps item size at ~8KB). Rejects a malformed
 *  origin (RT-H2). The browser's `storage.sync.set` throws on quota overflow
 *  (RT-H1); callers must surface that rather than swallow it. */
export async function setPersonalGuides(origin: string, guides: GuideDef[]): Promise<void> {
  const key = canonicalOrigin(origin);
  if (!key) throw new Error("invalid origin");
  const stored = await browser.storage.sync.get(GUIDES_KEY);
  const map = { ...((stored[GUIDES_KEY] as Record<string, GuideDef[]> | undefined) ?? {}) };
  if (guides.length === 0) delete map[key];
  else map[key] = guides;
  if (Object.keys(map).length === 0) {
    await browser.storage.sync.remove(GUIDES_KEY);
    return;
  }
  await browser.storage.sync.set({ [GUIDES_KEY]: map });
}

/** The user's dragged relaunch-pill position, or null for the default corner. */
export async function getLauncherPosition(): Promise<LauncherPosition | null> {
  const stored = await browser.storage.local.get(LAUNCHER_POSITION_KEY);
  const v = stored[LAUNCHER_POSITION_KEY] as LauncherPosition | undefined;
  return v && typeof v.x === "number" && typeof v.y === "number" ? { x: v.x, y: v.y } : null;
}

export async function setLauncherPosition(pos: LauncherPosition | null): Promise<void> {
  // null = the default corner: drop the key so a default profile carries nothing.
  if (pos === null) {
    await browser.storage.local.remove(LAUNCHER_POSITION_KEY);
    return;
  }
  await browser.storage.local.set({ [LAUNCHER_POSITION_KEY]: pos });
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

// ---------------------------------------------------------------------------
// Pure mutators over LocalSpecsState (the in-extension authoring write path).
//
// Contract: each is `(state, ...args) => LocalMutationResult`. It returns a NEW
// state (never mutates the input) and never touches storage. The background calls
// it INSIDE its serialized mutate() callback, reading current storage truth first
// and persisting the RETURNED state (not the input), so concurrent surfaces cannot
// lose a write. Unit-tested in isolation; an integration test covers the full
// SAVE_SPEC -> mutator -> setLocalSpecs -> reconcile -> GET_SPECS_FOR_ORIGIN loop.
// ---------------------------------------------------------------------------

/** Whether a local batch is a writable/capture target for an origin: the RT-SA1
 *  gate (a batch with empty `domains` serves a page only with `applyToAllSites`),
 *  AND the batch is enabled. A disabled batch serves no page at all (parallel to
 *  `matchesOrigin` baking in `Connection.enabled`), so guide serving and the
 *  write/capture guards drop it. One home for the rule, shared by the registry's
 *  capture picker and the background write guard so they can never diverge. */
export function batchServesOrigin(batch: ManualBatch, origin: string): boolean {
  return connectionServesOrigin(
    {
      domains: batch.specs.manifest?.domains ?? [],
      matchesAllSites: batch.applyToAllSites === true,
      enabled: batch.enabled,
    },
    origin,
  );
}

/** Result of a pure local mutator: ok + the new state, or ok:false + reason. */
export interface LocalMutationResult {
  ok: boolean;
  state?: LocalSpecsState;
  error?: string;
}

/** Append an empty local project (created in the extension, not imported). Its
 *  manifest pins `project` + `domains`; `applyToAllSites` controls whether an
 *  empty-`domains` project is a writable target (RT-SA1 parity, defaults off).
 *  Enforces MAX_MANUAL_BATCHES. */
export function createLocalBatch(
  state: LocalSpecsState,
  opts: { id: string; project: string; domains: string[]; applyToAllSites?: boolean },
): LocalMutationResult {
  if (state.batches.length >= MAX_MANUAL_BATCHES) {
    return {
      ok: false,
      error: `Limit reached (${MAX_MANUAL_BATCHES} batches). Remove some first.`,
    };
  }
  const manifest: Manifest = {
    version: "1.0",
    project: opts.project,
    domains: opts.domains,
    specFiles: [],
  };
  const batch: ManualBatch = {
    id: opts.id,
    label: opts.project,
    source: "manual",
    importedAt: Date.now(),
    applyToAllSites: opts.applyToAllSites,
    fileGroups: {},
    specs: { manifest, specs: [] },
  };
  return { ok: true, state: { batches: [...state.batches, batch] } };
}

/** Insert or replace a spec in the named batch: replace the one with the same
 *  `spec.id`, else append. Stamps `_file`, records `fileGroups[file] = group`, and
 *  rejects when an APPEND would push the batch past MAX_SPECS_PER_BATCH (a replace
 *  never grows the count). Unknown batch id -> ok:false. */
export function upsertLocalSpec(
  state: LocalSpecsState,
  batchId: string,
  file: string,
  group: string,
  spec: Spec,
): LocalMutationResult {
  const idx = state.batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return { ok: false, error: "unknown local project" };
  const batch = state.batches[idx] as ManualBatch;
  const specWithFile = { ...spec, _file: file } as SpecWithFile;
  const existing = batch.specs.specs.findIndex((s) => s.id === spec.id);
  const isAppend = existing === -1;
  if (isAppend && batch.specs.specs.length >= MAX_SPECS_PER_BATCH) {
    return { ok: false, error: "batch full" };
  }
  const specs = isAppend
    ? [...batch.specs.specs, specWithFile]
    : batch.specs.specs.map((s, i) => (i === existing ? specWithFile : s));
  const nextBatch: ManualBatch = {
    ...batch,
    fileGroups: { ...(batch.fileGroups ?? {}), [file]: group },
    specs: { ...batch.specs, specs },
  };
  return { ok: true, state: { batches: state.batches.map((b, i) => (i === idx ? nextBatch : b)) } };
}

/** Remove a spec by id from the named batch (no-op-but-ok when the id is absent).
 *  Unknown batch id -> ok:false. */
export function removeLocalSpecById(
  state: LocalSpecsState,
  batchId: string,
  id: string,
): LocalMutationResult {
  const idx = state.batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return { ok: false, error: "unknown local project" };
  const batch = state.batches[idx] as ManualBatch;
  const nextBatch: ManualBatch = {
    ...batch,
    specs: { ...batch.specs, specs: batch.specs.specs.filter((s) => s.id !== id) },
  };
  return { ok: true, state: { batches: state.batches.map((b, i) => (i === idx ? nextBatch : b)) } };
}

/** Max guides committed to one local project, mirroring the schema's `maxItems`
 *  on `guides` so a local batch can never hold more than the sidecar would. */
export const MAX_GUIDES_PER_BATCH = 50;

/** Insert or replace a guide (by `guide.id`) in the named local batch's `guides`
 *  blob (RT-H7); lazily creates the array. Rejects an APPEND past
 *  MAX_GUIDES_PER_BATCH (a replace never grows the count). Unknown batch id ->
 *  ok:false. */
export function upsertLocalGuide(
  state: LocalSpecsState,
  batchId: string,
  guide: GuideDef,
): LocalMutationResult {
  const idx = state.batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return { ok: false, error: "unknown local project" };
  const batch = state.batches[idx] as ManualBatch;
  const guides = batch.guides ?? [];
  const existing = guides.findIndex((g) => g.id === guide.id);
  const isAppend = existing === -1;
  if (isAppend && guides.length >= MAX_GUIDES_PER_BATCH) {
    return { ok: false, error: `Limit reached (${MAX_GUIDES_PER_BATCH} guides).` };
  }
  const nextGuides = isAppend
    ? [...guides, guide]
    : guides.map((g, i) => (i === existing ? guide : g));
  const nextBatch: ManualBatch = { ...batch, guides: nextGuides };
  return { ok: true, state: { batches: state.batches.map((b, i) => (i === idx ? nextBatch : b)) } };
}

/** Remove a guide by id from the named local batch (no-op-but-ok when absent;
 *  drops the `guides` array when it empties). Unknown batch id -> ok:false. */
export function removeLocalGuide(
  state: LocalSpecsState,
  batchId: string,
  guideId: string,
): LocalMutationResult {
  const idx = state.batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return { ok: false, error: "unknown local project" };
  const batch = state.batches[idx] as ManualBatch;
  const nextGuides = (batch.guides ?? []).filter((g) => g.id !== guideId);
  const nextBatch: ManualBatch = { ...batch };
  if (nextGuides.length) nextBatch.guides = nextGuides;
  else delete nextBatch.guides;
  return { ok: true, state: { batches: state.batches.map((b, i) => (i === idx ? nextBatch : b)) } };
}

/** Rename a local project: update `manifest.project` (+ display label) and,
 *  optionally, its `domains` (which changes its write-routing surface). Unknown
 *  batch id -> ok:false. */
export function renameLocalBatch(
  state: LocalSpecsState,
  batchId: string,
  project: string,
  domains?: string[],
): LocalMutationResult {
  const idx = state.batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return { ok: false, error: "unknown local project" };
  const batch = state.batches[idx] as ManualBatch;
  const manifest: Manifest = {
    ...(batch.specs.manifest ?? { version: "1.0", project, domains: domains ?? [], specFiles: [] }),
    project,
    ...(domains !== undefined ? { domains } : {}),
  };
  const nextBatch: ManualBatch = {
    ...batch,
    label: project,
    specs: { ...batch.specs, manifest },
  };
  return { ok: true, state: { batches: state.batches.map((b, i) => (i === idx ? nextBatch : b)) } };
}

/** Toggle a local batch on/off (the parallel to setConnectionEnabled). A disabled
 *  batch serves no page but stays in the list. Unknown batch id -> ok:false. */
export function setLocalBatchEnabled(
  state: LocalSpecsState,
  batchId: string,
  enabled: boolean,
): LocalMutationResult {
  const idx = state.batches.findIndex((b) => b.id === batchId);
  if (idx === -1) return { ok: false, error: "unknown local project" };
  const batch = state.batches[idx] as ManualBatch;
  const nextBatch: ManualBatch = { ...batch, enabled };
  return { ok: true, state: { batches: state.batches.map((b, i) => (i === idx ? nextBatch : b)) } };
}
