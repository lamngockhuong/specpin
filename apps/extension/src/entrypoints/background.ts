import { browser, defineBackground } from "#imports";
import { SidecarController } from "../background/sidecar-controller.js";
import { getConfig, getEnabled, setConfig, setEnabled } from "../shared/config.js";
import type { Spec } from "@specpin/spec-schema";
import type {
  Message,
  SaveSpecResult,
  SpecsForOrigin,
  StatusResult,
  TestConnectionResult,
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
        browser.tabs.sendMessage(tab.id, { type: "SPECS_CHANGED" } satisfies Message).catch(() => {});
      }
    }
  }

  async function warmUp(): Promise<void> {
    const config = await getConfig();
    if (!config) return;
    controller.configure(config.baseUrl, config.token);
    try {
      await controller.reload();
      connected = true;
      if (await getEnabled()) controller.startWatch();
    } catch {
      connected = false;
    }
  }

  void warmUp();

  browser.runtime.onMessage.addListener((raw, sender): Promise<unknown> | undefined => {
    const message = raw as Message;
    // Config mutation must originate from an extension page (popup/options),
    // never from a web-page content script (which carries sender.tab).
    if (message.type === "SAVE_CONFIG" && sender?.tab !== undefined) {
      return Promise.resolve({ ok: false, error: "forbidden" } satisfies TestConnectionResult);
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
      default:
        return undefined;
    }
  });

  async function handleGetSpecs(origin: string): Promise<SpecsForOrigin> {
    const enabled = await getEnabled();
    if (!controller.isConfigured() || !enabled) {
      return { manifest: null, specs: [], enabled };
    }
    if (!controller.getCache()) {
      try {
        await controller.reload();
        connected = true;
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
      configured: controller.isConfigured(),
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
      connected = true;
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

  async function handleReconnect(): Promise<{ ok: boolean }> {
    try {
      await controller.reconnect();
      connected = true;
      await broadcastSpecsChanged();
      return { ok: true };
    } catch {
      connected = false;
      return { ok: false };
    }
  }
});
