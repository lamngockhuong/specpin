import type { SpecsResponse, ViewsConfig } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { browser, defineBackground } from "#imports";
import { SidecarRegistry } from "../background/sidecar-registry.js";
import { chromeApi } from "../shared/chrome-api.js";
import {
  getConnections,
  getDefaultSurface,
  getEnabled,
  getLocalSpecs,
  getPersonalVisibility,
  LOCAL_SPECS_KEY,
  SURFACE_KEY,
  setConfig,
  setConnections,
  setEnabled,
  setLocalSpecs,
  setPersonalVisibility,
  VISIBILITY_KEY,
} from "../shared/config.js";
import type { Connection } from "../shared/connection-types.js";
import {
  type Message,
  PRIVILEGED_MESSAGE_TYPES,
  type SaveSpecResult,
  type SetLocalSpecsResult,
  type SpecsForOrigin,
  type StatusResult,
  type TestConnectionResult,
} from "../shared/messaging.js";
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

  // Reconcile the in-memory manual bundle against storage truth: apply the stored
  // bundle, or drop a stale in-memory one storage no longer has. The clear path is
  // the fix for a wiped/cleared `specpin:localSpecs` (e.g. a DevTools storage
  // clear): the apply path can only ADD, so without this a leaked bundle would
  // render for the life of the worker. Broadcasts only when the registry actually
  // changed (skips the no-op echo from an in-process write that already updated it).
  async function reconcileLocalSpecs(broadcast: boolean): Promise<void> {
    try {
      const local = await getLocalSpecs();
      const applied = local
        ? registry.setLocalSpecs(local.specs, local.seq)
        : registry.clearLocalSpecs();
      if (applied && broadcast) await broadcastSpecsChanged();
    } catch {
      // Best-effort; the keepalive alarm reconciles on its next tick.
    }
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

  // Both run at module eval and on every service-worker wake (onStartup /
  // onInstalled): re-establish watches and re-apply the toolbar-click surface.
  function initWorker(): void {
    void reestablish();
    void applySurfaceBehavior();
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
    // Mirror an out-of-band manual-bundle change (e.g. a DevTools storage clear,
    // which the in-process write path never routes through SET_LOCAL_SPECS) into
    // the live registry at once, rather than waiting for the keepalive alarm.
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
      case "RELOAD":
        return handleReload();
      case "RECONNECT":
        return handleReconnect(message.id);
      case "SAVE_SPEC":
        return handleSaveSpec(message.file, message.spec, originOf(sender), message.connectionId);
      case "SET_LOCAL_SPECS":
        return handleSetLocalSpecs(message.specs, message.seq);
      case "SET_PERSONAL_VISIBILITY":
        return handleSetPersonalVisibility(message.visibility);
      case "GET_TEAM_VIEWS":
        return Promise.resolve(registry.getViews(message.connectionId));
      case "SAVE_TEAM_VIEWS":
        return handleSaveTeamViews(message.connectionId, message.views);
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
    const url = sender?.tab?.url;
    if (!url) return "";
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
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
    const connected = connections.some((c) => c.connected);
    const locales = registry.allLocales();
    return {
      configured: registry.isConfigured() || registry.hasContent(),
      connected,
      enabled,
      activeSource: connected ? "sidecar" : registry.hasContent() ? "manual" : null,
      locales: locales.length ? locales : ["en"],
      connections,
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
      registry.remove(id);
      const connections = (await getConnections()).filter((c) => c.id !== id);
      await setConnections(connections);
      await broadcastSpecsChanged();
      return { ok: true };
    });
  }

  function handleUpdateConnection(message: {
    id: string;
    label?: string;
    applyToAllSites?: boolean;
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
              baseUrl: message.baseUrl || c.baseUrl,
              // Omitted (or blank) token keeps the stored secret; a non-empty one
              // replaces it. `||` (not `??`) so an empty string never wipes it.
              token: message.token || c.token,
            }
          : c,
      );
      await setConnections(connections);
      registry.setConnections(connections);
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
    await broadcastSpecsChanged();
    return { ok: true };
  }

  async function handleReload(): Promise<{ ok: boolean; specCount: number }> {
    await registry.reload();
    await broadcastSpecsChanged();
    // "ok" means content is available after reload: a reachable sidecar or
    // loaded manual specs (manual-only must not report failure).
    return { ok: registry.anyConnected() || registry.hasContent(), specCount: countAll() };
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
    const result = await registry.saveSpec(origin, file, spec, connectionId);
    if (result.ok) await broadcastSpecsChanged();
    return result;
  }

  async function handleSetLocalSpecs(
    specs: SpecsResponse | null,
    seq: number,
  ): Promise<SetLocalSpecsResult> {
    const applied = registry.setLocalSpecs(specs, seq);
    if (!applied) {
      return { ok: true, applied: false, specCount: countAll() };
    }
    await setLocalSpecs(specs === null ? null : { specs, seq });
    await broadcastSpecsChanged();
    return { ok: true, applied: true, specCount: countAll() };
  }

  function countAll(): number {
    return registry.statuses().reduce((n, c) => n + c.specCount, 0) + registry.manualSpecCount();
  }
});
