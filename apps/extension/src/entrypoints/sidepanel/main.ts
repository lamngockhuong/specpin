import type { DisplayMode } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { setLocale } from "../../shared/config.js";
import "../../shared/tokens.gen.css";
import "../../shared/scrollbar.css";
import {
  type Message,
  type SpecsForOrigin,
  sendToActiveTab,
  sendToBackground,
} from "../../shared/messaging.js";
import { buildFilterModel, fetchSurfaceState, visibilityOf } from "../../shared/surface-data.js";
import {
  byId,
  renderFilterSection,
  renderLocalePicker,
  renderProjects,
  renderStatus,
} from "../../shared/surface-renderers.js";
import { isVisible, setSpecVisibility, type VisibilityState } from "../../shared/visibility.js";

// The side panel is a persistent surface (unlike the ephemeral popup): it stays
// open while the user navigates, so it listens for tab activation / URL changes
// and SPECS_CHANGED and re-renders. It also shows richer per-spec detail
// (description + business rules) inline, since it has the vertical room.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;
let currentPath = "/";
let currentState: VisibilityState = { teamHidden: [], personal: { forceHide: [], forceShow: [] } };

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

/** Each spec is a card with title, description, file, and (when present) the
 *  business rules inline. Text goes through DOM nodes (never innerHTML) so spec
 *  content is never an HTML-injection sink. */
function renderSpecs(res: SpecsForOrigin): void {
  const list = byId("specs");
  list.replaceChildren();
  if (res.specs.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = res.enabled ? "No specs for this page." : "Specpin is off.";
    list.appendChild(li);
    return;
  }
  const defaultLocale = res.manifest?.settings?.defaultLocale;
  const multiProject = new Set(res.specs.map((s) => s.project)).size > 1;
  const state = visibilityOf(res);
  for (const spec of res.specs) {
    const li = document.createElement("li");
    li.className = "spec";
    // Stable anchor so a tooltip "open in side panel" can scroll to this card.
    li.dataset.specId = spec.id;

    const facets = { id: spec.id, tags: spec.tags, file: spec._file };
    const visible = isVisible(facets, currentPath, state);
    if (!visible) li.classList.add("spec-hidden");

    // Per-spec eye toggle (side panel only): show/hide this exact spec.
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "spec-vis";
    eye.textContent = visible ? "Hide" : "Show";
    eye.title = visible ? "Hide this spec" : "Show this spec";
    eye.addEventListener("click", () => void toggleSpec(facets, !visible));
    li.appendChild(eye);

    if (multiProject && spec.project) {
      const project = document.createElement("span");
      project.className = "project";
      project.textContent = spec.project;
      li.appendChild(project);
    }

    const title = document.createElement("div");
    title.className = "t";
    title.textContent = resolveLocalized(spec.title, activeLocale, defaultLocale);
    li.appendChild(title);

    const description = resolveLocalized(spec.description, activeLocale, defaultLocale);
    if (description) {
      const d = document.createElement("div");
      d.className = "d";
      d.textContent = description;
      li.appendChild(d);
    }

    if (spec.businessRules?.length) {
      const rules = document.createElement("ul");
      rules.className = "rules";
      for (const rule of spec.businessRules) {
        const item = document.createElement("li");
        item.textContent = resolveLocalized(rule, activeLocale, defaultLocale);
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

async function refresh(): Promise<void> {
  const { status, specs, origin, path, activeLocale: locale } = await fetchSurfaceState();
  activeLocale = locale;
  lastSpecs = specs;
  currentPath = path;
  currentState = visibilityOf(specs);
  renderStatus(status);
  renderProjects(status.connections ?? [], origin);
  renderLocalePicker(status.locales ?? [], activeLocale);
  // The side panel has the room for per-spec rows in addition to group filters.
  renderFilterSection(byId("filters"), buildFilterModel(specs, path), refresh, true);
  renderSpecs(specs);
}

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
byId("reload").addEventListener("click", async () => {
  await sendToBackground({ type: "RELOAD" });
  await refresh();
});
byId("reconnect").addEventListener("click", async () => {
  await sendToBackground({ type: "RECONNECT" });
  await refresh();
});
byId("capture").addEventListener("click", async () => {
  // Unlike the popup, the panel stays open: the user clicks the page element
  // while the panel remains docked alongside.
  await sendToActiveTab({ type: "START_CAPTURE" });
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

void refresh();
