import type { ConnectionStatus, StatusResult } from "./messaging.js";
import { statusServesOrigin } from "./origin-match.js";

// DOM renderers shared verbatim by the popup and the side panel. Both surfaces
// reuse the same element ids (status-dot, projects, locale-row, ...), so the
// status / project-list / locale-picker rendering is identical between them.
// Only the spec list diverges (popup compact vs side panel inline detail), so
// each surface keeps its own renderSpecs.

export const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

export function renderStatus(status: StatusResult): void {
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

/** List the connected projects that serve the active tab. */
export function renderProjects(list: ConnectionStatus[], origin: string): void {
  const ul = byId("projects");
  ul.replaceChildren();
  const matching = list.filter((c) => statusServesOrigin(c, origin));
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

export function renderLocalePicker(locales: string[], activeLocale: string): void {
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
