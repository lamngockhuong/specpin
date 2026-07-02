import { resolveLocalized } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { copyText } from "./clipboard.js";
import type { ManualBatchSummary, TaggedSpec } from "./connection-types.js";
import { dataSpecIdSnippet, fragileEntries } from "./data-spec-id.js";
import { isLocalConnectionId } from "./local-id.js";
import type { MatchReportEntry, StatusResult } from "./messaging.js";
import { connectionServesOrigin, manualSummaryServesOrigin } from "./origin-match.js";
import {
  applyFacetToggle,
  computeSeenDigest,
  type FilterModel,
  markAllSeen,
  type PageHealth,
  resetPersonalVisibility,
  type SeenDiff,
  type SpecScope,
  scopeSpecs,
} from "./surface-data.js";
import { showSurfaceToast } from "./surface-toast.js";
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
  const manual = isLocalConnectionId(spec.connectionId);
  const tag = document.createElement("span");
  tag.className = `src src-${manual ? "manual" : "sidecar"}`;
  tag.textContent = manual ? t("common.sourceManual") : t("common.sourceSidecar");
  tag.title = manual ? t("common.sourceManualTitle") : t("common.sourceSidecarTitle");
  return tag;
}

/** Render the one-line page match-health summary (N specs · X exact · Y fuzzy ·
 *  Z orphaned) into `container`, shared by the popup and side panel. Hidden when
 *  Specpin is off, the report is unknown (no content script), or the page has no
 *  scoped specs — an empty summary is just noise. DOM-built (no innerHTML). */
export function renderHealthSummary(
  container: HTMLElement,
  health: PageHealth | null,
  enabled: boolean,
): void {
  container.replaceChildren();
  if (!enabled || !health || health.total === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const line = document.createElement("div");
  line.className = "health-line";
  line.textContent = t("health.summary", {
    total: health.total,
    exact: health.exact,
    fuzzy: health.fuzzy,
    orphaned: health.orphaned,
  });
  container.appendChild(line);
}

/** A compact match-tier badge for a spec card, aligned with the in-page badges:
 *  a "fuzzy" pill for a css-tier match, nothing for the silent exact tier (or an
 *  orphaned/unknown entry). DOM-built so it is never an injection sink. */
export function tierBadge(entry: MatchReportEntry | undefined): HTMLElement | null {
  if (!entry?.matched || entry.strategy !== "css") return null;
  const badge = document.createElement("span");
  badge.className = "tier tier-fuzzy";
  badge.textContent = t("health.fuzzy");
  badge.title = t("match.fuzzy");
  return badge;
}

export interface FragileScanDeps {
  /** Latest surface state the scan reads on each render/click. `report` is null
   *  when no content script could report matches (the scan then hides). */
  getState: () => {
    enabled: boolean;
    report: MatchReportEntry[] | null;
    specs: TaggedSpec[];
    locale: string;
    defaultLocale: string | undefined;
  };
}

/** Mount the fragile-spec list, shared by the popup and side panel. It is a
 *  collapsible group (native `<details>`, mirroring the facet filter groups): the
 *  `<summary>` reads "Fragile specs (N)" and expands to a list of the page's
 *  fragile specs (weak anchor AND currently failing), each with a copyable
 *  `data-spec-id` snippet; Copy writes to the clipboard and confirms via the
 *  surface toast. Nothing edits source. Built with DOM nodes (no innerHTML). Owns
 *  its own visibility: the whole group hides when Specpin is off, the report is
 *  unknown, or there are no fragile specs (count 0) - no empty state to nag. The
 *  expand/collapse state lives on the stable `<details>` element, so it survives
 *  refreshes without a separate open flag. Returns a `render()` the surface calls
 *  from its refresh. */
export function mountFragileScan(
  details: HTMLElement,
  container: HTMLElement,
  deps: FragileScanDeps,
): { render: () => void } {
  // The `<summary>` is a static child of the `<details>` in both surfaces' HTML.
  const summary = details.querySelector("summary") as HTMLElement;

  const render = (): void => {
    const { enabled, report, specs, locale, defaultLocale } = deps.getState();
    const fragile = enabled && report ? fragileEntries(report) : [];
    container.replaceChildren();
    details.hidden = fragile.length === 0;
    if (details.hidden) return;
    summary.textContent = `${t("helper.scanTitle")} (${fragile.length})`;
    const specById = new Map(specs.map((s) => [s.id, s]));
    // A shared "taken" set so duplicate titles get distinct ids across the list.
    const taken = new Set<string>();
    for (const entry of fragile) {
      const spec = specById.get(entry.id);
      const title = spec ? resolveLocalized(spec.title, locale, defaultLocale) : entry.id;
      const { snippet } = dataSpecIdSnippet(title, taken);
      const row = document.createElement("div");
      row.className = "scan-row";
      const name = document.createElement("div");
      name.className = "scan-t";
      name.textContent = title;
      const code = document.createElement("code");
      code.className = "scan-snippet";
      code.textContent = snippet;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "scan-copy link";
      copy.textContent = t("helper.copySnippet");
      copy.addEventListener("click", async () => {
        // Clipboard blocked leaves the snippet visible for a manual copy.
        if (await copyText(snippet)) showSurfaceToast(t("helper.copied"));
      });
      row.append(name, code, copy);
      container.appendChild(row);
    }
  };

  return { render };
}

/** The Manual (local) batches that render on this page: they are enabled, carry
 *  specs, and their domains match the origin (empty domains = match-all,
 *  mirroring `specsForOrigin`). These are page-owned projects, so they count as
 *  "serving" alongside the connected sidecars in the project chrome. A disabled
 *  batch serves no page (parallel to a disabled sidecar dropped by
 *  `connectionServesOrigin`), and empty batches (write targets with no specs yet)
 *  are excluded so neither names a header or pads the project list. */
function servingManualBatches(status: StatusResult, origin: string): ManualBatchSummary[] {
  return (status.manualBatches ?? []).filter(
    (b) => b.specCount > 0 && manualSummaryServesOrigin(b, origin),
  );
}

export function renderStatus(status: StatusResult, origin: string, originSpecCount: number): void {
  (byId("enabled") as HTMLInputElement).checked = status.enabled;

  // Connection health now lives on each project row's dot in the list below
  // (renderProjects), so the header has no status dot of its own. It keeps only
  // the informational states the per-project dots cannot express: nothing
  // configured, or nothing serving this page. When a project does serve, this
  // row is empty and hidden -- the dots below carry the state. Origin scoping is
  // preserved in renderProjects' serving filter (a project bound to another
  // domain must not appear here).
  const serving = (status.connections ?? []).filter((c) => connectionServesOrigin(c, origin));
  let text = "";
  if (!status.configured) {
    text = t("common.statusNotConfigured");
  } else if (serving.length === 0 && originSpecCount === 0) {
    // No sidecar and no Manual specs render here. The spec list owns the
    // "No specs for this page" empty state, so this only names the source gap.
    text = t("common.statusNoProject");
  }
  // When there is nothing to say (the common serving case) the text is blank and
  // the whole row collapses via CSS (`.status:has(#status-text:empty)`), matching
  // the `#count:empty` / `#projects:empty` convention -- no JS visibility toggle.
  byId("status-text").textContent = text;

  // The project list owns project naming + per-project counts; the header keeps
  // only the page-total spec count pill.
  byId("count").textContent = originSpecCount
    ? t("common.specsCountPill", { count: originSpecCount })
    : "";
}

/** One row in the project list: a unified view over both sources. A sidecar
 *  carries its connection health in `dot`; a page-owned Manual project is always
 *  available, so it renders as connected. `title` describes that state on hover
 *  (the dot color is the at-a-glance indicator). */
interface ProjectRow {
  name: string;
  dot: "ok" | "err";
  title: string;
  count: number;
}

/** List the projects that serve the active tab, across BOTH sources: connected
 *  sidecars and page-owned Manual projects. */
export function renderProjects(status: StatusResult, origin: string): void {
  const ul = byId("projects");
  ul.replaceChildren();
  const rows: ProjectRow[] = [
    ...(status.connections ?? [])
      .filter((c) => connectionServesOrigin(c, origin))
      .map<ProjectRow>((c) => ({
        name: c.label || c.project || c.baseUrl,
        // A serving sidecar is either up (green) or down (red); the title spells
        // the state out on hover.
        dot: c.connected ? "ok" : "err",
        title: c.connected
          ? t("common.statusConnectedSidecar")
          : t("common.statusDisconnectedSidecar"),
        count: c.specCount,
      })),
    ...servingManualBatches(status, origin).map<ProjectRow>((b) => ({
      name: b.project || b.label,
      dot: "ok",
      title: t("common.statusConnectedManual"),
      count: b.specCount,
    })),
  ];
  // Always list every serving project (1 or many) so each carries its own status
  // dot -- this list is now the sole connection-health indicator.
  for (const row of rows) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `pdot ${row.dot}`;
    dot.title = row.title;
    const name = document.createElement("span");
    name.className = "pname";
    name.textContent = row.name;
    const count = document.createElement("span");
    count.className = "pcount";
    count.textContent = `${row.count}`;
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
  // Collapsed on first render (these facet lists can be long); otherwise honor
  // the user's prior choice. The summary keeps the title + count visible.
  group.open = filterGroupOpenState.get(groupKey) ?? false;
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

export interface ScopeToggleDeps {
  /** Latest surface state the toggle reads on each (re)render. `enabled` is
   *  Specpin's master on/off; `matchedIds` null means no content script could
   *  report matches (unsupported tab); `specs` is the full origin set. */
  getState: () => {
    enabled: boolean;
    scope: SpecScope;
    matchedIds: Set<string> | null;
    specs: Array<{ id: string }>;
  };
  /** Record the chosen scope in the surface's module state. */
  setScope: (scope: SpecScope) => void;
  /** Re-render the spec list after a scope change (no network refetch). */
  renderList: () => void;
}

/** Mount the "This page | All" segmented control above the spec list. Returns a
 *  `render()` the surface calls from its refresh; on click the toggle re-renders
 *  itself and the list, so the popup and side panel share one wiring instead of
 *  duplicating it. Built with DOM nodes (no innerHTML). Owns its own visibility:
 *  hidden when Specpin is off or the match set is unknown (the list then falls
 *  back to all, so a toggle would mislead), and derives the per-scope counts
 *  itself so callers don't recompute them. */
export function mountScopeToggle(
  container: HTMLElement,
  deps: ScopeToggleDeps,
): { render: () => void } {
  const render = (): void => {
    const { enabled, scope, matchedIds, specs } = deps.getState();
    container.replaceChildren();
    if (!enabled || matchedIds === null) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.className = "scope-toggle";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", t("common.scopeAria"));
    const make = (target: SpecScope, label: string, count: number): HTMLElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scope-btn";
      const active = scope === target;
      btn.setAttribute("aria-pressed", String(active));
      const name = document.createElement("span");
      name.textContent = label;
      const c = document.createElement("span");
      c.className = "c";
      c.textContent = `${count}`;
      btn.append(name, c);
      if (!active)
        btn.addEventListener("click", () => {
          deps.setScope(target);
          render();
          deps.renderList();
        });
      return btn;
    };
    container.append(
      make("page", t("common.scopeThisPage"), scopeSpecs(specs, "page", matchedIds).length),
      make("all", t("common.scopeAll"), specs.length),
    );
  };
  return { render };
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

/** Toggle the spec-list controls (search box, capture action, display-mode row,
 *  and the browse-zone divider) that are meaningless when Specpin is off and the
 *  list collapses to the "off" message. Shared by the popup and side panel, which
 *  use the same element ids. */
export function setListControlsHidden(hidden: boolean): void {
  byId("search").hidden = hidden;
  byId("actions").hidden = hidden;
  // Display mode moved out of #actions into its own labeled row, so hide it here
  // too when Specpin is off (nothing renders, so the mode picker is meaningless).
  byId("mode-row").hidden = hidden;
  // The browse-zone divider only makes sense alongside those controls.
  byId("list-divider").hidden = hidden;
}

/** Render the "what changed since last visit" digest: a count + a "Mark all seen"
 *  control + a list of new/edited spec titles, each tagged new/edited. Hidden when
 *  the diff is null (unknown/off/first-visit) or empty. Shared by the popup and
 *  side panel; built with DOM nodes (no innerHTML) so spec titles are never an
 *  injection sink. */
export function renderDigest(
  container: HTMLElement,
  diff: SeenDiff | null,
  locale: string,
  defaultLocale: string | undefined,
  onMarkSeen: () => void,
): void {
  container.replaceChildren();
  const changed = diff ? diff.added.length + diff.edited.length : 0;
  if (!diff || changed === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const head = document.createElement("div");
  head.className = "digest-head";
  const title = document.createElement("span");
  title.className = "digest-title";
  title.textContent = t("digest.changedSince", { count: changed });
  const seen = document.createElement("button");
  seen.type = "button";
  seen.className = "digest-seen link";
  seen.textContent = t("digest.markSeen");
  seen.addEventListener("click", () => onMarkSeen());
  head.append(title, seen);
  container.appendChild(head);

  const ul = document.createElement("ul");
  // Render each bucket in its own pass so the new/edited tag comes from the bucket,
  // not a positional index into a concatenation.
  const addRow = (spec: TaggedSpec, kind: "new" | "edited"): void => {
    const li = document.createElement("li");
    const tag = document.createElement("span");
    tag.className = `tag tag-${kind}`;
    tag.textContent = kind === "new" ? t("digest.tagNew") : t("digest.tagEdited");
    const name = document.createElement("span");
    name.className = "digest-name";
    name.textContent = resolveLocalized(spec.title, locale, defaultLocale);
    li.append(tag, name);
    ul.appendChild(li);
  };
  for (const spec of diff.added) addRow(spec, "new");
  for (const spec of diff.edited) addRow(spec, "edited");
  container.appendChild(ul);
}

export interface DigestDeps {
  /** Latest surface state the digest reads on each render. */
  getState: () => {
    specs: TaggedSpec[];
    enabled: boolean;
    locale: string;
    defaultLocale: string | undefined;
  };
  /** Re-render the surface after "Mark all seen" clears the snapshot. */
  refresh: () => Promise<void> | void;
}

/** Mount the what-changed digest, shared by the popup and side panel. Returns a
 *  `render()` the surface calls from its refresh: it reads the latest state,
 *  computes the diff (seeding a first-seen project silently), and renders the
 *  block; "Mark all seen" persists the baseline then refreshes. `render()` returns
 *  a promise, so a surface can start it early (before its synchronous renders) to
 *  overlap the storage read, then await it before the refresh completes. */
export function mountDigest(
  container: HTMLElement,
  deps: DigestDeps,
): { render: () => Promise<void> } {
  const markSeen = async (): Promise<void> => {
    await markAllSeen(deps.getState().specs);
    await deps.refresh();
  };
  const render = async (): Promise<void> => {
    const { specs, enabled, locale, defaultLocale } = deps.getState();
    renderDigest(
      container,
      await computeSeenDigest(specs, enabled),
      locale,
      defaultLocale,
      markSeen,
    );
  };
  return { render };
}
