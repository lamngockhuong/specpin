import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../fixtures/extension.js";
import { EXTENSION_OUTPUT } from "../../setup/paths.js";

/** run-guide §5 — the extension loads.
 *
 *  Reads the *built* `manifest.json`, not `wxt.config.ts`. The config is what we
 *  intended; the manifest is what Chrome was handed. A build that dropped a
 *  permission would leave the config looking correct and every downstream scenario
 *  failing for an unrelated-looking reason, so this is the check that localizes it. */
test.describe("§5 load extension", () => {
  test("registers a live service worker", async ({ extensionId, serviceWorker }) => {
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    const runtimeId = await serviceWorker.evaluate(() => chrome.runtime.id);
    expect(runtimeId).toBe(extensionId);
  });

  test("ships the MV3 permission set the features depend on", async () => {
    const manifest = JSON.parse(
      await readFile(join(EXTENSION_OUTPUT, "manifest.json"), "utf8"),
    ) as {
      manifest_version: number;
      permissions: string[];
      host_permissions: string[];
      optional_host_permissions?: string[];
    };

    expect(manifest.manifest_version).toBe(3);

    // Each of these backs a shipped capability: storage (all config), activeTab+tabs
    // (surface targeting), alarms (reconnect scheduling), contextMenus (the page
    // submenu), sidePanel (Chrome-only, MV3-only).
    expect(manifest.permissions).toEqual(
      expect.arrayContaining([
        "storage",
        "activeTab",
        "tabs",
        "alarms",
        "contextMenus",
        "sidePanel",
      ]),
    );

    // Declared host access stays localhost-only so a fresh install shows no
    // broad-host warning; a remote HTTPS sidecar is requested at connect time
    // instead. Asserted exactly, because widening this silently changes what the
    // store shows users at install.
    expect(manifest.host_permissions.sort()).toEqual(["http://127.0.0.1/*", "http://localhost/*"]);
    expect(manifest.optional_host_permissions).toEqual(["https://*/*"]);
  });

  test("exposes the extension pages the surfaces need", async ({ context, extensionId }) => {
    // A page that fails to build would 404 here rather than at the first scenario
    // that happens to open it.
    for (const name of ["options", "popup", "sidepanel", "graph"]) {
      const tab = await context.newPage();
      const response = await tab.goto(`chrome-extension://${extensionId}/${name}.html`);
      expect(response?.status(), `${name}.html should load`).toBe(200);
      await tab.close();
    }
  });
});
