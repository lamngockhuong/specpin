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
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";
import "../../shared/scrollbar.css";
import "../../shared/switch.css";
import "../../shared/icon-btn.css";
import "../../shared/link.css";
import "../../shared/add-project.css";
import "../../shared/project-menu.css";
import "../../shared/surface-toast.css";
import "../../shared/guide-section.css";
import "../../shared/guide-editor.css";
import "../../shared/scope-toggle.css";
import "../../shared/surface-health.css";
import "../../shared/surface-digest.css";
import "../../shared/surface-states.css";
import { actOnActiveTab } from "../../shared/active-tab-action.js";
import { clearDraft, loadDraft, saveDraft } from "../../shared/draft-store.js";
import { mountGuideSection } from "../../shared/guide-section.js";
import {
  type MatchReportEntry,
  type SpecsForOrigin,
  sendToActiveTab,
  sendToBackground,
} from "../../shared/messaging.js";
import { wireProjectActions } from "../../shared/project-actions.js";
import {
  buildExportTargets,
  buildFilterModel,
  fetchMatchState,
  fetchSurfaceState,
  pageHealth,
  type SpecScope,
  scopeSpecs,
  specMatchesQuery,
} from "../../shared/surface-data.js";
import {
  byId,
  mountDigest,
  mountFragileScan,
  mountScopeToggle,
  mutedRow,
  renderFilterSection,
  renderHealthSummary,
  renderLocalePicker,
  renderProjects,
  renderStatus,
  setSurfaceState,
  sourceBadge,
} from "../../shared/surface-renderers.js";

// The popup is the authoritative language picker: it persists the choice and
// pushes it to the active tab's content script. Latest fetched values drive the
// spec list rendering and the picker options.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;
let searchQuery = "";
// Spec-list scope: default to the specs pinned on the current page, switchable to
// the full origin set via the "This page | All" toggle. Resets to "page" on each
// popup open (module reload). `matchedIds` is the current page's match set, or
// null when no content script could report it (fall back to the full list).
let scope: SpecScope = "page";
let matchedIds: Set<string> | null = null;
// The page match report (per-spec tier + anchor strength), for the health summary
// and the fragile-spec scan. Null when no content script could report it.
let lastReport: MatchReportEntry[] | null = null;

function renderSpecs(res: SpecsForOrigin): void {
  const list = byId("specs");
  list.innerHTML = "";
  if (res.specs.length === 0) {
    list.appendChild(mutedRow(res.enabled ? t("common.noSpecsForPage") : t("common.specpinOff")));
    return;
  }
  const defaultLocale = res.manifest?.settings?.defaultLocale;
  // Scope to the current page first (the toggle), then apply the search filter.
  const scoped = scopeSpecs(res.specs, scope, matchedIds);
  if (scoped.length === 0) {
    list.appendChild(mutedRow(t("common.noSpecsForPage")));
    return;
  }
  const matches = scoped.filter((spec) =>
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

// The Guides launch section (start a tour, create/edit/delete guides). Launching
// closes the popup so the tour is unobscured (only on delivery, like Capture).
const guideSection = mountGuideSection(byId("guides"), {
  launch: (steps, name) =>
    void actOnActiveTab({ type: "START_GUIDE", steps, name }, () => window.close()),
});

// The fragile-spec list (shared wiring): a collapsible group above the search box
// that lists weak-anchored, currently-failing specs with a copyable data-spec-id
// snippet. Reads module state (enabled, lastReport, specs, locale) on each render.
const fragileScan = mountFragileScan(byId("scan"), byId("scan-results"), {
  getState: () => ({
    enabled: lastSpecs?.enabled ?? false,
    report: lastReport,
    specs: lastSpecs?.specs ?? [],
    locale: activeLocale,
    defaultLocale: lastSpecs?.manifest?.settings?.defaultLocale,
  }),
});

// The "what changed since last visit" digest (shared wiring). Reads module state
// on each render; "Mark all seen" persists the baseline then refreshes.
const digest = mountDigest(byId("digest"), {
  getState: () => ({
    specs: lastSpecs?.specs ?? [],
    enabled: lastSpecs?.enabled ?? false,
    locale: activeLocale,
    defaultLocale: lastSpecs?.manifest?.settings?.defaultLocale,
  }),
  refresh,
});

// The "This page | All" scope toggle above the search box (shared wiring). It
// reads module state (lastSpecs, scope, matchedIds) on each render and, on click,
// re-renders itself + the list.
const scopeToggle = mountScopeToggle(byId("scope"), {
  getState: () => ({
    enabled: lastSpecs?.enabled ?? false,
    scope,
    matchedIds,
    specs: lastSpecs?.specs ?? [],
  }),
  setScope: (s) => {
    scope = s;
  },
  renderList: () => {
    if (lastSpecs) renderSpecs(lastSpecs);
  },
});

async function refresh(): Promise<void> {
  // Query the page's match state (ids + report) concurrently with the background
  // status/specs fetch (independent round trips); gate the assignment on `enabled`.
  const matchPromise = fetchMatchState();
  const { status, specs, origin, path, activeLocale: locale } = await fetchSurfaceState();
  activeLocale = locale;
  lastSpecs = specs;
  // Start the digest now (reads module state just set) so its storage read overlaps
  // the renders below; awaited before this refresh returns.
  const digestReady = digest.render();
  // Skip the match state when off: the list collapses to the "off" message and the
  // toggle hides anyway (the in-flight query resolves to null and is discarded).
  const match = specs.enabled ? await matchPromise : { ids: null, report: null };
  matchedIds = match.ids;
  lastReport = match.report;
  renderStatus(status, origin, specs.specs.length);
  // Full-surface states: the empty state (Option A) when no project serves this
  // page, else the paused state when Specpin is off. Every renderer below still
  // runs but its element is hidden by the body class, so no ordering special-case
  // is needed.
  setSurfaceState(status, origin, specs.enabled);
  renderHealthSummary(byId("health"), lastReport ? pageHealth(lastReport) : null, specs.enabled);
  renderProjects(status, origin);
  await guideSection.refresh({
    origin,
    enabled: specs.enabled,
    locale,
    defaultLocale: specs.manifest?.settings?.defaultLocale,
  });
  renderLocalePicker(status.locales ?? [], activeLocale, specs.enabled);
  // The popup stays compact: group-level filters only (per-spec lives in the panel).
  renderFilterSection(byId("filters"), buildFilterModel(specs, path), refresh);
  scopeToggle.render();
  fragileScan.render();
  // Export is per project serving THIS page (one click exports one project); the
  // shared builder lists the local + sidecar export targets.
  projectActions.update(specs.enabled, buildExportTargets(status, origin));
  renderSpecs(specs);
  await digestReady;
}

// Shared header controls: "+ New project" (inline form) + "Export" (zip the local
// project(s) serving the page). refresh() re-renders the list after a create.
const projectActions = wireProjectActions(refresh, "popup");

byId("enabled").addEventListener("change", async (e) => {
  await sendToBackground({ type: "SET_ENABLED", enabled: (e.target as HTMLInputElement).checked });
  await refresh();
});
byId("capture").addEventListener("click", () => {
  // Close (so the user can click the target element) only on delivery; otherwise
  // actOnActiveTab keeps the popup open and shows why capture could not start.
  void actOnActiveTab({ type: "START_CAPTURE" }, () => window.close());
});
// The empty-state "New project" opens the same inline add-project form as the
// header button, via the shared action rather than a synthetic header-button click.
byId("es-new").addEventListener("click", () => projectActions.toggleAddProject());
void wireDisplayModePicker(byId("mode") as HTMLSelectElement);
byId("locale").addEventListener("change", async (e) => {
  activeLocale = (e.target as HTMLSelectElement).value;
  await setLocale(activeLocale);
  await sendToActiveTab({ type: "SET_LOCALE", locale: activeLocale });
  if (lastSpecs) renderSpecs(lastSpecs);
});
// The search query is the one popup-only field worth surviving a dismiss: the
// popup closes on blur, so we stash the query (session-scoped) and restore it on
// the next open. An empty query clears the draft rather than persisting "".
const SEARCH_DRAFT_KEY = "popup:search";
byId("search").addEventListener("input", (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
  void (searchQuery ? saveDraft(SEARCH_DRAFT_KEY, searchQuery) : clearDraft(SEARCH_DRAFT_KEY));
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

// Show the actual extension version from the manifest, not a hardcoded string.
// The pill links to the hosted changelog (href is static in index.html).
byId("version").textContent = `v${browser.runtime.getManifest().version}`;

// Resolve the UI-chrome language, hydrate the static HTML, then render. initI18n
// runs before the first refresh so every t() call uses the chosen language.
async function init(): Promise<void> {
  initI18n(resolveUiLocale(await getUiLocale()));
  hydrateI18n(document);
  // Restore a search query stashed from a prior (dismissed) popup before the
  // first render, so the spec list comes up already filtered.
  const draftSearch = await loadDraft<string>(SEARCH_DRAFT_KEY);
  if (draftSearch) {
    searchQuery = draftSearch;
    (byId("search") as HTMLInputElement).value = draftSearch;
  }
  await refresh();
}
// Re-hydrate + re-render if the UI language changes in Options while open.
watchUiLocaleChanges(() => {
  hydrateI18n(document);
  void refresh();
});
void init();
