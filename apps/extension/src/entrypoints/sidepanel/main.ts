import type { DisplayMode } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { setLocale } from "../../shared/config.js";
import "../../shared/tokens.gen.css";
import {
  type Message,
  type SpecsForOrigin,
  sendToActiveTab,
  sendToBackground,
} from "../../shared/messaging.js";
import { fetchSurfaceState } from "../../shared/surface-data.js";
import {
  byId,
  renderLocalePicker,
  renderProjects,
  renderStatus,
} from "../../shared/surface-renderers.js";

// The side panel is a persistent surface (unlike the ephemeral popup): it stays
// open while the user navigates, so it listens for tab activation / URL changes
// and SPECS_CHANGED and re-renders. It also shows richer per-spec detail
// (description + business rules) inline, since it has the vertical room.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;

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
  for (const spec of res.specs) {
    const li = document.createElement("li");
    li.className = "spec";

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
  const { status, specs, origin, activeLocale: locale } = await fetchSurfaceState();
  activeLocale = locale;
  lastSpecs = specs;
  renderStatus(status);
  renderProjects(status.connections ?? [], origin);
  renderLocalePicker(status.locales ?? [], activeLocale);
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
browser.runtime.onMessage.addListener((raw) => {
  if ((raw as Message)?.type === "SPECS_CHANGED") queueRefresh();
});

void refresh();
