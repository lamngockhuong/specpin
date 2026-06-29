import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import {
  hydrateI18n,
  initI18n,
  resolveUiLocale,
  t,
  watchUiLocaleChanges,
} from "../../i18n/index.js";
import { chromeApi } from "../../shared/chrome-api.js";
import { getUiLocale, setLocale } from "../../shared/config.js";
import { wireDisplayModePicker } from "../../shared/display-mode-picker.js";
import { applyStoredTheme, watchThemeChanges } from "../../shared/theme.js";
import "../../shared/tokens.gen.css";
import "../../shared/scrollbar.css";
import "../../shared/switch.css";
import "../../shared/icon-btn.css";
import "../../shared/link.css";
import "../../shared/add-project.css";
import "../../shared/project-menu.css";
import "../../shared/surface-toast.css";
import { actOnActiveTab } from "../../shared/active-tab-action.js";
import { type SpecsForOrigin, sendToActiveTab, sendToBackground } from "../../shared/messaging.js";
import { wireProjectActions } from "../../shared/project-actions.js";
import {
  buildExportTargets,
  buildFilterModel,
  fetchSurfaceState,
  specMatchesQuery,
} from "../../shared/surface-data.js";
import {
  byId,
  mutedRow,
  renderFilterSection,
  renderLocalePicker,
  renderProjects,
  renderStatus,
  setListControlsHidden,
  sourceBadge,
} from "../../shared/surface-renderers.js";

// The popup is the authoritative language picker: it persists the choice and
// pushes it to the active tab's content script. Latest fetched values drive the
// spec list rendering and the picker options.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;
let searchQuery = "";

function renderSpecs(res: SpecsForOrigin): void {
  const list = byId("specs");
  list.innerHTML = "";
  if (res.specs.length === 0) {
    list.appendChild(mutedRow(res.enabled ? t("common.noSpecsForPage") : t("common.specpinOff")));
    return;
  }
  const defaultLocale = res.manifest?.settings?.defaultLocale;
  const matches = res.specs.filter((spec) =>
    specMatchesQuery(spec, searchQuery, activeLocale, defaultLocale),
  );
  if (matches.length === 0) {
    list.appendChild(mutedRow(t("common.noSearchMatch")));
    return;
  }
  for (const spec of matches) {
    const li = document.createElement("li");
    li.className = "spec";
    li.title = t("common.clickToHighlight");
    // Clicking a spec highlights its element on the page; close the popup (so the
    // page + highlight are unobstructed) only on delivery, else actOnActiveTab
    // keeps the popup open and toasts why.
    li.addEventListener("click", () => {
      void actOnActiveTab({ type: "HIGHLIGHT_ELEMENT", specId: spec.id }, () => window.close());
    });
    const title = document.createElement("div");
    title.className = "t";
    title.append(
      document.createTextNode(
        resolveLocalized(spec.title, activeLocale, res.manifest?.settings?.defaultLocale),
      ),
      sourceBadge(spec),
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
  renderStatus(status, origin, specs.specs.length);
  renderProjects(status, origin);
  renderLocalePicker(status.locales ?? [], activeLocale, specs.enabled);
  // The popup stays compact: group-level filters only (per-spec lives in the panel).
  renderFilterSection(byId("filters"), buildFilterModel(specs, path), refresh);
  // When off, the list collapses to the "off" message: hide controls that only
  // act on the (now-hidden) spec list, plus the create affordance + its panel.
  setListControlsHidden(!specs.enabled);
  // Export is per project serving THIS page (one click exports one project); the
  // shared builder lists the local + sidecar export targets.
  projectActions.update(specs.enabled, buildExportTargets(status, origin));
  renderSpecs(specs);
}

// Shared header controls: "+ New project" (inline form) + "Export" (zip the local
// project(s) serving the page). refresh() re-renders the list after a create.
const projectActions = wireProjectActions(refresh);

byId("enabled").addEventListener("change", async (e) => {
  await sendToBackground({ type: "SET_ENABLED", enabled: (e.target as HTMLInputElement).checked });
  await refresh();
});
byId("capture").addEventListener("click", () => {
  // Close (so the user can click the target element) only on delivery; otherwise
  // actOnActiveTab keeps the popup open and shows why capture could not start.
  void actOnActiveTab({ type: "START_CAPTURE" }, () => window.close());
});
void wireDisplayModePicker(byId("mode") as HTMLSelectElement);
byId("locale").addEventListener("change", async (e) => {
  activeLocale = (e.target as HTMLSelectElement).value;
  await setLocale(activeLocale);
  await sendToActiveTab({ type: "SET_LOCALE", locale: activeLocale });
  if (lastSpecs) renderSpecs(lastSpecs);
});
byId("search").addEventListener("input", (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
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

// Apply the forced theme as early as possible (before the first paint settles)
// and keep it live if the user changes it in Options while the popup is open.
void applyStoredTheme();
watchThemeChanges();

// Resolve the UI-chrome language, hydrate the static HTML, then render. initI18n
// runs before the first refresh so every t() call uses the chosen language.
async function init(): Promise<void> {
  initI18n(resolveUiLocale(await getUiLocale()));
  hydrateI18n(document);
  await refresh();
}
// Re-hydrate + re-render if the UI language changes in Options while open.
watchUiLocaleChanges(() => {
  hydrateI18n(document);
  void refresh();
});
void init();
