import type { SpecsResponse } from "@specpin/api-client";
import type { Manifest, Spec } from "@specpin/spec-schema";
import { originMatchesDomains } from "../content/orchestrator.js";
import type { Connection, ConnectionStatus, TaggedSpec } from "../shared/connection-types.js";
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
  private manual: SpecsResponse | null = null;
  private lastLocalSeq = 0;

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

  /** Reload one connection (by id) or all of them. Per-connection failures are
   *  captured inside `reload`, so this never rejects on a single bad connection. */
  async reload(id?: string): Promise<void> {
    const targets = id
      ? [this.connections.get(id)].filter((c): c is SidecarConnection => c !== undefined)
      : [...this.connections.values()];
    await Promise.all(targets.map((c) => c.reload()));
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
    const targets = id
      ? [this.connections.get(id)].filter((c): c is SidecarConnection => c !== undefined)
      : [...this.connections.values()];
    for (const conn of targets) conn.stopWatch();
    await Promise.all(targets.map((c) => c.reload()));
    if (watch) for (const conn of targets) conn.startWatch();
  }

  stopWatchAll(): void {
    for (const conn of this.connections.values()) conn.stopWatch();
  }

  /** Apply Manual-import specs (or clear with null) when this write is newer than
   *  the last applied one; the seq guard stops two Options tabs clobbering each
   *  other. Returns false for stale writes. */
  setLocalSpecs(specs: SpecsResponse | null, seq: number): boolean {
    if (seq <= this.lastLocalSeq) return false;
    this.lastLocalSeq = seq;
    this.manual = specs;
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

    // Manual import is page-owned (the user explicitly loaded it); its empty
    // `domains` keeps the historical match-all behavior.
    if (this.manual) {
      const domains = this.manual.manifest?.domains ?? [];
      if (originMatchesDomains(origin, domains)) {
        const project = this.manual.manifest?.project ?? "";
        for (const spec of this.manual.specs)
          specs.push({ ...spec, connectionId: "manual", project });
        manifest ??= this.manual.manifest ?? null;
        collectLocales(localeSet, this.manual.manifest ?? null);
      }
    }

    return { specs, manifest, locales: [...localeSet] };
  }

  /** Save a captured spec to the connection serving the given origin (capture is
   *  sidecar-only; Manual import is read-only). */
  async saveSpec(
    origin: string,
    file: string,
    spec: Spec,
  ): Promise<{ ok: boolean; errors?: string[] }> {
    const target = [...this.connections.values()].find(
      (c) => c.getCache() && c.matchesOrigin(origin),
    );
    if (!target) return { ok: false, errors: ["no connected project serves this page"] };
    try {
      await target.saveSpec(file, spec);
      await target.reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [String(e)] };
    }
  }

  statuses(): ConnectionStatus[] {
    return [...this.connections.values()].map((c) => c.status());
  }

  /** Whether any connection is configured. */
  isConfigured(): boolean {
    return this.connections.size > 0;
  }

  /** Whether any specs are currently available (a connection cache or manual). */
  hasContent(): boolean {
    if (this.manual) return true;
    for (const conn of this.connections.values()) if (conn.getCache()) return true;
    return false;
  }

  /** Whether any connection's sidecar is currently reachable. */
  anyConnected(): boolean {
    return this.statuses().some((s) => s.connected);
  }

  /** Union of every connected project's locales (origin-independent), for the
   *  popup language picker. */
  allLocales(): string[] {
    const set = new Set<string>();
    for (const conn of this.connections.values())
      collectLocales(set, conn.getCache()?.manifest ?? null);
    if (this.manual) collectLocales(set, this.manual.manifest ?? null);
    return [...set];
  }
}

function collectLocales(set: Set<string>, manifest: Manifest | null): void {
  const settings = manifest?.settings;
  if (settings?.defaultLocale) set.add(settings.defaultLocale);
  for (const locale of settings?.locales ?? []) set.add(locale);
}
