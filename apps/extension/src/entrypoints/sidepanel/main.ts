import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { setLocale } from "../../shared/config.js";
import { wireDisplayModePicker } from "../../shared/display-mode-picker.js";
import "../../shared/tokens.gen.css";
import "../../shared/scrollbar.css";
import { MANUAL_CONNECTION_ID } from "../../shared/connection-types.js";
import {
  type Message,
  type SpecsForOrigin,
  sendToActiveTab,
  sendToBackground,
} from "../../shared/messaging.js";
import {
  buildFilterModel,
  fetchSurfaceState,
  specMatchesQuery,
  visibilityOf,
} from "../../shared/surface-data.js";
import {
  byId,
  mutedRow,
  renderFilterSection,
  renderLocalePicker,
  renderProjects,
  renderStatus,
  sourceBadge,
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
    list.appendChild(mutedRow(res.enabled ? "No specs for this page." : "Specpin is off."));
    return;
  }
  const defaultLocale = res.manifest?.settings?.defaultLocale;
  const multiProject = new Set(res.specs.map((s) => s.project)).size > 1;
  const state = visibilityOf(res);
  const matches = res.specs.filter((spec) =>
    specMatchesQuery(spec, searchQuery, activeLocale, defaultLocale, true),
  );
  if (matches.length === 0) {
    list.appendChild(mutedRow("No specs match your search."));
    return;
  }
  for (const spec of matches) {
    const li = document.createElement("li");
    li.className = "spec";
    // Stable anchor so a tooltip "open in side panel" can scroll to this card.
    li.dataset.specId = spec.id;
    // Clicking the card scrolls to and highlights the matched element on the page.
    li.title = "Click to highlight on the page";
    li.addEventListener("click", () => {
      void sendToActiveTab({ type: "HIGHLIGHT_ELEMENT", specId: spec.id });
    });

    const facets = { id: spec.id, tags: spec.tags, file: spec._file };
    const visible = isVisible(facets, currentPath, state);
    if (!visible) li.classList.add("spec-hidden");

    // Per-spec eye toggle (side panel only): show/hide this exact spec.
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "spec-vis";
    eye.textContent = visible ? "Hide" : "Show";
    eye.title = visible ? "Hide this spec" : "Show this spec";
    // Don't let the eye's click bubble to the card's highlight handler.
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      void toggleSpec(facets, !visible);
    });
    li.appendChild(eye);

    // Edit button (sidecar specs only; Manual import is read-only). Delegates to
    // the active tab's content script, which opens the in-page edit form (the
    // form + capture picker must run in the page context).
    if (spec.connectionId !== MANUAL_CONNECTION_ID) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "spec-edit";
      edit.textContent = "Edit";
      edit.title = "Edit this spec";
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        void sendToActiveTab({ type: "EDIT_SPEC", specId: spec.id });
      });
      li.appendChild(edit);
    }

    if (multiProject && spec.project) {
      const project = document.createElement("span");
      project.className = "project";
      project.textContent = spec.project;
      li.appendChild(project);
    }

    const title = document.createElement("div");
    title.className = "t";
    title.append(
      document.createTextNode(resolveLocalized(spec.title, activeLocale, defaultLocale)),
      sourceBadge(spec),
    );
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
  renderStatus(status, origin, specs.specs.length);
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
