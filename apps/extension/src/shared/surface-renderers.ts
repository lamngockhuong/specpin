import { t } from "../i18n/index.js";
import { MANUAL_CONNECTION_ID, type TaggedSpec } from "./connection-types.js";
import type { ConnectionStatus, StatusResult } from "./messaging.js";
import { connectionServesOrigin } from "./origin-match.js";
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

/** A muted `<li>` for a spec-list empty state (no specs, Specpin off, or no
 *  search match). Shared so the popup and side panel build it the same way. */
export function mutedRow(text: string): HTMLElement {
  const li = document.createElement("li");
  li.className = "muted";
  li.textContent = text;
  return li;
}

/** Small `sidecar`/`manual` provenance badge for a spec row. A spec tagged with
 *  the page-owned Manual source reads `manual`; everything else came from a
 *  sidecar connection. DOM-built (no innerHTML) so it is never an injection sink,
 *  matching the other renderers. Shared by the popup and the side panel. */
export function sourceBadge(spec: Pick<TaggedSpec, "connectionId">): HTMLElement {
  const manual = spec.connectionId === MANUAL_CONNECTION_ID;
  const tag = document.createElement("span");
  tag.className = `src src-${manual ? "manual" : "sidecar"}`;
  tag.textContent = manual ? t("common.sourceManual") : t("common.sourceSidecar");
  tag.title = manual ? t("common.sourceManualTitle") : t("common.sourceSidecarTitle");
  return tag;
}

export function renderStatus(status: StatusResult, origin: string, originSpecCount: number): void {
  // Health is scoped to the connections that actually serve the active tab: a
  // sidecar bound to another domain must not color this page's status. The global
  // status.connected (any-connection some()) stayed green even when a serving
  // sidecar was down, masking partial failures -- this derives state per origin.
  const serving = (status.connections ?? []).filter((c) => connectionServesOrigin(c, origin));
  const up = serving.filter((c) => c.connected).length;

  let dotClass = "dot";
  let text: string;
  if (!status.configured) {
    text = t("common.statusNotConfigured");
  } else if (serving.length > 0) {
    // Tri-state over the serving sidecars: all up, some up (degraded), none up.
    if (up === serving.length) {
      dotClass = "dot ok";
      text = t("common.statusConnectedSidecar");
    } else if (up > 0) {
      dotClass = "dot warn";
      text = t("common.statusPartiallyConnected", { up, total: serving.length });
    } else {
      // Name the source so the user knows the sidecar is what dropped; it
      // reconnects automatically (the project name sits right below this).
      dotClass = "dot off";
      text = t("common.statusDisconnectedSidecar");
    }
  } else if (originSpecCount > 0) {
    // No sidecar serves this page yet specs render here: they come from Manual import.
    dotClass = "dot ok";
    text = t("common.statusConnectedManual");
  } else {
    // Header describes the connection/source situation (no project or manual
    // batch is pinned here); the spec list owns the "No specs for this page"
    // empty state, so the two never repeat the same sentence.
    text = t("common.statusNoProject");
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
  byId("count").textContent = originSpecCount
    ? t("common.specsCountPill", { count: originSpecCount })
    : "";
}

/** List the connected projects that serve the active tab. */
export function renderProjects(list: ConnectionStatus[], origin: string): void {
  const ul = byId("projects");
  ul.replaceChildren();
  const matching = list.filter((c) => connectionServesOrigin(c, origin));
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

// Remembered collapse state of the filter `<details>` groups, surviving both
// rebuilds and the container being emptied while Specpin is off. One instance
// per surface (the module loads once per popup / side panel page context).
const filterGroupOpenState = new Map<string, boolean>();

/** Render the facet filter checklist shared by the popup and the side panel. One
 *  implementation so both surfaces drive the same predicate. Built entirely with
 *  DOM nodes (never innerHTML) so spec-derived labels are not an injection sink. */
export function renderFilters(
  container: HTMLElement,
  inventory: FacetInventory,
  opts: FilterOptions,
): void {
  // Record each group's collapsed/expanded state before the rebuild below wipes
  // the DOM, so a refresh (toggle, SSE, tab switch) does not re-open groups the
  // user had collapsed. Kept in a module-level map (keyed by the stable
  // `data-group` attribute) so the state also survives the container being
  // emptied while Specpin is off, then restored on re-enable.
  for (const d of container.querySelectorAll<HTMLDetailsElement>("details.filter-group")) {
    if (d.dataset.group) filterGroupOpenState.set(d.dataset.group, d.open);
  }
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
  heading.textContent = t("common.filterTitle");
  head.appendChild(heading);
  if (opts.hasOverrides) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "filter-reset link";
    reset.textContent = t("common.filterReset");
    reset.addEventListener("click", () => opts.onReset());
    head.appendChild(reset);
  }
  container.appendChild(head);

  if (inventory.tags.length) {
    container.appendChild(
      facetGroup("tags", t("common.filterTags"), inventory.tags, opts.onToggle),
    );
  }
  if (inventory.files.length) {
    container.appendChild(
      facetGroup("files", t("common.filterFiles"), inventory.files, opts.onToggle),
    );
  }
  if (opts.perSpec && inventory.specs.length) {
    container.appendChild(
      facetGroup("specs", t("common.filterSpecs"), inventory.specs, opts.onToggle),
    );
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
  groupKey: string,
  title: string,
  items: FacetItem[],
  onToggle: (key: FacetKey, visible: boolean) => void,
): HTMLElement {
  const group = document.createElement("details");
  group.className = "filter-group";
  group.dataset.group = groupKey;
  // Default to open on first render; otherwise honor the user's prior choice.
  group.open = filterGroupOpenState.get(groupKey) ?? true;
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
  if (item.teamHidden)
    row.appendChild(marker("team", t("common.markerTeam"), t("common.markerTeamTitle")));
  if (item.overridden)
    row.appendChild(marker("you", t("common.markerYou"), t("common.markerYouTitle")));
  row.appendChild(count);
  return row;
}

/** A small inline marker pill. `key` drives the CSS modifier class (stable,
 *  not translated); `label`/`title` are the translated display text. */
function marker(key: string, label: string, title: string): HTMLElement {
  const tag = document.createElement("span");
  tag.className = `filter-marker filter-marker-${key}`;
  tag.textContent = label;
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
  group.dataset.group = "page";
  // Default to open on first render; otherwise honor the user's prior choice.
  group.open = filterGroupOpenState.get("page") ?? true;
  const summary = document.createElement("summary");
  summary.textContent = t("common.filterThisPage");
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
  name.textContent = t("common.filterHidePage");
  row.append(box, name);
  group.appendChild(row);
  return group;
}

export function renderLocalePicker(locales: string[], activeLocale: string, enabled = true): void {
  const row = byId("locale-row");
  const select = byId("locale") as HTMLSelectElement;
  // Hide the picker when Specpin is off (nothing rendered to relocalize) or when
  // there is nothing to choose between.
  if (!enabled || locales.length < 2) {
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

/** Toggle the spec-list controls (search box + capture/mode actions) that are
 *  meaningless when Specpin is off and the list collapses to the "off" message.
 *  Shared by the popup and side panel, which use the same element ids. */
export function setListControlsHidden(hidden: boolean): void {
  byId("search").hidden = hidden;
  byId("actions").hidden = hidden;
}
