import type { DisplayMode } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { chromeApi } from "../../shared/chrome-api.js";
import { setLocale } from "../../shared/config.js";
import "../../shared/tokens.gen.css";
import "../../shared/scrollbar.css";
import { type SpecsForOrigin, sendToActiveTab, sendToBackground } from "../../shared/messaging.js";
import { buildFilterModel, fetchSurfaceState } from "../../shared/surface-data.js";
import {
  byId,
  renderFilterSection,
  renderLocalePicker,
  renderProjects,
  renderStatus,
} from "../../shared/surface-renderers.js";

// The popup is the authoritative language picker: it persists the choice and
// pushes it to the active tab's content script. Latest fetched values drive the
// spec list rendering and the picker options.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;

function renderSpecs(res: SpecsForOrigin): void {
  const list = byId("specs");
  list.innerHTML = "";
  if (res.specs.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = res.enabled ? "No specs for this page." : "Specpin is off.";
    list.appendChild(li);
    return;
  }
  for (const spec of res.specs) {
    const li = document.createElement("li");
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = resolveLocalized(
      spec.title,
      activeLocale,
      res.manifest?.settings?.defaultLocale,
    );
    const file = document.createElement("div");
    file.className = "muted";
    file.textContent = spec._file;
    li.append(title, file);
    list.appendChild(li);
  }
}

async function refresh(): Promise<void> {
  const { status, specs, origin, path, activeLocale: locale } = await fetchSurfaceState();
  activeLocale = locale;
  lastSpecs = specs;
  renderStatus(status);
  renderProjects(status.connections ?? [], origin);
  renderLocalePicker(status.locales ?? [], activeLocale);
  // The popup stays compact: group-level filters only (per-spec lives in the panel).
  renderFilterSection(byId("filters"), buildFilterModel(specs, path), refresh);
  renderSpecs(specs);
}

byId("enabled").addEventListener("change", async (e) => {
  await sendToBackground({ type: "SET_ENABLED", enabled: (e.target as HTMLInputElement).checked });
  await refresh();
});
byId("reload").addEventListener("click", async () => {
  await sendToBackground({ type: "RELOAD" });
  await refresh();
});
byId("reconnect").addEventListener("click", async () => {
  await sendToBackground({ type: "RECONNECT" });
  await refresh();
});
byId("capture").addEventListener("click", async () => {
  await sendToActiveTab({ type: "START_CAPTURE" });
  window.close(); // let the user click the target element on the page
});
byId("mode").addEventListener("change", async (e) => {
  const value = (e.target as HTMLSelectElement).value;
  await sendToActiveTab({ type: "SET_DISPLAY_MODE", mode: (value || null) as DisplayMode | null });
});
byId("locale").addEventListener("change", async (e) => {
  activeLocale = (e.target as HTMLSelectElement).value;
  await setLocale(activeLocale);
  await sendToActiveTab({ type: "SET_LOCALE", locale: activeLocale });
  if (lastSpecs) renderSpecs(lastSpecs);
});
byId("open-options").addEventListener("click", () => browser.runtime.openOptionsPage());

// Chrome only: offer to dock the panel from the popup (the click is the required
// user gesture for sidePanel.open). Firefox lacks chrome.sidePanel and opens its
// sidebar from the native toggle, so the button stays hidden there.
const api = chromeApi();
const sidePanel = api?.sidePanel;
if (sidePanel?.open) {
  const openPanel = byId("open-sidepanel");
  openPanel.hidden = false;
  openPanel.addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });
}

void refresh();
