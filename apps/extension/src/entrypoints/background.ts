import type { SpecsResponse } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { browser, defineBackground } from "#imports";
import { SidecarRegistry } from "../background/sidecar-registry.js";
import {
  getConnections,
  getEnabled,
  getLocalSpecs,
  setConfig,
  setConnections,
  setEnabled,
  setLocalSpecs,
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

const KEEPALIVE_ALARM = "specpin-keepalive";

export default defineBackground(() => {
  const registry = new SidecarRegistry({
    onSpecsChanged: () => void broadcastSpecsChanged(),
    // Per-connection reconnect jitter so N connections that drop together do not
    // reconnect in lockstep (RT-FM2).
    jitterMs: 2_000,
  });

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
      const local = await getLocalSpecs();
      if (local) registry.setLocalSpecs(local.specs, local.seq);
      const connections = await getConnections();
      const enabled = await getEnabled();
      await registry.reestablish(connections, enabled);
    } catch {
      // Next wake (message/alarm) retries; nothing actionable here.
    }
  }

  void reestablish();

  browser.runtime.onStartup?.addListener(() => void reestablish());
  browser.runtime.onInstalled?.addListener(() => void reestablish());
  // The MV3 worker suspends when idle and SSE cannot wake it, so a watch can lag
  // up to one alarm period behind a change. This alarm re-establishes watches
  // (and the module re-evaluates on any wake); 1 minute is the packed floor.
  browser.alarms?.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) void reestablish();
  });

  browser.runtime.onMessage.addListener((raw, sender): Promise<unknown> | undefined => {
    const message = raw as Message;
    // Privileged (state-mutating) messages must originate from an extension page
    // (popup/options), never from a web-page content script (carries sender.tab).
    if (PRIVILEGED_MESSAGE_TYPES.has(message.type) && sender?.tab !== undefined) {
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
      default:
        return undefined;
    }
  });

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
    return { manifest, specs, enabled, locales };
  }

  async function handleStatus(): Promise<StatusResult> {
    const enabled = await getEnabled();
    const connections = registry.statuses();
    const connected = connections.some((c) => c.connected);
    const firstConnected = connections.find((c) => c.connected) ?? connections[0];
    const locales = registry.allLocales();
    return {
      configured: registry.isConfigured() || registry.hasContent(),
      connected,
      enabled,
      activeSource: connected ? "sidecar" : registry.hasContent() ? "manual" : null,
      project: firstConnected?.project ?? null,
      specCount: connections.reduce((n, c) => n + c.specCount, 0) + registry.manualSpecCount(),
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
      const status = registry.statuses().find((s) => s.id === id);
      if (status?.connected && (await getEnabled())) registry.startWatchAll();
      await broadcastSpecsChanged();
      return {
        ok: status?.connected ?? false,
        id,
        project: status?.project ?? null,
        error: status?.connected ? undefined : (status?.error ?? "connection failed"),
      };
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
  }): Promise<{ ok: boolean }> {
    return mutate(async () => {
      const connections = (await getConnections()).map((c) =>
        c.id === message.id
          ? {
              ...c,
              label: message.label ?? c.label,
              applyToAllSites: message.applyToAllSites ?? c.applyToAllSites,
            }
          : c,
      );
      await setConnections(connections);
      registry.setConnections(connections);
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
