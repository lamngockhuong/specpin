import { defineConfig } from "wxt";

// Single codebase, per-browser builds. The sidecar runs on localhost; all
// sidecar fetches happen in the background service worker (host_permissions),
// never in the content script, to avoid page-CSP blocking.
// Brand icon set (PNGs live in public/icon/, generated from designs/specpin-icon.svg).
// WXT auto-detects the top-level `icons` from public/icon/{size}.png; the toolbar
// action icon is not auto-detected, so we set it explicitly per manifest version
// (MV3 -> `action`, MV2 -> `browser_action`).
const iconSet = {
  16: "icon/16.png",
  32: "icon/32.png",
  48: "icon/48.png",
  128: "icon/128.png",
};

export default defineConfig({
  srcDir: "src",
  manifest: ({ manifestVersion }) => ({
    name: "Specpin",
    // Chrome Web Store caps the manifest description at 132 chars; keep this in sync
    // with the store-listing summary in docs/chrome-web-store-listing.md.
    description:
      "Pin living business specs onto the elements of your running web UI. Git-native, local-first, framework-agnostic.",
    // `sidePanel` is a Chrome MV3 permission; Firefox (MV2) uses sidebar_action
    // and would warn on an unknown permission, so add it only for MV3.
    permissions: [
      "storage",
      "activeTab",
      "tabs",
      "alarms",
      // Page right-click "Specpin" submenu. Valid in both MV3 (Chrome) and MV2
      // (Firefox, which also exposes it as `menus`); no scary install warning.
      "contextMenus",
      ...(manifestVersion === 3 ? ["sidePanel"] : []),
    ],
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
    // Firefox (MV2) needs an explicit, stable add-on ID or the `storage` API
    // refuses to work for temporary add-ons (random ID each load via
    // about:debugging). Chrome/MV3 derives its ID from the store/key, so this
    // is scoped to Firefox only.
    ...(manifestVersion === 2
      ? { browser_specific_settings: { gecko: { id: "specpin@ohnice.app" } } }
      : {}),
    ...(manifestVersion === 3
      ? { action: { default_icon: iconSet } }
      : { browser_action: { default_icon: iconSet } }),
  }),
});
