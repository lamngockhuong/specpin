import { defineConfig } from "wxt";

// Single codebase, per-browser builds. The sidecar runs on localhost by default
// (declared host_permissions) but may be a remote HTTPS endpoint behind a reverse
// proxy, whose origin is granted at connect time via the optional host
// permissions below. All sidecar fetches happen in the background service worker,
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
  // Release zip naming: `specpin-{version}-{browser}.zip` (the default would be
  // the sanitized package name "specpinextension"). Keeps GitHub Release assets
  // readable; the release workflow attaches the chrome + firefox zips.
  zip: {
    name: "specpin",
  },
  manifest: ({ manifestVersion }) => ({
    // i18n via Chrome-native _locales/ (public/_locales/{en,vi}/messages.json).
    // This drives the browser-level name/description AND populates the store's
    // listing-language dropdown (the store offers exactly the shipped locales).
    // It is separate from the in-UI runtime i18n (src/i18n + t()).
    default_locale: "en",
    name: "__MSG_extName__",
    // Chrome Web Store caps the manifest description at 132 chars; the localized
    // strings live in public/_locales/*/messages.json (keep in sync with the
    // store-listing summaries in docs/chrome-web-store-listing.md).
    description: "__MSG_extDescription__",
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
    // Declared (install-time) host access stays localhost-only, so the default
    // install shows no broad-host warning. A remote HTTPS sidecar origin is NOT
    // declared here; it is requested per-origin at connect time (and revoked on
    // delete) via the optional permissions below.
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
    // Optional (runtime-requested) access for a remote HTTPS sidecar. MV3 uses
    // optional_host_permissions; MV2 (Firefox) folds host patterns into
    // optional_permissions. Requesting a specific origin at connect time keeps the
    // grant scoped and revocable without a broad install warning.
    ...(manifestVersion === 3
      ? { optional_host_permissions: ["https://*/*"] }
      : { optional_permissions: ["https://*/*"] }),
    // Firefox (MV2) needs an explicit, stable add-on ID or the `storage` API
    // refuses to work for temporary add-ons (random ID each load via
    // about:debugging). Chrome/MV3 derives its ID from the store/key, so this
    // is scoped to Firefox only.
    ...(manifestVersion === 2
      ? {
          browser_specific_settings: {
            gecko: {
              id: "specpin@ohnice.app",
              // AMO requires every add-on to declare its data collection. Specpin
              // performs no telemetry; specs are transmitted only to the
              // user-operated sidecar they explicitly connect to (localhost or
              // their own remote host), which is not third-party data collection,
              // so the required set is the special "none" sentinel. The remote
              // case is verified against current AMO policy before the Firefox
              // release (see docs/chrome-web-store-listing.md).
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
    ...(manifestVersion === 3
      ? { action: { default_icon: iconSet } }
      : { browser_action: { default_icon: iconSet } }),
    // The bundled Inter woff2 (public/fonts/) must be web-accessible so the
    // content script can register it on the host document for the shadow-DOM
    // renderers (see shared/inter-font.ts). MV3 uses the object form with match
    // patterns; MV2 (Firefox) uses a flat resource list. The extension's own
    // pages load the font directly and do not need this entry.
    ...(manifestVersion === 3
      ? {
          web_accessible_resources: [
            { resources: ["fonts/*"], matches: ["http://*/*", "https://*/*"] },
          ],
        }
      : { web_accessible_resources: ["fonts/*"] }),
  }),
});
