import type { SpecsResponse, SpecWithFile, ViewsConfig } from "@specpin/api-client";
import {
  formatErrors,
  type GuideDef,
  type Spec,
  validateGuides,
  validateSpec,
} from "@specpin/spec-schema";
import { browser, defineBackground } from "#imports";
import {
  retitleContextMenu,
  setupContextMenu,
  updateContextMenuVisibility,
} from "../background/context-menu.js";
import {
  findDuplicateBatches,
  findSpecIdCollisions,
  SidecarRegistry,
} from "../background/sidecar-registry.js";
import { initI18n, resolveUiLocale, type UiLocale } from "../i18n/index.js";
import { chromeApi } from "../shared/chrome-api.js";
import {
  batchServesOrigin,
  canonicalOrigin,
  createLocalBatch,
  getConnections,
  getDefaultSurface,
  getEnabled,
  getLocalSpecs,
  getPersonalGuides,
  getPersonalVisibility,
  getUiLocale,
  LOCAL_SPECS_KEY,
  MAX_MANUAL_BATCHES,
  type ManualBatch,
  normalizeLocalSpecsState,
  removeLocalGuide,
  renameLocalBatch,
  SURFACE_KEY,
  setConfig,
  setConnections,
  setEnabled,
  setLocalBatchEnabled,
  setLocalSpecs,
  setPersonalGuides,
  setPersonalVisibility,
  UI_LOCALE_KEY,
  upsertLocalGuide,
  upsertLocalSpec,
  VISIBILITY_KEY,
} from "../shared/config.js";
import type { Connection } from "../shared/connection-types.js";
import { bundleToFiles, groupFromFileName } from "../shared/export-bundle.js";
import { removeHostPermissionIfUnused } from "../shared/host-permission.js";
import { isLocalConnectionId, localBatchId } from "../shared/local-id.js";
import {
  type AddLocalBatchResult,
  type CreateLocalProjectResult,
  type ExportBundle,
  type GuideMutationResult,
  type GuidesForOrigin,
  type ManualMutationResult,
  type Message,
  PRIVILEGED_MESSAGE_TYPES,
  type SaveSpecResult,
  type SpecsForOrigin,
  type StatusResult,
  type TaggedGuide,
  type TestConnectionResult,
  type WriteTarget,
} from "../shared/messaging.js";
import { connectionServesOrigin, trustedReadOrigin } from "../shared/origin-match.js";
import { slugify } from "../shared/slug.js";
import { buildVisibilityState, type PersonalVisibility } from "../shared/visibility.js";

const KEEPALIVE_ALARM = "specpin-keepalive";

export default defineBackground(() => {
  const registry = new SidecarRegistry({
    onSpecsChanged: () => void broadcastSpecsChanged(),
    // Per-connection reconnect jitter so N connections that drop together do not
    // reconnect in lockstep (RT-FM2).
    jitterMs: 2_000,
  });

  // In-memory cache of the personal visibility override, the source of truth for
  // GET_SPECS_FOR_ORIGIN. Reads stay synchronous-fast and SET updates it before
  // broadcasting so a re-fetch sees the new value immediately; the storage.sync
  // write is debounced (sync caps writes at ~120/min) so checkbox-heavy filtering
  // does not trip the throttle.
  let personalVisibility: PersonalVisibility = { forceHide: [], forceShow: [] };
  let visibilityLoaded = false;
  let visibilityWriteTimer: ReturnType<typeof setTimeout> | undefined;

  async function ensureVisibilityLoaded(): Promise<void> {
    if (visibilityLoaded) return;
    personalVisibility = await getPersonalVisibility();
    visibilityLoaded = true;
  }

  function scheduleVisibilityWrite(): void {
    if (visibilityWriteTimer) clearTimeout(visibilityWriteTimer);
    visibilityWriteTimer = setTimeout(() => {
      visibilityWriteTimer = undefined;
      void setPersonalVisibility(personalVisibility);
    }, 400);
  }

  // Flush any pending debounced write now. The MV3 worker can be evicted before
  // the 400ms timer fires, so flush on suspend to avoid dropping the last toggle
  // of a burst (the in-memory cache is already authoritative; this persists it).
  function flushVisibilityWrite(): void {
    if (!visibilityWriteTimer) return;
    clearTimeout(visibilityWriteTimer);
    visibilityWriteTimer = undefined;
    void setPersonalVisibility(personalVisibility);
  }

  // Best-effort "something changed, re-query" ping to every tab. It is NOT a
  // confidentiality boundary (RT-SA7): the content script re-calls
  // GET_SPECS_FOR_ORIGIN, and `specsForOrigin` is the real origin gate. Sending
  // to all tabs is intentionally fail-open.
  async function broadcastSpecsChanged(): Promise<void> {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        browser.tabs
          .sendMessage(tab.id, { type: "SPECS_CHANGED" } satisfies Message)
          .catch(() => {});
      }
    }
    // Also notify extension pages (the persistent side panel re-fetches on this).
    // tabs.sendMessage above only reaches content scripts; runtime.sendMessage
    // reaches runtime pages. Fire-and-forget: rejects when no page is listening.
    browser.runtime.sendMessage({ type: "SPECS_CHANGED" } satisfies Message).catch(() => {});
  }

  // Reconcile the in-memory manual batch list against storage truth: set the
  // stored batches, or drop a stale in-memory list storage no longer has. The
  // clear path is the fix for a wiped/cleared `specpin:localSpecs` (e.g. a
  // DevTools storage clear) the in-process write path never routes through a
  // message. Runs under mutate() so it shares the single writer with the add/
  // remove/clear handlers; sets the registry unconditionally from storage truth
  // and broadcasts only when the live list actually changed (sameBatchList
  // suppresses the no-op echo from our own write). A legacy single-bundle value
  // is upgraded and persisted once so its batch gains a real unique id.
  function reconcileLocalSpecs(broadcast: boolean): Promise<void> {
    return mutate(async () => {
      try {
        // One read of the key: normalize the raw value here instead of calling
        // getLocalSpecs() (which would read storage a second time).
        const raw = (await browser.storage.local.get(LOCAL_SPECS_KEY))[LOCAL_SPECS_KEY] as
          | { batches?: unknown; specs?: unknown }
          | undefined;
        const isLegacy = !!raw && typeof raw === "object" && !("batches" in raw) && "specs" in raw;
        const local = normalizeLocalSpecsState(raw);
        // Bake the migrated uuid into storage BEFORE wiring the registry, so the
        // per-batch `manual:<id>` tags are stable across service-worker restarts:
        // were it persisted after setLocalBatches, a wake between the two would
        // mint a different uuid on the next read and any in-flight write would
        // miss (RT finding #11). Done once: the rewritten value is the new shape.
        if (isLegacy && local) await setLocalSpecs(local);
        const applied = local
          ? registry.setLocalBatches(local.batches)
          : registry.clearLocalSpecs();
        if (applied && broadcast) await broadcastSpecsChanged();
      } catch {
        // Best-effort; the keepalive alarm reconciles on its next tick.
      }
    });
  }

  // Rebuild every connection from storage and (re)start watches. Runs at module
  // eval and on each service-worker wake (onStartup / onInstalled / alarm), so a
  // suspended SW that lost its watches re-establishes them generally, for one or
  // many connections (RT-FM1). Idempotent: setConnections reconciles and
  // startWatch stops any prior watch first.
  async function reestablish(): Promise<void> {
    // Defensive: a storage rejection here would otherwise surface as an unhandled
    // rejection from the fire-and-forget callers below.
    try {
      await ensureVisibilityLoaded();
      await reconcileLocalSpecs(false);
      const connections = await getConnections();
      const enabled = await getEnabled();
      await registry.reestablish(connections, enabled);
    } catch {
      // Next wake (message/alarm) retries; nothing actionable here.
    }
  }

  // Apply the toolbar-click surface preference. Chrome only: a click opens the
  // popup when one is set (default_popup), so to open the side panel instead we
  // clear the popup AND turn on openPanelOnActionClick; to restore the popup we
  // set it back. Firefox lacks chrome.sidePanel (it uses sidebar_action with its
  // own toggle), so the whole block is skipped there. Best-effort: failures here
  // never break the worker.
  async function applySurfaceBehavior(): Promise<void> {
    const api = chromeApi();
    if (!api?.sidePanel || !api.action) return;
    try {
      const surface = await getDefaultSurface();
      const openOnClick = surface === "sidepanel";
      // Resolve the built popup filename from the manifest so a WXT rename does
      // not strand the restore path.
      const popup = api.runtime.getManifest().action?.default_popup ?? "popup.html";
      await api.action.setPopup({ popup: openOnClick ? "" : popup });
      await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: openOnClick });
    } catch {
      // Non-fatal: the native side-panel button still reaches the panel.
    }
  }

  // Resolve the stored UI language and (re)build the right-click "Specpin"
  // submenu. Runs on each SW wake; setupContextMenu is idempotent and registers
  // its click listener only once. The toggle-off item routes through
  // handleSetEnabled so the registry watch lifecycle is identical to the popup.
  async function initContextMenu(): Promise<void> {
    initI18n(resolveUiLocale(await getUiLocale()));
    await setupContextMenu({
      isEnabled: getEnabled,
      onToggleOff: () => void handleSetEnabled(false),
    });
  }

  // All run at module eval and on every service-worker wake (onStartup /
  // onInstalled): re-establish watches, re-apply the toolbar-click surface, and
  // rebuild the context menu.
  function initWorker(): void {
    void reestablish();
    void applySurfaceBehavior();
    void initContextMenu();
  }

  initWorker();
  browser.runtime.onStartup?.addListener(initWorker);
  browser.runtime.onInstalled?.addListener(initWorker);
  browser.runtime.onSuspend?.addListener(flushVisibilityWrite);
  // Re-apply when the Settings page changes the preference so the toolbar
  // behavior switches without a reload.
  browser.storage.onChanged.addListener((changes, area) => {
    // Personal visibility lives in storage.sync: an edit on another surface or
    // another machine refreshes the live view here.
    if (area === "sync") {
      if (VISIBILITY_KEY in changes) {
        const next = changes[VISIBILITY_KEY]?.newValue as PersonalVisibility | undefined;
        const normalized = { forceHide: next?.forceHide ?? [], forceShow: next?.forceShow ?? [] };
        // Our own debounced write fires this with the value already in the cache;
        // only broadcast on a genuine change (e.g. an edit from another machine).
        const changed = JSON.stringify(normalized) !== JSON.stringify(personalVisibility);
        personalVisibility = normalized;
        visibilityLoaded = true;
        if (changed) void broadcastSpecsChanged();
      }
      return;
    }
    if (area !== "local") return;
    if (SURFACE_KEY in changes) void applySurfaceBehavior();
    // UI language changed (Options): re-init i18n and re-localize the menu titles
    // so the right-click submenu switches language without a reload.
    if (UI_LOCALE_KEY in changes) {
      initI18n(resolveUiLocale((changes[UI_LOCALE_KEY]?.newValue as UiLocale | undefined) ?? null));
      void getEnabled().then((enabled) => retitleContextMenu(enabled));
    }
    // Mirror an out-of-band manual-batch change (e.g. a DevTools storage clear,
    // which the in-process write path never routes through a message) into the
    // live registry at once, rather than waiting for the keepalive alarm. Our own
    // writes echo here too but no-op via sameBatchList.
    if (LOCAL_SPECS_KEY in changes) void reconcileLocalSpecs(true);
  });
  // The MV3 worker suspends when idle and SSE cannot wake it, so a watch can lag
  // up to one alarm period behind a change. This alarm re-establishes watches
  // (and the module re-evaluates on any wake); 1 minute is the packed floor.
  browser.alarms?.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) void reestablish();
  });

  browser.runtime.onMessage.addListener((raw, sender): Promise<unknown> | undefined => {
    const message = raw as Message;
    // Privileged (state-mutating) messages must originate from a trusted extension
    // surface (popup, options, side panel), never from a web-page content script.
    // The boundary is the sender URL (browser-set, not spoofable): extension pages
    // load from the extension's own origin, content scripts never do. The earlier
    // `sender.tab` check broke when Options became a standalone tab -- which, like
    // a content script, carries sender.tab -- so every privileged call returned
    // "forbidden". Fail closed: a missing URL is not trusted.
    if (PRIVILEGED_MESSAGE_TYPES.has(message.type) && !isExtensionPageSender(sender)) {
      return Promise.resolve({ ok: false, error: "forbidden" });
    }
    switch (message.type) {
      case "GET_SPECS_FOR_ORIGIN":
        return handleGetSpecs(message.origin);
      case "GET_STATUS":
        return handleStatus();
      case "SAVE_CONFIG":
        return handleSaveConfig(message.baseUrl, message.token);
      case "ADD_CONNECTION":
        return handleAddConnection(message);
      case "REMOVE_CONNECTION":
        return handleRemoveConnection(message.id);
      case "UPDATE_CONNECTION":
        return handleUpdateConnection(message);
      case "SET_ENABLED":
        return handleSetEnabled(message.enabled);
      case "RECONNECT":
        return handleReconnect(message.id);
      case "SAVE_SPEC":
        return handleSaveSpec(message.file, message.spec, originOf(sender), message.connectionId);
      case "UPDATE_SPEC":
        return handleUpdateSpec(message.id, message.spec, originOf(sender), message.connectionId);
      case "ADD_LOCAL_BATCH":
        return handleAddLocalBatch(message);
      case "REMOVE_LOCAL_BATCH":
        return handleRemoveLocalBatch(message.id);
      case "CLEAR_LOCAL_SPECS":
        return handleClearLocalSpecs();
      case "CREATE_LOCAL_PROJECT":
        return handleCreateLocalProject(message);
      case "RENAME_LOCAL_PROJECT":
        return handleRenameLocalProject(message);
      case "SET_LOCAL_BATCH_ENABLED":
        return handleSetLocalBatchEnabled(message.id, message.enabled);
      case "GET_WRITE_TARGETS":
        return Promise.resolve(handleGetWriteTargets(message.origin));
      case "GET_EXPORT_BUNDLES":
        return Promise.resolve(handleGetExportBundles(message));
      case "SET_PERSONAL_VISIBILITY":
        return handleSetPersonalVisibility(message.visibility);
      case "GET_TEAM_VIEWS":
        return Promise.resolve(registry.getViews(message.connectionId));
      case "SAVE_TEAM_VIEWS":
        return handleSaveTeamViews(message.connectionId, message.views);
      case "GET_TEAM_GUIDES":
        return Promise.resolve(registry.getGuides(message.connectionId));
      case "GET_GUIDES_FOR_ORIGIN":
        return handleGetGuidesForOrigin(message.origin, sender);
      case "SAVE_TEAM_GUIDE":
        return handleSaveTeamGuide(message);
      case "SAVE_PERSONAL_GUIDE":
        return handleSavePersonalGuide(message);
      case "DELETE_GUIDE":
        return handleDeleteGuide(message);
      case "OPEN_SPEC_IN_PANEL":
        return handleOpenSpecInPanel(message.specId, sender);
      default:
        return undefined;
    }
  });

  // True when the message came from one of this extension's own pages. Extension
  // surfaces load from `chrome-extension://<id>/` (Firefox: `moz-extension://`),
  // which getURL("") returns; a web-page content script's URL never starts with it.
  function isExtensionPageSender(sender: { url?: string } | undefined): boolean {
    const base = browser.runtime.getURL("");
    return sender?.url?.startsWith(base) ?? false;
  }

  function originOf(sender: { tab?: { url?: string } } | undefined): string {
    return canonicalOrigin(sender?.tab?.url ?? "") ?? "";
  }

  async function handleGetSpecs(origin: string): Promise<SpecsForOrigin> {
    const enabled = await getEnabled();
    if (!enabled) return { manifest: null, specs: [], enabled };
    const { specs, manifest, locales } = registry.specsForOrigin(origin);
    await ensureVisibilityLoaded();
    // Cascade: union the serving connections' team-default hidden sets (hide-wins)
    // under the personal override. The pure helper builds the state the
    // content/popup/side-panel predicate consumes.
    const visibility = buildVisibilityState(
      registry.teamHiddenForOrigin(origin),
      personalVisibility,
    );
    return { manifest, specs, enabled, locales, visibility };
  }

  async function handleSetPersonalVisibility(
    visibility: PersonalVisibility,
  ): Promise<{ ok: true }> {
    // The message carries the full desired override, so the cache becomes
    // authoritative at once; the wire write coalesces.
    personalVisibility = visibility;
    visibilityLoaded = true;
    scheduleVisibilityWrite();
    await broadcastSpecsChanged();
    return { ok: true };
  }

  async function handleSaveTeamViews(
    connectionId: string,
    views: ViewsConfig,
  ): Promise<{ ok: boolean; errors?: string[] }> {
    const result = await registry.saveViews(connectionId, views);
    if (result.ok) await broadcastSpecsChanged();
    return result;
  }

  // The guides applying to a page: team (sidecar + local committed) merged with
  // the user's PRIVATE personal guides for the origin. Origin trust (RT-C1): a
  // web content script is pinned to its own tab origin (originOf, browser-set and
  // unspoofable); only a trusted extension page (popup/side panel) may pass the
  // active-tab `origin`. So a content script can never read another origin's
  // personal guides. Read+personal-store keys share canonicalOrigin (RT-H2) so
  // they line up with the write path.
  async function handleGetGuidesForOrigin(
    origin: string,
    sender: { url?: string; tab?: { url?: string } } | undefined,
  ): Promise<GuidesForOrigin> {
    // Respect the global on/off switch, like GET_SPECS_FOR_ORIGIN: a disabled
    // extension serves no guide data, even to its own surfaces.
    if (!(await getEnabled())) return { guides: [] };
    const trustedOrigin = trustedReadOrigin({
      fromExtensionPage: isExtensionPageSender(sender),
      payloadOrigin: origin,
      senderTabUrl: sender?.tab?.url,
    });
    if (!trustedOrigin) return { guides: [] };
    const team = registry.guidesForOrigin(trustedOrigin);
    const canon = canonicalOrigin(trustedOrigin);
    const personal: TaggedGuide[] = canon
      ? (await getPersonalGuides(canon)).map((g) => ({ ...g, scope: "personal", origin: canon }))
      : [];
    return { guides: [...team, ...personal] };
  }

  // Save a guide to a team target. RT-H7: a `manual:<batchId>` target writes the
  // local project's guides blob in storage (origin-bounded, RT-SA7); any other
  // id is a sidecar connection (PUT /guides, re-read-before-write in the
  // registry, RT-H3). Under mutate() so the storage path serializes with every
  // other writer (single SW thread, no seq guard).
  function handleSaveTeamGuide(message: {
    targetId: string;
    guide: GuideDef;
    origin: string;
  }): Promise<GuideMutationResult> {
    return mutate(async () => {
      if (isLocalConnectionId(message.targetId)) {
        const batchId = localBatchId(message.targetId);
        if (!batchId) return { ok: false, error: "invalid local project" };
        const state = (await getLocalSpecs()) ?? { batches: [] };
        const batch = state.batches.find((b) => b.id === batchId);
        if (!batch) return { ok: false, error: "unknown local project" };
        if (!batchServesOrigin(batch, message.origin)) {
          return { ok: false, error: "no local project serves this page" };
        }
        // Local guides never reach the sidecar's Go validator, so re-validate here
        // (parallel to writeLocalSpec) - the editor builds well-formed guides, but
        // a direct message or a migrated blob must not store an off-schema guide.
        const invalid = guideError(message.guide);
        if (invalid) return { ok: false, error: invalid };
        const result = upsertLocalGuide(state, batchId, message.guide);
        if (!result.ok || !result.state) return { ok: false, error: result.error };
        await setLocalSpecs(result.state);
        registry.setLocalBatches(result.state.batches);
        await broadcastSpecsChanged();
        return { ok: true };
      }
      const result = await registry.upsertGuide(message.targetId, message.guide);
      if (result.ok) await broadcastSpecsChanged();
      return { ok: result.ok, error: result.errors?.join("; ") };
    });
  }

  // Save a guide to the user's personal store for a canonical origin (RT-H2).
  // Re-reads the live list before upsert (RT-H3); surfaces the storage.sync quota
  // rejection as an error rather than swallowing it (RT-H1).
  function handleSavePersonalGuide(message: {
    guide: GuideDef;
    origin: string;
  }): Promise<GuideMutationResult> {
    return mutate(async () => {
      const canon = canonicalOrigin(message.origin);
      if (!canon) return { ok: false, error: "invalid origin" };
      // Personal guides live in storage.sync (never the sidecar validator), so
      // re-validate against the schema before storing (RT-H2 parity).
      const invalid = guideError(message.guide);
      if (invalid) return { ok: false, error: invalid };
      try {
        const current = await getPersonalGuides(canon);
        const idx = current.findIndex((g) => g.id === message.guide.id);
        const guides =
          idx === -1
            ? [...current, message.guide]
            : current.map((g, i) => (i === idx ? message.guide : g));
        await setPersonalGuides(canon, guides);
        await broadcastSpecsChanged();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
  }

  // Delete a guide by id from a team target (sidecar or local, by `targetId`) or
  // the personal store (by canonical `origin`), selected by `scope`. Under
  // mutate() so storage writes serialize.
  function handleDeleteGuide(message: {
    scope: "team" | "personal";
    id: string;
    targetId?: string;
    origin?: string;
  }): Promise<GuideMutationResult> {
    return mutate(async () => {
      if (message.scope === "personal") {
        const canon = canonicalOrigin(message.origin ?? "");
        if (!canon) return { ok: false, error: "invalid origin" };
        try {
          const current = await getPersonalGuides(canon);
          await setPersonalGuides(
            canon,
            current.filter((g) => g.id !== message.id),
          );
          await broadcastSpecsChanged();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      if (!message.targetId) return { ok: false, error: "missing target" };
      if (isLocalConnectionId(message.targetId)) {
        const batchId = localBatchId(message.targetId);
        if (!batchId) return { ok: false, error: "invalid local project" };
        const state = (await getLocalSpecs()) ?? { batches: [] };
        const result = removeLocalGuide(state, batchId, message.id);
        if (!result.ok || !result.state) return { ok: false, error: result.error };
        await setLocalSpecs(result.state);
        registry.setLocalBatches(result.state.batches);
        await broadcastSpecsChanged();
        return { ok: true };
      }
      const result = await registry.deleteGuide(message.targetId, message.id);
      if (result.ok) await broadcastSpecsChanged();
      return { ok: result.ok, error: result.errors?.join("; ") };
    });
  }

  // Tooltip pin "open in side panel". Best-effort: Chrome can open the panel only
  // with a live user gesture, which may be lost crossing the content->background
  // boundary, so open() can reject; Firefox cannot open its sidebar at all. Either
  // way HIGHLIGHT_SPEC is broadcast so an already-open panel scrolls to the card.
  async function handleOpenSpecInPanel(
    specId: string,
    sender: { tab?: { id?: number; windowId?: number } } | undefined,
  ): Promise<{ ok: true }> {
    const api = chromeApi();
    const windowId = sender?.tab?.windowId;
    const tabId = sender?.tab?.id;
    try {
      if (api?.sidePanel && (windowId !== undefined || tabId !== undefined)) {
        await api.sidePanel.open(windowId !== undefined ? { windowId } : { tabId });
      }
    } catch {
      // Gesture lost or panel API unavailable: highlight-only fallback below.
    }
    browser.runtime
      .sendMessage({ type: "HIGHLIGHT_SPEC", specId } satisfies Message)
      .catch(() => {});
    return { ok: true };
  }

  async function handleStatus(): Promise<StatusResult> {
    const enabled = await getEnabled();
    const connections = registry.statuses();
    const locales = registry.allLocales();
    // Connection health + active source are derived per active-tab origin by the
    // surface (renderStatus) from `connections`; no global flags here (they
    // masked partial failures and named projects on pages they do not serve).
    return {
      configured: registry.isConfigured() || registry.hasContent(),
      enabled,
      locales: locales.length ? locales : ["en"],
      connections,
      manualBatches: registry.manualBatchSummaries(),
    };
  }

  // Serialize all connection-list read-modify-write operations so two extension
  // surfaces (popup + options) mutating at once cannot lose a write (M2). JS is
  // single-threaded, so the only interleaving is at awaits; chaining removes it.
  let mutationChain: Promise<unknown> = Promise.resolve();
  function mutate<T>(fn: () => Promise<T>): Promise<T> {
    const run = mutationChain.then(fn, fn);
    mutationChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // SAVE_CONFIG is the single-connection bridge for the current Options page
  // (Phase 4 replaces it with ADD/REMOVE). It upserts a "default" connection and
  // keeps the legacy config key so the page can prefill.
  function handleSaveConfig(baseUrl: string, token: string): Promise<TestConnectionResult> {
    return mutate(async () => {
      await setConfig({ baseUrl, token });
      const others = (await getConnections()).filter((c) => c.id !== "default");
      const connections: Connection[] = [...others, { id: "default", baseUrl, token }];
      await setConnections(connections);
      registry.setConnections(connections);
      await registry.reload("default");
      const status = registry.statuses().find((s) => s.id === "default");
      const ok = status?.connected ?? false;
      if (ok && (await getEnabled())) registry.startWatchAll();
      await broadcastSpecsChanged();
      return ok
        ? { ok: true, project: status?.project ?? undefined }
        : { ok: false, error: status?.error ?? "connection failed" };
    });
  }

  /** Shape one connection's current status into the {ok, project, error} report
   *  that ADD_CONNECTION and UPDATE_CONNECTION return after re-validating. */
  function connectReport(id: string): { ok: boolean; project: string | null; error?: string } {
    const status = registry.statuses().find((s) => s.id === id);
    return {
      ok: status?.connected ?? false,
      project: status?.project ?? null,
      error: status?.connected ? undefined : (status?.error ?? "connection failed"),
    };
  }

  function handleAddConnection(message: {
    baseUrl: string;
    token: string;
    label?: string;
    applyToAllSites?: boolean;
  }): Promise<{ ok: boolean; id?: string; project?: string | null; error?: string }> {
    return mutate(async () => {
      const id = crypto.randomUUID();
      const connection: Connection = {
        id,
        baseUrl: message.baseUrl,
        token: message.token,
        label: message.label,
        applyToAllSites: message.applyToAllSites,
      };
      const connections = [...(await getConnections()), connection];
      await setConnections(connections);
      registry.setConnections(connections);
      await registry.reload(id);
      const report = connectReport(id);
      if (report.ok && (await getEnabled())) registry.startWatchAll();
      await broadcastSpecsChanged();
      return { id, ...report };
    });
  }

  function handleRemoveConnection(id: string): Promise<{ ok: true }> {
    return mutate(async () => {
      const all = await getConnections();
      const removed = all.find((c) => c.id === id);
      registry.remove(id);
      const connections = all.filter((c) => c.id !== id);
      await setConnections(connections);
      // Revoke the optional host permission for a remote origin so grants do not
      // accumulate, unless another connection still uses the same origin.
      if (removed) {
        await removeHostPermissionIfUnused(
          removed.baseUrl,
          connections.map((c) => c.baseUrl),
        );
      }
      await broadcastSpecsChanged();
      return { ok: true };
    });
  }

  function handleUpdateConnection(message: {
    id: string;
    label?: string;
    applyToAllSites?: boolean;
    enabled?: boolean;
    baseUrl?: string;
    token?: string;
  }): Promise<{ ok: boolean; project?: string | null; error?: string }> {
    return mutate(async () => {
      const connections = (await getConnections()).map((c) =>
        c.id === message.id
          ? {
              ...c,
              label: message.label ?? c.label,
              applyToAllSites: message.applyToAllSites ?? c.applyToAllSites,
              enabled: message.enabled ?? c.enabled,
              baseUrl: message.baseUrl || c.baseUrl,
              // Omitted (or blank) token keeps the stored secret; a non-empty one
              // replaces it. `||` (not `??`) so an empty string never wipes it.
              token: message.token || c.token,
            }
          : c,
      );
      await setConnections(connections);
      registry.setConnections(connections);
      // Per-project on/off is a lightweight edit (no endpoint re-validation): apply
      // the watch/reload lifecycle for the toggled connection. The `enabled` flag
      // was already set on the connection by setConnections above.
      if (message.enabled !== undefined) {
        await registry.setConnectionEnabled(message.id, message.enabled, await getEnabled());
      }
      // Endpoint edits (URL/token) change the live client, so re-validate and
      // report connect/error like ADD_CONNECTION does. Route through reconnect()
      // (stop -> reload -> start) so the OLD SSE watch is torn down and the NEW
      // endpoint is watched: a plain startWatchAll() would no-op on the stale
      // watch handle and leak the prior stream. A label/opt-in-only edit needs no
      // round-trip.
      if (message.baseUrl !== undefined || message.token !== undefined) {
        await registry.reconnect(message.id, await getEnabled());
        await broadcastSpecsChanged();
        return connectReport(message.id);
      }
      await broadcastSpecsChanged();
      return { ok: connections.some((c) => c.id === message.id) };
    });
  }

  async function handleSetEnabled(enabled: boolean): Promise<{ ok: true }> {
    await setEnabled(enabled);
    if (!enabled) registry.stopWatchAll();
    else registry.startWatchAll();
    // The right-click submenu only exists while Specpin is on.
    void updateContextMenuVisibility(enabled);
    await broadcastSpecsChanged();
    return { ok: true };
  }

  async function handleReconnect(id?: string): Promise<{ ok: boolean }> {
    await registry.reconnect(id, await getEnabled());
    await broadcastSpecsChanged();
    return { ok: registry.anyConnected() };
  }

  async function handleSaveSpec(
    file: string,
    spec: Spec,
    origin: string,
    connectionId?: string,
  ): Promise<SaveSpecResult> {
    // A local (`manual:<batchId>`) target writes to storage.local, never a
    // sidecar; everything else routes to the sidecar registry as before.
    const result =
      connectionId && isLocalConnectionId(connectionId)
        ? await writeLocalSpec(origin, connectionId, spec, file)
        : await registry.saveSpec(origin, file, spec, connectionId);
    // A conflict reloaded the connection with the teammate's change, so refresh
    // the UI even though this write did not land.
    if (result.ok || result.conflict) await broadcastSpecsChanged();
    return result;
  }

  async function handleUpdateSpec(
    id: string,
    spec: Spec,
    origin: string,
    connectionId?: string,
  ): Promise<SaveSpecResult> {
    const result =
      connectionId && isLocalConnectionId(connectionId)
        ? await writeLocalSpec(origin, connectionId, spec, undefined)
        : await registry.updateSpec(origin, id, spec, connectionId);
    if (result.ok || result.conflict) await broadcastSpecsChanged();
    return result;
  }

  // Write a spec (capture or edit) into a local batch. Origin-bounded exactly like
  // a sidecar write (RT-SA7): the batch must serve the page origin under the same
  // applyToAllSites opt-in gate used by the capture picker. The spec is
  // re-validated here because CaptureForm validation is client-side only and a
  // direct runtime.sendMessage bypasses it (local specs never reach the sidecar's
  // Go validator). Runs under the serialized mutate() chain, reading storage truth
  // and persisting the mutator's RETURNED state.
  function writeLocalSpec(
    origin: string,
    connectionId: string,
    spec: Spec,
    file: string | undefined,
  ): Promise<SaveSpecResult> {
    return mutate(async () => {
      const batchId = localBatchId(connectionId);
      if (!batchId) return { ok: false, errors: ["invalid local project"] };
      const state = (await getLocalSpecs()) ?? { batches: [] };
      const batch = state.batches.find((b) => b.id === batchId);
      if (!batch) return { ok: false, errors: ["unknown local project"] };
      if (!batchServesOrigin(batch, origin)) {
        return { ok: false, errors: ["no local project serves this page"] };
      }
      const validation = validateSpec(spec);
      if (!validation.valid) return { ok: false, errors: [formatErrors(validation.errors)] };
      // Target file: explicit for a capture, else the edited spec's existing file,
      // else a default so a brand-new spec still lands in a real *.spec.json.
      const existing = batch.specs.specs.find((s) => s.id === spec.id) as SpecWithFile | undefined;
      const targetFile = file ?? existing?._file ?? defaultLocalFile(batch);
      const group = batch.fileGroups?.[targetFile] ?? groupFromFileName(targetFile);
      const result = upsertLocalSpec(state, batchId, targetFile, group, spec);
      if (!result.ok || !result.state) {
        return { ok: false, errors: [result.error ?? "local write failed"] };
      }
      await setLocalSpecs(result.state);
      registry.setLocalBatches(result.state.batches);
      return { ok: true };
    });
  }

  // The writable destinations (sidecar + local) serving an origin, for the capture
  // "Save to" picker. Sidecar targets must be connected AND serving (a down or
  // disabled connection cannot accept a write); local targets use the registry's
  // applyToAllSites opt-in gate (the single source of truth shared with the
  // writeLocalSpec origin guard). Includes EMPTY local projects.
  function handleGetWriteTargets(origin: string): WriteTarget[] {
    const sidecar: WriteTarget[] = registry
      .statuses()
      .filter((s) => s.connected && connectionServesOrigin(s, origin))
      .map((s) => ({ id: s.id, project: s.project ?? "", kind: "sidecar" }));
    const local: WriteTarget[] = registry
      .localTargetsForOrigin(origin)
      .map((t) => ({ id: t.id, project: t.project, kind: "local" }));
    return [...sidecar, ...local];
  }

  // Reconstruct export bundles (privileged) for a project. The `id` form is a
  // connection id: a local batch carries the `manual:<batchId>` prefix (export its
  // stored bundle), anything else is a sidecar connection id (export its live
  // cache). With no id, return the union of local + sidecar projects serving the
  // origin (legacy/all path; current surfaces always pass an id). The surface zips
  // + downloads the result.
  function handleGetExportBundles(message: { id?: string; origin?: string }): ExportBundle[] {
    const localBundle = (batch: ManualBatch): ExportBundle => ({
      project: batch.specs.manifest?.project || batch.label,
      files: bundleToFiles(batch.specs, batch.fileGroups),
    });
    const sidecarBundle = (b: { project: string; specs: SpecsResponse }): ExportBundle => ({
      project: b.project,
      files: bundleToFiles(b.specs),
    });
    if (message.id) {
      if (isLocalConnectionId(message.id)) {
        const batchId = localBatchId(message.id);
        return batchId ? registry.manualBatchesForExport({ id: batchId }).map(localBundle) : [];
      }
      return registry.sidecarBatchesForExport({ id: message.id }).map(sidecarBundle);
    }
    const local = registry.manualBatchesForExport({ origin: message.origin }).map(localBundle);
    const sidecar = registry.sidecarBatchesForExport({ origin: message.origin }).map(sidecarBundle);
    return [...local, ...sidecar];
  }

  // Create an empty local project (privileged). RMW under mutate(): re-read
  // storage, append the batch, persist FIRST (storage is truth) then sync the
  // registry from it. Returns the new batch id.
  function handleCreateLocalProject(message: {
    project: string;
    domains: string[];
    applyToAllSites?: boolean;
  }): Promise<CreateLocalProjectResult> {
    return mutate(async () => {
      const project = message.project.trim();
      if (!project) return { ok: false, error: "project name required" };
      const state = (await getLocalSpecs()) ?? { batches: [] };
      const id = crypto.randomUUID();
      const result = createLocalBatch(state, {
        id,
        project,
        domains: message.domains ?? [],
        applyToAllSites: message.applyToAllSites,
      });
      if (!result.ok || !result.state) return { ok: false, error: result.error };
      await setLocalSpecs(result.state);
      registry.setLocalBatches(result.state.batches);
      await broadcastSpecsChanged();
      return { ok: true, id };
    });
  }

  // Rename a local project, optionally re-scoping its domains (privileged).
  function handleRenameLocalProject(message: {
    id: string;
    project: string;
    domains?: string[];
  }): Promise<{ ok: boolean; error?: string }> {
    return mutate(async () => {
      const project = message.project.trim();
      if (!project) return { ok: false, error: "project name required" };
      const state = (await getLocalSpecs()) ?? { batches: [] };
      const result = renameLocalBatch(state, message.id, project, message.domains);
      if (!result.ok || !result.state) return { ok: false, error: result.error };
      await setLocalSpecs(result.state);
      registry.setLocalBatches(result.state.batches);
      await broadcastSpecsChanged();
      return { ok: true };
    });
  }

  // Toggle a local project on/off (privileged). RMW under mutate(): persist FIRST
  // (storage is truth), sync the registry from it, then broadcast so every surface
  // re-renders with the batch served or withheld.
  function handleSetLocalBatchEnabled(
    id: string,
    enabled: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    return mutate(async () => {
      const state = (await getLocalSpecs()) ?? { batches: [] };
      const result = setLocalBatchEnabled(state, id, enabled);
      if (!result.ok || !result.state) return { ok: false, error: result.error };
      await setLocalSpecs(result.state);
      registry.setLocalBatches(result.state.batches);
      await broadcastSpecsChanged();
      return { ok: true };
    });
  }

  // Append one Manual-import batch. RMW under mutate() (single writer): re-read
  // storage, reject at the batch cap, assign a uuid + timestamp, persist FIRST
  // (storage is truth) then sync the registry from it, and report which prior
  // batches the new one duplicates.
  function handleAddLocalBatch(message: {
    bundle: SpecsResponse;
    source: "paste" | "files";
    fileNames?: string[];
    fileGroups?: Record<string, string>;
  }): Promise<AddLocalBatchResult> {
    return mutate(async () => {
      const state = (await getLocalSpecs()) ?? { batches: [] };
      if (state.batches.length >= MAX_MANUAL_BATCHES) {
        return {
          ok: false,
          error: `Limit reached (${MAX_MANUAL_BATCHES} batches). Remove some first.`,
          specCount: countAll(),
          duplicateOf: [],
          idCollisions: [],
        };
      }
      const duplicateOf = findDuplicateBatches(message.bundle, state.batches);
      const idCollisions = findSpecIdCollisions(message.bundle, state.batches);
      const batch: ManualBatch = {
        id: crypto.randomUUID(),
        label: message.bundle.manifest?.project || message.fileNames?.[0] || "Pasted bundle",
        source: message.source,
        fileNames: message.fileNames,
        importedAt: Date.now(),
        fileGroups: message.fileGroups,
        specs: message.bundle,
      };
      const next = { batches: [...state.batches, batch] };
      await setLocalSpecs(next);
      registry.setLocalBatches(next.batches);
      await broadcastSpecsChanged();
      return { ok: true, batchId: batch.id, specCount: countAll(), duplicateOf, idCollisions };
    });
  }

  function handleRemoveLocalBatch(id: string): Promise<ManualMutationResult> {
    return mutate(async () => {
      const state = (await getLocalSpecs()) ?? { batches: [] };
      const next = { batches: state.batches.filter((b) => b.id !== id) };
      await setLocalSpecs(next); // empty list removes the key (config.ts)
      if (next.batches.length) registry.setLocalBatches(next.batches);
      else registry.clearLocalSpecs();
      await broadcastSpecsChanged();
      return { ok: true, specCount: countAll() };
    });
  }

  function handleClearLocalSpecs(): Promise<ManualMutationResult> {
    return mutate(async () => {
      await setLocalSpecs(null);
      registry.clearLocalSpecs();
      await broadcastSpecsChanged();
      return { ok: true, specCount: countAll() };
    });
  }

  function countAll(): number {
    return registry.statuses().reduce((n, c) => n + c.specCount, 0) + registry.manualSpecCount();
  }
});

// The *.spec.json a new local spec lands in when none is given: an existing file
// in the batch (keeps groups consolidated), else a slug from the project name,
// else a generic fallback. Module-scope (pure) so it is testable.
function defaultLocalFile(batch: ManualBatch): string {
  const firstFile = batch.specs.specs.find((s) => s._file)?._file;
  if (firstFile) return firstFile;
  return `${slugify(batch.specs.manifest?.project || "specs") || "specs"}.spec.json`;
}

// Validate one guide against the schema before storing it on a non-sidecar path
// (personal storage.sync or a local project). The sidecar branch is validated
// server-side in Go; these stores are not, so a malformed guide must be rejected
// here. Returns a one-line error string, or null when valid. Wraps the guide in a
// minimal GuidesConfig so the existing root validator applies its bounds.
function guideError(guide: GuideDef): string | null {
  const { valid, errors } = validateGuides({ version: "1.0", guides: [guide] });
  return valid ? null : formatErrors(errors);
}
