import type { ConnectionStatus, StatusResult } from "./messaging.js";
import { statusServesOrigin } from "./origin-match.js";
import { applyFacetToggle, type FilterModel, resetPersonalVisibility } from "./surface-data.js";
import type { FacetInventory, FacetItem, FacetKey } from "./visibility.js";

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

export function renderStatus(status: StatusResult, origin: string, originSpecCount: number): void {
  // Health is scoped to the connections that actually serve the active tab: a
  // sidecar bound to another domain must not color this page's status. The global
  // status.connected (any-connection some()) stayed green even when a serving
  // sidecar was down, masking partial failures -- this derives state per origin.
  const serving = (status.connections ?? []).filter((c) => statusServesOrigin(c, origin));
  const up = serving.filter((c) => c.connected).length;

  let dotClass = "dot";
  let text: string;
  if (!status.configured) {
    text = "Not configured";
  } else if (serving.length > 0) {
    // Tri-state over the serving sidecars: all up, some up (degraded), none up.
    if (up === serving.length) {
      dotClass = "dot ok";
      text = "Connected (sidecar)";
    } else if (up > 0) {
      dotClass = "dot warn";
      text = `Partially connected (${up}/${serving.length})`;
    } else {
      // Name the source so the user knows the sidecar is what needs reconnecting
      // (the project name + Reconnect button sit right below this).
      dotClass = "dot off";
      text = "Disconnected (sidecar)";
    }
  } else if (originSpecCount > 0) {
    // No sidecar serves this page yet specs render here: they come from Manual import.
    dotClass = "dot ok";
    text = "Connected (manual)";
  } else {
    // Header describes the connection/source situation (no project or manual
    // batch is pinned here); the spec list owns the "No specs for this page"
    // empty state, so the two never repeat the same sentence.
    text = "No project for this page";
  }
  byId("status-dot").className = dotClass;
  byId("status-text").textContent = text;

  (byId("enabled") as HTMLInputElement).checked = status.enabled;
  // Project name + spec count are scoped to the ACTIVE TAB's origin, never the
  // global first-connected project or the cross-project total: a project that
  // does not serve this page must not be named here. A single serving project
  // names the header; 0 or 2+ leave it blank (renderProjects lists the 2+ case).
  byId("project").textContent =
    serving.length === 1 ? serving[0].label || serving[0].project || "" : "";
  byId("count").textContent = originSpecCount ? `${originSpecCount} specs` : "";
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

export interface FilterOptions {
  /** Current page path, for the "This page" URL toggle. Omit to hide that group. */
  path?: string;
  /** Whether the current page is currently gated off by a `url:` key. */
  pageHidden?: boolean;
  /** Show the per-spec checklist (side panel only; the popup stays compact). */
  perSpec?: boolean;
  /** A personal override is active somewhere, so the Reset control is meaningful. */
  hasOverrides?: boolean;
  /** Specpin's master on/off. When off, the whole block is hidden (defaults to on
   *  so existing callers keep rendering). */
  enabled?: boolean;
  onToggle: (key: FacetKey, visible: boolean) => void;
  onReset: () => void;
}

/** Render the facet filter checklist shared by the popup and the side panel. One
 *  implementation so both surfaces drive the same predicate. Built entirely with
 *  DOM nodes (never innerHTML) so spec-derived labels are not an injection sink. */
export function renderFilters(
  container: HTMLElement,
  inventory: FacetInventory,
  opts: FilterOptions,
): void {
  container.replaceChildren();
  const hasFacets =
    inventory.tags.length > 0 || inventory.files.length > 0 || inventory.specs.length > 0;
  // The "This page" hide toggle is meaningful only when there are specs here to
  // hide, or the page is already hidden (so the user can reverse it).
  const showPageGroup = opts.path !== undefined && (hasFacets || (opts.pageHidden ?? false));
  // Hide the whole block when Specpin is off or there is nothing to filter on
  // this page (no project / no specs): an empty "Filter > This page" block is
  // just noise.
  if (opts.enabled === false || (!hasFacets && !showPageGroup)) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const head = document.createElement("div");
  head.className = "filter-head";
  const heading = document.createElement("span");
  heading.className = "filter-title";
  heading.textContent = "Filter";
  head.appendChild(heading);
  if (opts.hasOverrides) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "filter-reset link";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => opts.onReset());
    head.appendChild(reset);
  }
  container.appendChild(head);

  if (inventory.tags.length) {
    container.appendChild(facetGroup("Tags", inventory.tags, opts.onToggle));
  }
  if (inventory.files.length) {
    container.appendChild(facetGroup("Files", inventory.files, opts.onToggle));
  }
  if (opts.perSpec && inventory.specs.length) {
    container.appendChild(facetGroup("Specs", inventory.specs, opts.onToggle));
  }
  if (showPageGroup && opts.path !== undefined) {
    container.appendChild(pageGroup(opts.path, opts.pageHidden ?? false, opts.onToggle));
  }
}

/** Render the filter checklist for a surface and wire its toggles to the
 *  background, calling `refresh` after each change. Shared by the popup
 *  (`perSpec` off, stays compact) and the side panel (`perSpec` on). */
export function renderFilterSection(
  container: HTMLElement,
  model: FilterModel,
  refresh: () => Promise<void> | void,
  perSpec = false,
): void {
  renderFilters(container, model.inventory, {
    path: model.path,
    pageHidden: model.pageHidden,
    perSpec,
    hasOverrides: model.hasOverrides,
    enabled: model.enabled,
    onToggle: async (key, visible) => {
      await applyFacetToggle(model.state, key, visible);
      await refresh();
    },
    onReset: async () => {
      await resetPersonalVisibility();
      await refresh();
    },
  });
}

function facetGroup(
  title: string,
  items: FacetItem[],
  onToggle: (key: FacetKey, visible: boolean) => void,
): HTMLElement {
  const group = document.createElement("details");
  group.className = "filter-group";
  group.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `${title} (${items.length})`;
  group.appendChild(summary);
  for (const item of items) {
    group.appendChild(facetRow(item, onToggle));
  }
  return group;
}

function facetRow(
  item: FacetItem,
  onToggle: (key: FacetKey, visible: boolean) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "filter-row";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = item.visible;
  box.addEventListener("change", () => onToggle(item.key, box.checked));
  const name = document.createElement("span");
  name.className = "filter-name";
  name.textContent = item.label;
  const count = document.createElement("span");
  count.className = "filter-count";
  count.textContent = `${item.count}`;
  row.append(box, name);
  if (item.teamHidden) row.appendChild(marker("team", "Hidden by the team default"));
  if (item.overridden) row.appendChild(marker("you", "Your personal override"));
  row.appendChild(count);
  return row;
}

function marker(text: string, title: string): HTMLElement {
  const tag = document.createElement("span");
  tag.className = `filter-marker filter-marker-${text}`;
  tag.textContent = text;
  tag.title = title;
  return tag;
}

function pageGroup(
  path: string,
  pageHidden: boolean,
  onToggle: (key: FacetKey, visible: boolean) => void,
): HTMLElement {
  const group = document.createElement("details");
  group.className = "filter-group";
  group.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "This page";
  group.appendChild(summary);
  const row = document.createElement("label");
  row.className = "filter-row";
  const box = document.createElement("input");
  box.type = "checkbox";
  // Checked = "hide specs on this page" is ON.
  box.checked = pageHidden;
  box.addEventListener("change", () => onToggle(`url:${path}`, !box.checked));
  const name = document.createElement("span");
  name.className = "filter-name";
  name.textContent = "Hide specs on this page";
  row.append(box, name);
  group.appendChild(row);
  return group;
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
