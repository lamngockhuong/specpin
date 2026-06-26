import type { SpecsResponse } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { browser, defineBackground } from "#imports";
import { SidecarController } from "../background/sidecar-controller.js";
import {
  getConfig,
  getEnabled,
  getLocalSpecs,
  setConfig,
  setEnabled,
  setLocalSpecs,
} from "../shared/config.js";
import {
  type Message,
  PRIVILEGED_MESSAGE_TYPES,
  type SaveSpecResult,
  type SetLocalSpecsResult,
  type SpecsForOrigin,
  type StatusResult,
  type TestConnectionResult,
} from "../shared/messaging.js";

export default defineBackground(() => {
  let connected = false;

  const controller = new SidecarController({
    onSpecsChanged: () => void broadcastSpecsChanged(),
  });

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

  async function warmUp(): Promise<void> {
    // Restore Manual-import specs (if any) so they are available with no sidecar.
    const local = await getLocalSpecs();
    if (local) controller.setLocalSpecs(local.specs, local.seq);

    const config = await getConfig();
    if (config) controller.configure(config.baseUrl, config.token);

    if (!config && !local) return;
    try {
      await controller.reload();
      connected = controller.activeSourceId() === "sidecar";
      if (await getEnabled()) controller.startWatch();
    } catch {
      connected = false;
    }
  }

  void warmUp();

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
      case "TEST_CONNECTION":
        return controller.testConnection() as Promise<TestConnectionResult>;
      case "SAVE_CONFIG":
        return handleSaveConfig(message.baseUrl, message.token);
      case "SET_ENABLED":
        return handleSetEnabled(message.enabled);
      case "RELOAD":
        return handleReload();
      case "RECONNECT":
        return handleReconnect();
      case "SAVE_SPEC":
        return handleSaveSpec(message.file, message.spec);
      case "SET_LOCAL_SPECS":
        return handleSetLocalSpecs(message.specs, message.seq);
      default:
        return undefined;
    }
  });

  async function handleGetSpecs(origin: string): Promise<SpecsForOrigin> {
    const enabled = await getEnabled();
    if (!enabled) {
      return { manifest: null, specs: [], enabled };
    }
    // Warm the cache from whichever source is available (sidecar or manual).
    if (!controller.getCache()) {
      try {
        await controller.reload();
        connected = controller.activeSourceId() === "sidecar";
      } catch {
        connected = false;
      }
    }
    return {
      manifest: controller.getCache()?.manifest ?? null,
      specs: controller.specsForOrigin(origin),
      enabled,
    };
  }

  async function handleStatus(): Promise<StatusResult> {
    const enabled = await getEnabled();
    const cache = controller.getCache();
    return {
      // "configured" drives the popup's empty state: true if a sidecar is set
      // up OR manual specs are loaded.
      configured: controller.isConfigured() || controller.hasContent(),
      connected,
      enabled,
      activeSource: controller.activeSourceId(),
      project: cache?.manifest?.project ?? null,
      specCount: cache?.specs.length ?? 0,
    };
  }

  async function handleSaveConfig(baseUrl: string, token: string): Promise<TestConnectionResult> {
    await setConfig({ baseUrl, token });
    controller.configure(baseUrl, token);
    const result = await controller.testConnection();
    connected = result.ok;
    if (result.ok) {
      try {
        await controller.reload();
        if (await getEnabled()) controller.startWatch();
      } catch {
        /* surfaced via subsequent status */
      }
    }
    return result;
  }

  async function handleSetEnabled(enabled: boolean): Promise<{ ok: true }> {
    await setEnabled(enabled);
    if (!enabled) controller.stopWatch();
    else if (controller.isConfigured()) controller.startWatch();
    await broadcastSpecsChanged();
    return { ok: true };
  }

  async function handleReload(): Promise<{ ok: boolean; specCount: number }> {
    try {
      const specs = await controller.reload();
      // "connected" means the sidecar is reachable, not "some source loaded".
      connected = controller.activeSourceId() === "sidecar";
      await broadcastSpecsChanged();
      return { ok: true, specCount: specs.specs.length };
    } catch {
      connected = false;
      return { ok: false, specCount: 0 };
    }
  }

  async function handleSaveSpec(file: string, spec: Spec): Promise<SaveSpecResult> {
    const result = await controller.saveSpec(file, spec);
    if (result.ok) await broadcastSpecsChanged();
    return result;
  }

  async function handleSetLocalSpecs(
    specs: SpecsResponse | null,
    seq: number,
  ): Promise<SetLocalSpecsResult> {
    const applied = controller.setLocalSpecs(specs, seq);
    if (!applied) {
      // Stale/out-of-order write: keep current state.
      return { ok: true, applied: false, specCount: controller.getCache()?.specs.length ?? 0 };
    }
    await setLocalSpecs(specs === null ? null : { specs, seq });
    try {
      await controller.reload();
      connected = controller.activeSourceId() === "sidecar";
    } catch {
      // No source available now (manual cleared and no sidecar): drop the cache
      // so the UI reflects "no specs".
      connected = false;
    }
    await broadcastSpecsChanged();
    return { ok: true, applied: true, specCount: controller.getCache()?.specs.length ?? 0 };
  }

  async function handleReconnect(): Promise<{ ok: boolean }> {
    try {
      await controller.reconnect();
      connected = controller.activeSourceId() === "sidecar";
      await broadcastSpecsChanged();
      return { ok: true };
    } catch {
      connected = false;
      return { ok: false };
    }
  }
});
