import { defineConfig } from "wxt";

// Single codebase, per-browser builds. The sidecar runs on localhost; all
// sidecar fetches happen in the background service worker (host_permissions),
// never in the content script, to avoid page-CSP blocking.
export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "Specpin",
    description: "Pin business specifications to UI elements. Read-only MVP.",
    permissions: ["storage", "activeTab", "tabs"],
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
  },
});
