import {
  type GuidesConfig,
  SidecarError,
  type SpecsResponse,
  type ViewsConfig,
} from "@specpin/api-client";
import type { GuideDef, Manifest, Spec } from "@specpin/spec-schema";
import { batchServesOrigin, type ManualBatch } from "../shared/config.js";
import type {
  Connection,
  ConnectionStatus,
  ManualBatchSummary,
  TaggedGuide,
  TaggedSpec,
} from "../shared/connection-types.js";
import { isLocalConnectionId, localConnId } from "../shared/local-id.js";
import type { ProjectFlowsScreens } from "../shared/messaging.js";
import { originMatchesDomains } from "../shared/origin-match.js";
import { resolveStalenessThreshold } from "../shared/provenance.js";
import { type ConnectionDeps, SidecarConnection } from "./sidecar-connection.js";

export interface RegistryDeps {
  /** Called after any connection's SSE stream reports a change. */
  onSpecsChanged?: () => void;
  /** Per-connection reconnect jitter (thundering-herd guard, RT-FM2). */
  jitterMs?: number;
  /** Test seam: build a connection (default constructs a live SidecarConnection). */
  createConnection?: (conn: Connection, deps: ConnectionDeps) => SidecarConnection;
}

export interface OriginSpecs {
  specs: TaggedSpec[];
  manifest: Manifest | null;
  locales: string[];
}

/** One sidecar connection reconstructed for export: the cached specs payload plus a
 *  display project name and the cached team guides/views (no `required.json`: the
 *  sidecar never fetches it). Consumed by the background's GET_EXPORT_BUNDLES handler. */
export interface SidecarExportBundle {
  project: string;
  specs: SpecsResponse;
  guides: GuidesConfig;
  views: ViewsConfig;
}

/**
 * Holds many sidecar connections plus the page-owned Manual-import source, and
 * aggregates the specs that apply to a given page origin. Each connection is
 * isolated: a failure in one never drops the others' specs (RT-FM8). The
 * security boundary is `specsForOrigin` (RT-SA7): only connections whose project
 * `domains` cover the origin contribute, and an empty-`domains` project matches
 * only with explicit opt-in (RT-SA1).
 */
export class SidecarRegistry {
  private readonly connections = new Map<string, SidecarConnection>();
  private manual: ManualBatch[] = [];

  constructor(private readonly deps: RegistryDeps = {}) {}

  /** Reconcile the live connection set against stored config: add new, update
   *  changed, dispose removed. Does not reload or start watches by itself. */
  setConnections(configs: Connection[]): void {
    const seen = new Set<string>();
    for (const config of configs) {
      seen.add(config.id);
      const existing = this.connections.get(config.id);
      if (existing) existing.update(config);
      else {
        const deps: ConnectionDeps = {
          onSpecsChanged: this.deps.onSpecsChanged,
          jitterMs: this.deps.jitterMs,
        };
        const conn = this.deps.createConnection
          ? this.deps.createConnection(config, deps)
          : new SidecarConnection(config, deps);
        this.connections.set(config.id, conn);
      }
    }
    for (const [id, conn] of this.connections) {
      if (!seen.has(id)) {
        conn.dispose();
        this.connections.delete(id);
      }
    }
  }

  remove(id: string): void {
    const conn = this.connections.get(id);
    if (!conn) return;
    conn.dispose();
    this.connections.delete(id);
  }

  /** Apply a per-project on/off change: set the flag and reconcile the live watch.
   *  Disabling stops the SSE watch (and, via the flag, drops the project from
   *  aggregation); enabling reloads the cache and restarts the watch when the
   *  global switch is on. Self-contained: it sets `enabled` itself rather than
   *  relying on a prior `setConnections`, so callers can use it directly. */
  async setConnectionEnabled(id: string, enabled: boolean, watch: boolean): Promise<void> {
    const conn = this.connections.get(id);
    if (!conn) return;
    conn.enabled = enabled;
    if (!enabled) {
      conn.stopWatch();
      return;
    }
    await conn.reload();
    if (watch) conn.startWatch();
  }

  /** One connection (by id) or all of them; an unknown id yields none. */
  private targetsFor(id?: string): SidecarConnection[] {
    if (!id) return [...this.connections.values()];
    const conn = this.connections.get(id);
    return conn ? [conn] : [];
  }

  /** Reload one connection (by id) or all of them. Per-connection failures are
   *  captured inside `reload`, so this never rejects on a single bad connection. */
  async reload(id?: string): Promise<void> {
    await Promise.all(this.targetsFor(id).map((c) => c.reload()));
  }

  /** Re-establish every connection from scratch after a service-worker wake:
   *  reconcile, reload, and restart watches. The same path serves one or many
   *  connections (RT-FM1, general fix). */
  async reestablish(configs: Connection[], watch: boolean): Promise<void> {
    this.setConnections(configs);
    await this.reload();
    if (watch) this.startWatchAll();
  }

  startWatchAll(): void {
    for (const conn of this.connections.values()) conn.startWatch();
  }

  /** Reconnect one connection (by id) or all: drop the watch, reload, restart the
   *  watch (when watching is enabled). Isolated per connection. */
  async reconnect(id: string | undefined, watch: boolean): Promise<void> {
    const targets = this.targetsFor(id);
    for (const conn of targets) conn.stopWatch();
    await Promise.all(targets.map((c) => c.reload()));
    if (watch) for (const conn of targets) conn.startWatch();
  }

  stopWatchAll(): void {
    for (const conn of this.connections.values()) conn.stopWatch();
  }

  /** Set the whole Manual-import batch list from storage truth (the single
   *  writer). Returns whether the live list actually changed, so the caller
   *  broadcasts only on a real change (echo-suppression without a seq guard,
   *  mirroring how the connection list reconciles). Change is detected by content
   *  (see sameBatchList): a batch is NOT immutable (rename / edit-in-place mutate
   *  it without changing id or spec count). */
  setLocalBatches(batches: ManualBatch[]): boolean {
    if (sameBatchList(this.manual, batches)) return false;
    this.manual = batches;
    return true;
  }

  /** Drop all Manual-import batches as an authoritative reconcile: storage no
   *  longer has them, so memory must match. Returns whether anything was held. */
  clearLocalSpecs(): boolean {
    if (this.manual.length === 0) return false;
    this.manual = [];
    return true;
  }

  /** The specs that apply to a page origin, each tagged with its source. Only
   *  origin-matching connections contribute (the confidentiality boundary). Specs
   *  are never deduped across connections: two projects may share a spec id. */
  specsForOrigin(origin: string): OriginSpecs {
    const specs: TaggedSpec[] = [];
    const localeSet = new Set<string>();
    let manifest: Manifest | null = null;

    for (const conn of this.connections.values()) {
      const cache = conn.getCache();
      if (!cache || !conn.matchesOrigin(origin)) continue;
      const project = cache.manifest?.project ?? "";
      const stalenessThresholdDays = resolveStalenessThreshold(
        cache.manifest?.settings?.stalenessThresholdDays,
      );
      // A serving sidecar spec is always writable (capture/edit POST back to it).
      for (const spec of cache.specs)
        specs.push({
          ...spec,
          connectionId: conn.id,
          project,
          writable: true,
          stalenessThresholdDays,
        });
      manifest ??= cache.manifest;
      collectLocales(localeSet, cache.manifest);
    }

    // Manual import is page-owned (the user explicitly loaded it); each batch's
    // empty `domains` keeps the historical match-all behavior for RENDERING (the
    // stricter applyToAllSites opt-in only gates the WRITE path; see
    // localTargetsForOrigin). Each spec is tagged with its batch's per-batch
    // connection id (`manual:<batchId>`) so an edit routes back to that exact
    // batch. Spec ids are deduped ACROSS batches (a `Spec.id` is unique only
    // within a project, so a re-imported project must not render two pins on the
    // same element): first matching batch wins.
    const seenManualIds = new Set<string>();
    for (const batch of this.manual) {
      // A disabled batch serves no page (parallel to a disabled sidecar
      // connection); skip it before the render match. This enabled check is
      // separate from `batchServesOrigin` (which the guide + write paths use)
      // because rendering matches by the looser `originMatchesDomains` (match-all
      // on empty domains), not the stricter `applyToAllSites` write gate.
      if (batch.enabled === false) continue;
      const domains = batch.specs.manifest?.domains ?? [];
      if (!originMatchesDomains(origin, domains)) continue;
      const project = batch.specs.manifest?.project ?? "";
      const connectionId = localConnId(batch.id);
      // Local/manual batches usually carry no manifest settings → the 90-day
      // default (documented limitation: no per-local-project override).
      const stalenessThresholdDays = resolveStalenessThreshold(
        batch.specs.manifest?.settings?.stalenessThresholdDays,
      );
      // A local spec is editable only when this origin could also write to its
      // batch (the same applyToAllSites gate the write guard uses): an
      // empty-domains imported batch renders match-all but is not a write target,
      // so its specs must not offer an Edit that would always fail.
      const writable = batchServesOrigin(batch, origin);
      for (const spec of batch.specs.specs) {
        if (seenManualIds.has(spec.id)) continue;
        seenManualIds.add(spec.id);
        specs.push({ ...spec, connectionId, project, writable, stalenessThresholdDays });
      }
      manifest ??= batch.specs.manifest ?? null;
      collectLocales(localeSet, batch.specs.manifest ?? null);
    }

    return { specs, manifest, locales: [...localeSet] };
  }

  /** The team-default hidden facet lists of every project serving this origin (one
   *  array per project). Fed to `buildVisibilityState`, which unions them hide-wins.
   *  Includes both sidecar connections and imported Manual batches (an imported
   *  `.specs/views.json` hides specs exactly like a sidecar's). Manual batches use
   *  the same RENDER gate as `specsForOrigin` (enabled + `originMatchesDomains`,
   *  match-all on empty domains) - deliberately the looser render gate, not the
   *  stricter `applyToAllSites` write gate, so hides track wherever the batch's
   *  specs render. Do not tighten this to `batchServesOrigin`. */
  teamHiddenForOrigin(origin: string): string[][] {
    const sets: string[][] = [];
    for (const conn of this.connections.values()) {
      if (!conn.getCache() || !conn.matchesOrigin(origin)) continue;
      sets.push(conn.hiddenFacets());
    }
    for (const batch of this.manual) {
      if (batch.enabled === false) continue;
      if (!originMatchesDomains(origin, batch.specs.manifest?.domains ?? [])) continue;
      sets.push(batch.views?.hidden ?? []);
    }
    return sets;
  }

  /** Local (Manual) batches that are WRITABLE targets for this origin. Mirrors
   *  the sidecar RT-SA1 rule (`statusServesOrigin`): a batch that pins domains
   *  matches by host; one that pins none matches only when `applyToAllSites` is
   *  set. The single source of truth shared by GET_WRITE_TARGETS (the capture
   *  picker) and the SAVE/UPDATE local-write origin guard, so a page can never
   *  write to a local project that does not serve it. `id` is `manual:<batchId>`. */
  localTargetsForOrigin(origin: string): Array<{ id: string; project: string }> {
    const out: Array<{ id: string; project: string }> = [];
    for (const batch of this.manual) {
      if (!batchServesOrigin(batch, origin)) continue;
      out.push({
        id: localConnId(batch.id),
        project: batch.specs.manifest?.project || batch.label,
      });
    }
    return out;
  }

  /** Local batches to export: the one named by `id`, else those that render on
   *  `origin` (originMatchesDomains), else (none match, or no selector) all of
   *  them. Carries the full specs payload, so callers must be trusted (the
   *  GET_EXPORT_BUNDLES handler is privileged). */
  manualBatchesForExport(opts: { id?: string; origin?: string }): ManualBatch[] {
    if (opts.id) {
      const b = this.manual.find((x) => x.id === opts.id);
      return b ? [b] : [];
    }
    if (opts.origin) {
      const origin = opts.origin;
      const serving = this.manual.filter((b) =>
        originMatchesDomains(origin, b.specs.manifest?.domains ?? []),
      );
      if (serving.length) return serving;
    }
    return [...this.manual];
  }

  /** Sidecar connections to export: the one named by `id`, else those serving
   *  `origin`. Only connections with a live cache are returned (a down/never-loaded
   *  sidecar has nothing to bundle). Returns the cached specs payload + a display
   *  project name, plus the cached team guides/views so an export can write back
   *  `.specs/guides.json` / `views.json` (there is no cached `required.json`: the
   *  sidecar never fetches it). Privileged (carries the full specs), like the manual
   *  path. */
  sidecarBatchesForExport(opts: { id?: string; origin?: string }): SidecarExportBundle[] {
    const bundle = (conn: SidecarConnection): SidecarExportBundle | null => {
      const specs = conn.getCache();
      if (!specs) return null;
      return {
        project: specs.manifest?.project || conn.label || conn.baseUrl,
        specs,
        guides: conn.getGuides(),
        views: conn.getViews(),
      };
    };
    if (opts.id) {
      const conn = this.connections.get(opts.id);
      const out = conn ? bundle(conn) : null;
      return out ? [out] : [];
    }
    const out: SidecarExportBundle[] = [];
    for (const conn of this.connections.values()) {
      if (opts.origin && !conn.matchesOrigin(opts.origin)) continue;
      const got = bundle(conn);
      if (got) out.push(got);
    }
    return out;
  }

  /** Every sidecar connection's flows + screens configs, one entry per
   *  connection with a live cache (a down/never-loaded sidecar has nothing to
   *  contribute). Not origin-scoped -- the graph panel is a standalone tab, not
   *  tied to a page -- so this returns every connected project regardless of
   *  which site it serves. Each entry carries its own `connectionId` alongside
   *  the display `project` name so the panel can distinguish two projects that
   *  happen to share a name; flows/screens across connections are never merged
   *  (a page can have multiple connected projects, each with its own
   *  `application-status` flow that must not collide with another's). */
  flowsScreensByProject(): ProjectFlowsScreens[] {
    const out: ProjectFlowsScreens[] = [];
    for (const conn of this.connections.values()) {
      const specs = conn.getCache();
      if (!specs) continue;
      out.push({
        connectionId: conn.id,
        project: specs.manifest?.project || conn.label || conn.baseUrl,
        flows: conn.getFlows(),
        screens: conn.getScreens(),
      });
    }
    return out;
  }

  /** Resolve a local `manual:<id>` connection id to its stored batch (undefined when
   *  it is not a local id or no batch matches). Shared by the local branches of
   *  getViews/getGuides so the id-scheme comparison lives in one place. */
  private localBatch(connectionId: string): ManualBatch | undefined {
    return this.manual.find((b) => localConnId(b.id) === connectionId);
  }

  /** The cached team-default views for one project (for the Options editor), or the
   *  empty default when unknown. Resolves a local `manual:<id>` id to that batch's
   *  imported views so the manual-batch editor mirrors the sidecar one. */
  getViews(connectionId: string): ViewsConfig {
    if (isLocalConnectionId(connectionId)) {
      return this.localBatch(connectionId)?.views ?? { version: "1.0", hidden: [] };
    }
    return this.connections.get(connectionId)?.getViews() ?? { version: "1.0", hidden: [] };
  }

  /** Persist a team-default views config to one connection (Options authoring). */
  async saveViews(
    connectionId: string,
    config: ViewsConfig,
  ): Promise<{ ok: boolean; errors?: string[] }> {
    const conn = this.connections.get(connectionId);
    if (!conn) return { ok: false, errors: ["unknown connection"] };
    try {
      await conn.saveViews(config);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
    }
  }

  /** The cached team guides for one project (for the Options editor), or the empty
   *  default when unknown. Resolves a local `manual:<id>` id to that batch's guides
   *  so the manual-batch guides list mirrors the sidecar one. */
  getGuides(connectionId: string): GuidesConfig {
    if (isLocalConnectionId(connectionId)) {
      return { version: "1.0", guides: this.localBatch(connectionId)?.guides ?? [] };
    }
    return this.connections.get(connectionId)?.getGuides() ?? { version: "1.0", guides: [] };
  }

  /** Team guides that apply to a page origin, each tagged scope:"team" with its
   *  owning project + connection id. Two sources contribute: sidecar connections
   *  serving the origin (the same `matchesOrigin` boundary as specs), and local
   *  committed batches serving it (RT-H7, `batchServesOrigin` - the same write
   *  gate the local guide editor uses). Personal guides are merged separately by
   *  the background (they live in storage.sync, a per-user trust boundary). */
  guidesForOrigin(origin: string): TaggedGuide[] {
    const out: TaggedGuide[] = [];
    for (const conn of this.connections.values()) {
      const cache = conn.getCache();
      if (!cache || !conn.matchesOrigin(origin)) continue;
      const project = cache.manifest?.project ?? "";
      for (const guide of conn.getGuides().guides) {
        out.push({ ...guide, scope: "team", project, connectionId: conn.id });
      }
    }
    for (const batch of this.manual) {
      if (!batch.guides?.length || !batchServesOrigin(batch, origin)) continue;
      const project = batch.specs.manifest?.project || batch.label;
      const connectionId = localConnId(batch.id);
      for (const guide of batch.guides) {
        out.push({ ...guide, scope: "team", project, connectionId });
      }
    }
    return out;
  }

  /** Upsert a guide (by id) into a sidecar connection's whole-file guides config
   *  and persist it (RT-H7 sidecar branch). Re-reads the LIVE config first via
   *  reload() (RT-H3): three surfaces edit guides, so writing back a stale cache
   *  would lose a concurrent change. Local + personal targets are handled by the
   *  background's storage path, not here. */
  async upsertGuide(
    connectionId: string,
    guide: GuideDef,
  ): Promise<{ ok: boolean; errors?: string[] }> {
    const conn = this.connections.get(connectionId);
    if (!conn) return { ok: false, errors: ["unknown connection"] };
    try {
      await conn.reload();
      const config = conn.getGuides();
      const idx = config.guides.findIndex((g) => g.id === guide.id);
      const guides =
        idx === -1
          ? [...config.guides, guide]
          : config.guides.map((g, i) => (i === idx ? guide : g));
      await conn.saveGuides({ ...config, guides });
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
    }
  }

  /** Remove a guide (by id) from a sidecar connection's whole-file guides config.
   *  Re-reads the live config first (RT-H3), same as upsertGuide. */
  async deleteGuide(connectionId: string, id: string): Promise<{ ok: boolean; errors?: string[] }> {
    const conn = this.connections.get(connectionId);
    if (!conn) return { ok: false, errors: ["unknown connection"] };
    try {
      await conn.reload();
      const config = conn.getGuides();
      await conn.saveGuides({ ...config, guides: config.guides.filter((g) => g.id !== id) });
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
    }
  }

  /** Save a captured spec to a connection serving the given origin (capture is
   *  sidecar-only; Manual import is read-only). When `connectionId` is given it
   *  picks that connection (if it serves the origin); otherwise the first match.
   *  Routing is always bounded by `matchesOrigin`, so a page cannot write to a
   *  project that does not serve it. */
  /** The connection a write for this origin should target: the one named by
   *  `connectionId` (if it serves the origin), else the first serving connection.
   *  Always bounded by `matchesOrigin`, so a page can never write to a project that
   *  does not serve it (RT-SA7). Shared by saveSpec + updateSpec. */
  private writeTarget(origin: string, connectionId?: string): SidecarConnection | undefined {
    const candidates = [...this.connections.values()].filter(
      (c) => c.getCache() && c.matchesOrigin(origin),
    );
    return connectionId ? candidates.find((c) => c.id === connectionId) : candidates[0];
  }

  async saveSpec(
    origin: string,
    file: string,
    spec: Spec,
    connectionId?: string,
  ): Promise<{ ok: boolean; errors?: string[]; conflict?: boolean }> {
    const target = this.writeTarget(origin, connectionId);
    if (!target) return { ok: false, errors: ["no connected project serves this page"] };
    try {
      await target.saveSpec(file, spec);
      await target.reload();
      return { ok: true };
    } catch (e) {
      return this.writeError(target, e);
    }
  }

  /** Normalize a write failure. A 409 means the specs changed elsewhere: reload
   *  the connection (refreshing its cache + the client's ETag so a retry can
   *  succeed) and flag the conflict so the UI shows a non-fatal "review + retry". */
  private async writeError(
    target: SidecarConnection,
    e: unknown,
  ): Promise<{ ok: false; errors: string[]; conflict?: boolean }> {
    if (e instanceof SidecarError && e.status === 409) {
      await target.reload();
      return { ok: false, conflict: true, errors: ["version_mismatch"] };
    }
    return { ok: false, errors: [String(e)] };
  }

  /** Update an existing spec (by id) in a connection serving the origin. Same
   *  routing + origin boundary as saveSpec; update is id-addressed, so no file
   *  argument is needed (the sidecar locates the spec across .spec.json files). */
  async updateSpec(
    origin: string,
    id: string,
    spec: Spec,
    connectionId?: string,
  ): Promise<{ ok: boolean; errors?: string[]; conflict?: boolean }> {
    const target = this.writeTarget(origin, connectionId);
    if (!target) return { ok: false, errors: ["no connected project serves this page"] };
    try {
      await target.updateSpec(id, spec);
      await target.reload();
      return { ok: true };
    } catch (e) {
      return this.writeError(target, e);
    }
  }

  /** Delete a spec (by id) from a connection serving the origin. Same routing +
   *  origin boundary as updateSpec; delete is id-addressed (the sidecar locates
   *  the spec across .spec.json files). */
  async deleteSpec(
    origin: string,
    id: string,
    connectionId?: string,
  ): Promise<{ ok: boolean; errors?: string[]; conflict?: boolean }> {
    const target = this.writeTarget(origin, connectionId);
    if (!target) return { ok: false, errors: ["no connected project serves this page"] };
    try {
      await target.deleteSpec(id);
      await target.reload();
      return { ok: true };
    } catch (e) {
      return this.writeError(target, e);
    }
  }

  statuses(): ConnectionStatus[] {
    return [...this.connections.values()].map((c) => c.status());
  }

  /** Number of Manual-import specs currently loaded across all batches (0 if
   *  none). Manual specs are not part of `statuses()` (they are not a connection),
   *  so callers summing a total spec count must add this separately. */
  manualSpecCount(): number {
    return this.manual.reduce((n, b) => n + b.specs.specs.length, 0);
  }

  /** Per-batch summaries for the Options list. Carries no `specs` payload, so it
   *  is safe to send over GET_STATUS. */
  manualBatchSummaries(): ManualBatchSummary[] {
    return this.manual.map((b) => ({
      id: b.id,
      label: b.label,
      source: b.source,
      fileNames: b.fileNames,
      project: b.specs.manifest?.project ?? "",
      domains: b.specs.manifest?.domains ?? [],
      specCount: b.specs.specs.length,
      importedAt: b.importedAt,
      enabled: b.enabled !== false,
    }));
  }

  /** Whether any connection is configured. */
  isConfigured(): boolean {
    return this.connections.size > 0;
  }

  /** Whether any specs are currently available (a connection cache or manual). */
  hasContent(): boolean {
    if (this.manual.length) return true;
    for (const conn of this.connections.values()) if (conn.getCache()) return true;
    return false;
  }

  /** Whether any connection's sidecar is currently reachable. */
  anyConnected(): boolean {
    for (const conn of this.connections.values()) if (conn.isConnected()) return true;
    return false;
  }

  /** Union of every connected project's locales (origin-independent), for the
   *  popup language picker. */
  allLocales(): string[] {
    const set = new Set<string>();
    for (const conn of this.connections.values())
      collectLocales(set, conn.getCache()?.manifest ?? null);
    for (const b of this.manual) collectLocales(set, b.specs.manifest ?? null);
    return [...set];
  }
}

/** Whether two batch lists are content-identical, for echo-suppression in
 *  setLocalBatches. A batch is NOT immutable once stored: rename changes its
 *  project/domains/label and edit-in-place changes a spec's content, both with the
 *  same id and spec count. So id + count is not a sufficient change signal (it
 *  would drop a rename/edit on the floor); a structural compare is. Cheap enough:
 *  this runs only on a local mutation or a storage-change reconcile, not per read,
 *  and the batch list is capped. */
function sameBatchList(a: ManualBatch[], b: ManualBatch[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Prior batches a candidate bundle duplicates, by normalized project name (trim
 *  + case-insensitive). An empty project never matches (avoids flagging untitled
 *  bundles). `overlapSpecIds` counts shared spec ids for the warning text only;
 *  cheap because it runs once per import and the list is capped. */
export function findDuplicateBatches(
  candidate: SpecsResponse,
  existing: ManualBatch[],
): { id: string; label: string; project: string; overlapSpecIds: number }[] {
  const norm = (p: string | undefined): string => (p ?? "").trim().toLowerCase();
  const candProject = norm(candidate.manifest?.project);
  if (!candProject) return [];
  const candIds = new Set(candidate.specs.map((s) => s.id));
  return existing
    .filter((batch) => norm(batch.specs.manifest?.project) === candProject)
    .map((batch) => ({
      id: batch.id,
      label: batch.label,
      project: batch.specs.manifest?.project ?? "",
      overlapSpecIds: batch.specs.specs.filter((s) => candIds.has(s.id)).length,
    }));
}

/** Whether two domain lists could both serve some page. An empty list is
 *  render-time match-all (page-owned manual source), so it overlaps anything;
 *  otherwise two lists overlap when a host in one equals or is a sub/superdomain
 *  of a host in the other. Used only for the import-time collision warning. */
function domainsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((d) => b.some((e) => d === e || d.endsWith(`.${e}`) || e.endsWith(`.${d}`)));
}

/** Spec ids the candidate bundle shares with an existing batch whose domains
 *  could serve the same page. Across batches `specsForOrigin` dedups first-wins,
 *  so such a spec renders (and edits route) only to the first matching batch; the
 *  import surfaces these ids as a non-blocking warning so the user can resolve the
 *  overlap. Empty when there is no cross-batch collision. */
export function findSpecIdCollisions(candidate: SpecsResponse, existing: ManualBatch[]): string[] {
  const candDomains = candidate.manifest?.domains ?? [];
  const candIds = new Set(candidate.specs.map((s) => s.id));
  const collisions = new Set<string>();
  for (const batch of existing) {
    if (!domainsOverlap(candDomains, batch.specs.manifest?.domains ?? [])) continue;
    for (const s of batch.specs.specs) if (candIds.has(s.id)) collisions.add(s.id);
  }
  return [...collisions];
}

function collectLocales(set: Set<string>, manifest: Manifest | null): void {
  const settings = manifest?.settings;
  if (settings?.defaultLocale) set.add(settings.defaultLocale);
  for (const locale of settings?.locales ?? []) set.add(locale);
}
