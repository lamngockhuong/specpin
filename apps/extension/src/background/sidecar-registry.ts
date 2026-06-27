import type { SpecsResponse, ViewsConfig } from "@specpin/api-client";
import type { Manifest, Spec } from "@specpin/spec-schema";
import type { ManualBatch } from "../shared/config.js";
import {
  type Connection,
  type ConnectionStatus,
  MANUAL_CONNECTION_ID,
  type ManualBatchSummary,
  type TaggedSpec,
} from "../shared/connection-types.js";
import { originMatchesDomains } from "../shared/origin-match.js";
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
   *  mirroring how the connection list reconciles). Compared by id + spec count,
   *  not deep-equal, to stay cheap (a batch is immutable once stored). */
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
      for (const spec of cache.specs) specs.push({ ...spec, connectionId: conn.id, project });
      manifest ??= cache.manifest;
      collectLocales(localeSet, cache.manifest);
    }

    // Manual import is page-owned (the user explicitly loaded it); each batch's
    // empty `domains` keeps the historical match-all behavior. Spec ids are
    // deduped ACROSS batches (a `Spec.id` is unique only within a project, so a
    // re-imported project must not render two pins on the same element): first
    // matching batch wins.
    const seenManualIds = new Set<string>();
    for (const batch of this.manual) {
      const domains = batch.specs.manifest?.domains ?? [];
      if (!originMatchesDomains(origin, domains)) continue;
      const project = batch.specs.manifest?.project ?? "";
      for (const spec of batch.specs.specs) {
        if (seenManualIds.has(spec.id)) continue;
        seenManualIds.add(spec.id);
        specs.push({ ...spec, connectionId: MANUAL_CONNECTION_ID, project });
      }
      manifest ??= batch.specs.manifest ?? null;
      collectLocales(localeSet, batch.specs.manifest ?? null);
    }

    return { specs, manifest, locales: [...localeSet] };
  }

  /** The team-default hidden facet lists of every connection serving this origin
   *  (one array per connection). Fed to `buildVisibilityState`, which unions them
   *  hide-wins. Only origin-matching connections contribute (same boundary as
   *  `specsForOrigin`). */
  teamHiddenForOrigin(origin: string): string[][] {
    const sets: string[][] = [];
    for (const conn of this.connections.values()) {
      if (!conn.getCache() || !conn.matchesOrigin(origin)) continue;
      sets.push(conn.hiddenFacets());
    }
    return sets;
  }

  /** The cached team-default views for one connection (for the Options editor),
   *  or the empty default when unknown. */
  getViews(connectionId: string): ViewsConfig {
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
  ): Promise<{ ok: boolean; errors?: string[] }> {
    const target = this.writeTarget(origin, connectionId);
    if (!target) return { ok: false, errors: ["no connected project serves this page"] };
    try {
      await target.saveSpec(file, spec);
      await target.reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
    }
  }

  /** Update an existing spec (by id) in a connection serving the origin. Same
   *  routing + origin boundary as saveSpec; update is id-addressed, so no file
   *  argument is needed (the sidecar locates the spec across .spec.json files). */
  async updateSpec(
    origin: string,
    id: string,
    spec: Spec,
    connectionId?: string,
  ): Promise<{ ok: boolean; errors?: string[] }> {
    const target = this.writeTarget(origin, connectionId);
    if (!target) return { ok: false, errors: ["no connected project serves this page"] };
    try {
      await target.updateSpec(id, spec);
      await target.reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
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

/** Same length and, per index, same `id` and spec count. A batch is immutable
 *  once stored, so id + count is a sufficient change signal (cheaper than a deep
 *  compare) for echo-suppression in setLocalBatches. */
function sameBatchList(a: ManualBatch[], b: ManualBatch[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
    if (a[i]?.specs.specs.length !== b[i]?.specs.specs.length) return false;
  }
  return true;
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

function collectLocales(set: Set<string>, manifest: Manifest | null): void {
  const settings = manifest?.settings;
  if (settings?.defaultLocale) set.add(settings.defaultLocale);
  for (const locale of settings?.locales ?? []) set.add(locale);
}
