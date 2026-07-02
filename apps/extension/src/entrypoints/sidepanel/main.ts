import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import {
  hydrateI18n,
  initI18n,
  resolveUiLocale,
  t,
  watchUiLocaleChanges,
} from "../../i18n/index.js";
import { getUiLocale, setLocale } from "../../shared/config.js";
import { wireDisplayModePicker } from "../../shared/display-mode-picker.js";
import { renderInlineMarkdown, renderMarkdownBlock } from "../../shared/markdown.js";
import { applyStoredTheme, watchThemeChanges } from "../../shared/theme.js";
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
import { actOnActiveTab } from "../../shared/active-tab-action.js";
import { mountGuideSection } from "../../shared/guide-section.js";
import {
  type MatchReportEntry,
  type Message,
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
  orphanedSpecs,
  pageHealth,
  type SpecScope,
  scopeSpecs,
  specMatchesQuery,
  visibilityOf,
} from "../../shared/surface-data.js";
import {
  byId,
  mountFragileScan,
  mountScopeToggle,
  mutedRow,
  renderFilterSection,
  renderHealthSummary,
  renderLocalePicker,
  renderProjects,
  renderStatus,
  setListControlsHidden,
  sourceBadge,
  tierBadge,
} from "../../shared/surface-renderers.js";
import { isVisible, setSpecVisibility, type VisibilityState } from "../../shared/visibility.js";

// The side panel is a persistent surface (unlike the ephemeral popup): it stays
// open while the user navigates, so it listens for tab activation / URL changes
// and SPECS_CHANGED and re-renders. It also shows richer per-spec detail
// (description + business rules) inline, since it has the vertical room.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;
let searchQuery = "";
let currentPath = "/";
// Active tab's origin, so spec-text links to that origin render as same-tab
// navigations (see the data-specpin-internal interceptor below).
let currentOrigin = "";
let currentState: VisibilityState = { teamHidden: [], personal: { forceHide: [], forceShow: [] } };
// Spec-list scope (see the popup for the shared rationale): default to specs
// pinned on the current page, switchable to the full origin set. `matchedIds` is
// the page's match set, or null when no content script could report it.
let scope: SpecScope = "page";
let matchedIds: Set<string> | null = null;
// The page match report + a by-id index, for the health summary, per-card tier
// badges, and the orphaned section. Null when no content script could report it.
let lastReport: MatchReportEntry[] | null = null;
let reportById: Map<string, MatchReportEntry> = new Map();

// Per-spec eye toggle: a hard per-spec override that wins across axes (a spec
// hidden by a tag can still be re-shown here). Persists then re-fetches.
async function toggleSpec(
  spec: { id: string; tags?: string[]; file?: string },
  visible: boolean,
): Promise<void> {
  const next = setSpecVisibility(spec, currentPath, currentState, visible);
  await sendToBackground({ type: "SET_PERSONAL_VISIBILITY", visibility: next });
  await refresh();
}

/** Build a spec-card action button (Delete / Edit / Hide). The click stops
 *  propagation so it never bubbles to the card's highlight handler, then runs
 *  `onClick` - single-sourcing that contract across the three buttons. */
function actionButton(
  className: string,
  label: string,
  tip: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.title = tip;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Each spec is a card with title, description, file, and (when present) the
 *  business rules inline. Text goes through DOM nodes (never innerHTML) so spec
 *  content is never an HTML-injection sink. */
function renderSpecs(res: SpecsForOrigin): void {
  const list = byId("specs");
  list.replaceChildren();
  if (res.specs.length === 0) {
    list.appendChild(mutedRow(res.enabled ? t("common.noSpecsForPage") : t("common.specpinOff")));
    return;
  }
  const defaultLocale = res.manifest?.settings?.defaultLocale;
  // Page origin for internal-link routing; undefined before the first refresh.
  const pageOrigin = currentOrigin || undefined;
  const multiProject = new Set(res.specs.map((s) => s.project)).size > 1;
  const state = visibilityOf(res);
  // Scope to the current page first (the toggle), then apply the search filter.
  const scoped = scopeSpecs(res.specs, scope, matchedIds);
  if (scoped.length === 0) {
    list.appendChild(mutedRow(t("common.noSpecsForPage")));
    return;
  }
  const matches = scoped.filter((spec) =>
    specMatchesQuery(spec, searchQuery, activeLocale, defaultLocale, true),
  );
  if (matches.length === 0) {
    list.appendChild(mutedRow(t("common.noSearchMatch")));
    return;
  }
  for (const spec of matches) {
    const li = document.createElement("li");
    li.className = "spec";
    // Stable anchor so a tooltip "open in side panel" can scroll to this card.
    li.dataset.specId = spec.id;
    // Clicking the card scrolls to and highlights the matched element on the page.
    li.title = t("common.clickToHighlight");
    li.addEventListener("click", () => {
      void actOnActiveTab({ type: "HIGHLIGHT_ELEMENT", specId: spec.id });
    });

    const facets = { id: spec.id, tags: spec.tags, file: spec._file };
    const visible = isVisible(facets, currentPath, state);
    if (!visible) li.classList.add("spec-hidden");

    if (multiProject && spec.project) {
      const project = document.createElement("span");
      project.className = "project";
      project.textContent = spec.project;
      li.appendChild(project);
    }

    // Header row: the title (with source + match-tier badges) flexes to fill and
    // wraps when long; the action cluster stays flush-right. They are flex
    // siblings, not overlapping layers, so a long title can never run under the
    // actions (the fixed-offset overlap bug).
    const head = document.createElement("div");
    head.className = "spec-head";

    const title = document.createElement("div");
    title.className = "t";
    title.append(
      document.createTextNode(resolveLocalized(spec.title, activeLocale, defaultLocale)),
      sourceBadge(spec),
    );
    // Match-tier badge (fuzzy only; exact is silent), aligned with the in-page
    // renderers' confidence badge. Absent when the report is unknown.
    const tier = tierBadge(reportById.get(spec.id));
    if (tier) title.appendChild(tier);
    head.appendChild(title);

    // Actions, ordered Delete / Edit / Hide left-to-right. Delete + Edit only
    // when this origin can write the spec back; the eye toggle is always present.
    const actions = document.createElement("div");
    actions.className = "spec-actions";

    if (spec.writable) {
      // Both Delete and Edit delegate to the active tab's content script so the
      // write (and Delete's destructive confirm) runs origin-routed in the page
      // context, where the edit form + capture picker also live.
      actions.append(
        actionButton("spec-delete", t("common.delete"), t("sidepanel.deleteThisSpec"), () => {
          void actOnActiveTab({ type: "DELETE_SPEC_HERE", specId: spec.id });
        }),
        actionButton("spec-edit", t("common.edit"), t("sidepanel.editThisSpec"), () => {
          void actOnActiveTab({ type: "EDIT_SPEC", specId: spec.id });
        }),
      );
    }

    // Per-spec eye toggle (side panel only): show/hide this exact spec.
    actions.appendChild(
      actionButton(
        "spec-vis",
        visible ? t("sidepanel.hide") : t("sidepanel.show"),
        visible ? t("sidepanel.hideThisSpec") : t("sidepanel.showThisSpec"),
        () => {
          void toggleSpec(facets, !visible);
        },
      ),
    );

    head.appendChild(actions);
    li.appendChild(head);

    const description = resolveLocalized(spec.description, activeLocale, defaultLocale);
    if (description) {
      const d = document.createElement("div");
      d.className = "d";
      // Only the Phase 1 Markdown renderer's output is assigned here: it escapes
      // every leaf and emits an allowlisted tag set, so the side panel keeps its
      // "no untrusted string via innerHTML" property (the input is spec text, the
      // output is a fully module-controlled trusted fragment).
      d.innerHTML = renderMarkdownBlock(description, pageOrigin);
      li.appendChild(d);
    }

    if (spec.businessRules?.length) {
      const rules = document.createElement("ul");
      rules.className = "rules";
      for (const rule of spec.businessRules) {
        const item = document.createElement("li");
        // Trusted fragment (see description note above): inline Markdown only.
        item.innerHTML = renderInlineMarkdown(
          resolveLocalized(rule, activeLocale, defaultLocale),
          pageOrigin,
        );
        rules.appendChild(item);
      }
      li.appendChild(rules);
    }

    const file = document.createElement("div");
    file.className = "file";
    file.textContent = spec._file;
    li.appendChild(file);

    list.appendChild(li);
  }
}

/** Render the orphaned section: page-scoped specs whose fingerprint matched no
 *  element on the current page (a doc exists but its anchor is gone). Hidden when
 *  off, the report is unknown, or nothing is orphaned. Each row shows the spec
 *  title + a muted "not found on this page" label. DOM-built (no innerHTML). */
function renderOrphaned(res: SpecsForOrigin): void {
  const box = byId("orphaned");
  box.replaceChildren();
  if (!res.enabled || !lastReport) {
    box.hidden = true;
    return;
  }
  const orphans = orphanedSpecs(lastReport);
  if (orphans.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const defaultLocale = res.manifest?.settings?.defaultLocale;
  const specById = new Map(res.specs.map((s) => [s.id, s]));

  const head = document.createElement("div");
  head.className = "orphaned-title";
  head.textContent = t("health.orphanedTitle", { count: orphans.length });
  const hint = document.createElement("div");
  hint.className = "orphaned-hint";
  hint.textContent = t("health.orphanedHint");
  box.append(head, hint);

  const ul = document.createElement("ul");
  for (const entry of orphans) {
    const spec = specById.get(entry.id);
    const li = document.createElement("li");
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = spec ? resolveLocalized(spec.title, activeLocale, defaultLocale) : entry.id;
    const label = document.createElement("div");
    label.className = "muted";
    label.textContent = t("health.orphanedNotFound");
    li.append(title, label);
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

// The fragile-spec list (shared wiring; see the popup). Reads module state on each
// render and lists weak-anchored, currently-failing specs with a copyable snippet.
const fragileScan = mountFragileScan(byId("scan"), byId("scan-results"), {
  getState: () => ({
    enabled: lastSpecs?.enabled ?? false,
    report: lastReport,
    specs: lastSpecs?.specs ?? [],
    locale: activeLocale,
    defaultLocale: lastSpecs?.manifest?.settings?.defaultLocale,
  }),
});

// The "This page | All" scope toggle above the search box (shared wiring; see the
// popup for the rationale). Reads module state on each render and, on click,
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
  currentPath = path;
  currentOrigin = origin;
  currentState = visibilityOf(specs);
  // Skip the match state when off (the in-flight query resolves to null, discarded).
  const match = specs.enabled ? await matchPromise : { ids: null, report: null };
  matchedIds = match.ids;
  lastReport = match.report;
  reportById = new Map((lastReport ?? []).map((e) => [e.id, e]));
  renderStatus(status, origin, specs.specs.length);
  renderHealthSummary(byId("health"), lastReport ? pageHealth(lastReport) : null, specs.enabled);
  renderProjects(status, origin);
  renderLocalePicker(status.locales ?? [], activeLocale, specs.enabled);
  // The side panel has the room for per-spec rows in addition to group filters.
  renderFilterSection(byId("filters"), buildFilterModel(specs, path), refresh, true);
  // When off, the list collapses to the "off" message: hide controls that only
  // act on the (now-hidden) spec list, plus the create affordance + its panel.
  setListControlsHidden(!specs.enabled);
  scopeToggle.render();
  fragileScan.render();
  // Export is per project serving THIS page (one click exports one project); the
  // shared builder lists the local + sidecar export targets.
  projectActions.update(specs.enabled, buildExportTargets(status, origin));
  await guideSection.refresh({
    origin,
    enabled: specs.enabled,
    locale,
    defaultLocale: specs.manifest?.settings?.defaultLocale,
  });
  renderSpecs(specs);
  renderOrphaned(specs);
}

// The Guides launch section. The side panel is persistent, so launching a tour
// does NOT close it (unlike the popup); it just sends START_GUIDE to the tab.
const guideSection = mountGuideSection(byId("guides"), {
  launch: (steps, name) => void sendToActiveTab({ type: "START_GUIDE", steps, name }),
});

// The shared "+ New project" inline form; refresh() re-renders the project list
// on a successful create. Toggled from the header button.
// Shared header controls: "+ New project" (inline form) + "Export" (zip the local
// project(s) serving the page). refresh() re-renders the list after a create.
const projectActions = wireProjectActions(refresh, "sidepanel");

// Coalesce bursts of tab/SSE events into a single refresh per frame so rapid
// navigation or SPECS_CHANGED storms do not trigger redundant fetches.
let refreshQueued = false;
function queueRefresh(): void {
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(() => {
    refreshQueued = false;
    void refresh();
  }, 150);
}

byId("enabled").addEventListener("change", async (e) => {
  await sendToBackground({ type: "SET_ENABLED", enabled: (e.target as HTMLInputElement).checked });
  await refresh();
});
byId("capture").addEventListener("click", async () => {
  // Unlike the popup, the panel stays open: the user clicks the page element
  // while the panel remains docked alongside.
  await actOnActiveTab({ type: "START_CAPTURE" });
});
void wireDisplayModePicker(byId("mode") as HTMLSelectElement);
byId("locale").addEventListener("change", async (e) => {
  activeLocale = (e.target as HTMLSelectElement).value;
  await setLocale(activeLocale);
  await sendToActiveTab({ type: "SET_LOCALE", locale: activeLocale });
  if (lastSpecs) {
    renderSpecs(lastSpecs);
    renderOrphaned(lastSpecs);
  }
});
byId("search").addEventListener("input", (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
  if (lastSpecs) renderSpecs(lastSpecs);
});
byId("open-options").addEventListener("click", () => browser.runtime.openOptionsPage());

// Same-origin spec-text links carry `data-specpin-internal` and no `target`. In
// the in-page renderers a plain <a> navigates the host tab directly, but the side
// panel is an extension page, so navigating in place would replace the panel.
// Intercept those links here and steer the active web tab instead; cross-origin
// links keep their `target="_blank"` and open a new tab untouched. Capture phase
// so this runs before the card's bubble-phase highlight handler.
byId("specs").addEventListener(
  "click",
  (e) => {
    const link = (e.target as Element | null)?.closest("a[data-specpin-internal]");
    if (!(link instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    e.stopPropagation();
    const url = link.href;
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) void browser.tabs.update(tab.id, { url });
    });
  },
  true,
);

// Keep the panel in sync with the active tab as the user navigates.
browser.tabs.onActivated.addListener(() => queueRefresh());
browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === "complete" || changeInfo.url !== undefined)) {
    queueRefresh();
  }
});
// Highlight a spec card when a tooltip pin asks to "open in side panel". The
// card may not exist yet if the panel just opened, so retry briefly after the
// next refresh settles.
function highlightSpec(specId: string, attempt = 0): void {
  const card = document.querySelector<HTMLElement>(`.spec[data-spec-id="${CSS.escape(specId)}"]`);
  if (!card) {
    if (attempt < 10) setTimeout(() => highlightSpec(specId, attempt + 1), 100);
    return;
  }
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("highlight");
  setTimeout(() => card.classList.remove("highlight"), 1600);
}

browser.runtime.onMessage.addListener((raw) => {
  const message = raw as Message;
  if (message?.type === "SPECS_CHANGED") queueRefresh();
  if (message?.type === "HIGHLIGHT_SPEC") highlightSpec(message.specId);
});

// Apply the forced theme at startup and keep it live if changed in Options.
void applyStoredTheme();
watchThemeChanges();

// Show the actual extension version from the manifest, not a hardcoded string.
byId("version").textContent = `v${browser.runtime.getManifest().version}`;

// Resolve the UI-chrome language, hydrate the static HTML, then render.
async function init(): Promise<void> {
  initI18n(resolveUiLocale(await getUiLocale()));
  hydrateI18n(document);
  await refresh();
}
// The side panel can stay open while Options changes the language in another tab.
watchUiLocaleChanges(() => {
  hydrateI18n(document);
  void refresh();
});
void init();
