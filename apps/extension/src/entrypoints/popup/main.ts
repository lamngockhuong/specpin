import type { DisplayMode } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import { browser } from "#imports";
import { pickLocale } from "../../content/localize-spec.js";
import { getLocale, setLocale } from "../../shared/config.js";
import { originMatchesDomains } from "../../shared/origin-match.js";
import "../../shared/tokens.gen.css";
import {
  type ConnectionStatus,
  type SpecsForOrigin,
  type StatusResult,
  sendToActiveTab,
  sendToBackground,
} from "../../shared/messaging.js";

// The popup is the authoritative language picker: it persists the choice and
// pushes it to the active tab's content script. Latest fetched values drive the
// spec list rendering and the picker options.
let activeLocale = "en";
let lastSpecs: SpecsForOrigin | null = null;

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

async function activeOrigin(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    return tab?.url ? new URL(tab.url).origin : "";
  } catch {
    return "";
  }
}

function renderStatus(status: StatusResult): void {
  const dot = byId("status-dot");
  dot.className = `dot ${status.connected ? "ok" : status.configured ? "off" : ""}`;
  byId("status-text").textContent = !status.configured
    ? "Not configured"
    : status.connected
      ? `Connected (${status.activeSource})`
      : "Disconnected";
  (byId("enabled") as HTMLInputElement).checked = status.enabled;
  byId("project").textContent = status.project ?? "";
  byId("count").textContent = status.specCount ? `${status.specCount} specs` : "";
}

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

/** Does a connection's project serve this origin? Mirrors the background gate. */
function connectionServes(c: ConnectionStatus, origin: string): boolean {
  if (c.domains.length === 0) return c.matchesAllSites;
  return originMatchesDomains(origin, c.domains);
}

/** List the connected projects that serve the active tab. */
function renderProjects(list: ConnectionStatus[], origin: string): void {
  const ul = byId("projects");
  ul.replaceChildren();
  const matching = list.filter((c) => connectionServes(c, origin));
  // With a single project the meta row already names it; avoid duplicate noise.
  if (matching.length < 2) return;
  for (const c of matching) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `pdot ${c.connected ? "ok" : c.error ? "err" : ""}`;
    const name = document.createElement("span");
    name.className = "pname";
    name.textContent = c.label || c.project || c.baseUrl;
    const count = document.createElement("span");
    count.className = "pcount";
    count.textContent = `${c.specCount}`;
    li.append(dot, name, count);
    ul.appendChild(li);
  }
}

function renderLocalePicker(locales: string[]): void {
  const row = byId("locale-row");
  const select = byId("locale") as HTMLSelectElement;
  // Hide the picker when there is nothing to choose between.
  if (locales.length < 2) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  // Build options via the DOM (no innerHTML) so locale values are never an
  // HTML-injection sink, matching the escaping the other renderers apply.
  select.replaceChildren();
  for (const l of locales) {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l;
    if (l === activeLocale) opt.selected = true;
    select.appendChild(opt);
  }
}

async function refresh(): Promise<void> {
  const status = await sendToBackground<StatusResult>({ type: "GET_STATUS" });
  renderStatus(status);
  const origin = await activeOrigin();
  const res = await sendToBackground<SpecsForOrigin>({ type: "GET_SPECS_FOR_ORIGIN", origin });
  lastSpecs = res;
  activeLocale = pickLocale(await getLocale(), res.manifest?.settings?.defaultLocale);
  renderProjects(status.connections ?? [], origin);
  renderLocalePicker(status.locales ?? []);
  renderSpecs(res);
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

void refresh();
