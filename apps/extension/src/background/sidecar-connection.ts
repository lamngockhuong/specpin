import {
  type GuidesConfig,
  SidecarClient,
  SidecarError,
  type SpecsResponse,
  type ViewsConfig,
} from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import type { Connection, ConnectionStatus } from "../shared/connection-types.js";
import { statusServesOrigin } from "../shared/origin-match.js";
import { SidecarSource } from "../sources/sidecar.js";
import type { SpecSource } from "../sources/source.js";

export interface ConnectionDeps {
  /** Fired when this connection's SSE stream reports a change. */
  onSpecsChanged?: () => void;
  /** Random extra reconnect delay so N connections do not reconnect in lockstep. */
  jitterMs?: number;
  /** Test seam: inject a fake source instead of a live SidecarSource/client. */
  source?: SpecSource;
}

/**
 * One sidecar project: its own client, token, spec cache, and SSE watch. Unlike
 * the former single SidecarController it holds NO manual source and NO fallback,
 * so the registry can own many of these independently. Errors are captured on
 * the instance (never thrown out of `reload`) so one failing connection cannot
 * abort aggregation for the others (RT-FM8).
 */
export class SidecarConnection {
  readonly id: string;
  baseUrl: string;
  label?: string;
  applyToAllSites: boolean;
  /** Per-project on/off. A disabled connection serves no origin and never starts
   *  a watch. Undefined config = enabled (backward compatible). */
  enabled: boolean;

  private client: SidecarClient;
  private source: SpecSource;
  private token: string;
  private readonly injectedSource: boolean;
  private cache: SpecsResponse | null = null;
  private viewsCache: ViewsConfig | null = null;
  private guidesCache: GuidesConfig | null = null;
  private unwatch: (() => void) | null = null;
  private connected = false;
  private lastError: string | null = null;
  private lastErrorDetail: string | null = null;
  // Domains from the last successful load. A failed reload clears `cache` (and
  // with it the live domains), which would drop a domain-pinned project out of
  // the origin-scoped status the moment it goes down -- the popup would then show
  // "No specs for this page" instead of a disconnect. Keeping the last-known
  // domains lets the status still recognize the project's own pages while down.
  private lastDomains: string[] = [];

  constructor(
    conn: Connection,
    private readonly deps: ConnectionDeps = {},
  ) {
    this.id = conn.id;
    this.baseUrl = conn.baseUrl;
    this.label = conn.label;
    this.applyToAllSites = conn.applyToAllSites ?? false;
    this.enabled = conn.enabled ?? true;
    this.token = conn.token;
    this.client = new SidecarClient({ baseUrl: conn.baseUrl, token: conn.token });
    this.injectedSource = deps.source !== undefined;
    this.source = deps.source ?? new SidecarSource(this.client);
  }

  /** Apply a changed config. The client/source are recreated only when the
   *  baseUrl or token actually changed; a label/opt-in edit keeps the live
   *  client (and its cache) untouched. */
  update(conn: Connection): void {
    this.label = conn.label;
    this.applyToAllSites = conn.applyToAllSites ?? false;
    this.enabled = conn.enabled ?? true;
    if (!this.injectedSource && (conn.baseUrl !== this.baseUrl || conn.token !== this.token)) {
      this.baseUrl = conn.baseUrl;
      this.token = conn.token;
      this.client = new SidecarClient({ baseUrl: conn.baseUrl, token: conn.token });
      this.source = new SidecarSource(this.client);
      // New endpoint: the prior project's domains no longer apply.
      this.lastDomains = [];
    }
  }

  /** Reload this connection's specs (and its team-default views). Captures
   *  failure on the instance instead of throwing, so the registry can keep
   *  aggregating the others. */
  async reload(): Promise<void> {
    // Fetch specs, views, and guides to the same sidecar in parallel (one
    // round-trip, not three). allSettled keeps the views/guides fetches isolated
    // (RT-M3): an older sidecar without /views or /guides (404) must not drop the
    // specs we loaded, and a specs failure marks the connection disconnected
    // regardless of the views/guides results. guides being in this same group is
    // exactly what gives it SSE liveness: a guides-only .specs/ change triggers a
    // reload that refreshes guidesCache here.
    const [specs, views, guides] = await Promise.allSettled([
      this.source.loadSpecs(),
      this.source.loadViews?.() ?? Promise.resolve(null),
      this.source.loadGuides?.() ?? Promise.resolve(null),
    ]);
    if (specs.status === "fulfilled") {
      this.cache = specs.value;
      this.connected = true;
      this.lastError = null;
      this.lastErrorDetail = null;
      this.lastDomains = specs.value.manifest?.domains ?? [];
    } else {
      this.cache = null;
      this.viewsCache = null;
      this.guidesCache = null;
      this.connected = false;
      if (specs.reason instanceof SidecarError) {
        this.lastError = specs.reason.code;
        // Surface the sidecar's `details` so the UI can show why (e.g. the
        // missing manifest path) instead of just the opaque code.
        this.lastErrorDetail = specs.reason.details.length ? specs.reason.details.join("; ") : null;
      } else {
        this.lastError = String(specs.reason);
        this.lastErrorDetail = null;
      }
      return;
    }
    this.viewsCache = views.status === "fulfilled" ? (views.value ?? null) : null;
    this.guidesCache = guides.status === "fulfilled" ? (guides.value ?? null) : null;
  }

  getCache(): SpecsResponse | null {
    return this.cache;
  }

  /** The team-default views config, or the empty default when unavailable. */
  getViews(): ViewsConfig {
    return this.viewsCache ?? { version: "1.0", hidden: [] };
  }

  /** This connection's team-hidden facet keys (empty when no views.json). */
  hiddenFacets(): string[] {
    return this.viewsCache?.hidden ?? [];
  }

  /** Persist a team-default views config, then refresh the cache. */
  async saveViews(config: ViewsConfig): Promise<void> {
    if (!this.source.saveViews) throw new Error("source does not support views");
    await this.source.saveViews(config);
    await this.reload();
  }

  /** The team guides config, or the empty default when unavailable. */
  getGuides(): GuidesConfig {
    return this.guidesCache ?? { version: "1.0", guides: [] };
  }

  /** Persist a team guides config, then refresh the cache. */
  async saveGuides(config: GuidesConfig): Promise<void> {
    if (!this.source.saveGuides) throw new Error("source does not support guides");
    await this.source.saveGuides(config);
    await this.reload();
  }

  /** Sidecar currently reachable (last reload succeeded). Cheaper than building
   *  a full ConnectionStatus just to read this flag. */
  isConnected(): boolean {
    return this.connected;
  }

  saveSpec(file: string, spec: Spec): Promise<void> {
    return this.source.saveSpec(file, spec);
  }

  updateSpec(id: string, spec: Spec): Promise<void> {
    return this.source.updateSpec(id, spec);
  }

  deleteSpec(id: string): Promise<void> {
    return this.source.deleteSpec(id);
  }

  /** Does this connection's project serve the given origin? Empty `domains` does
   *  NOT silently match every site (RT-SA1): it matches only with opt-in. Shares
   *  the rule with the popup via `statusServesOrigin`. */
  matchesOrigin(origin: string): boolean {
    // Disabled connections serve no page: this single gate removes them from spec
    // aggregation, team-hidden facets, and write routing (all funnel through here).
    if (!this.enabled) return false;
    const domains = this.cache?.manifest?.domains ?? [];
    return statusServesOrigin(
      { domains, matchesAllSites: domains.length === 0 && this.applyToAllSites },
      origin,
    );
  }

  startWatch(): void {
    // A disabled connection never watches, so startWatchAll() and the SW-wake
    // reestablish() never resurrect its SSE stream.
    if (!this.enabled) return;
    // Idempotent: a live watch already auto-reconnects internally, so keep it
    // rather than tearing down the SSE stream and re-subscribing. This makes the
    // periodic SW-keepalive a no-op when the worker is healthy; only a worker
    // that lost its watches (eviction) re-subscribes. `reconnect()` forces a
    // fresh watch by calling stopWatch() first.
    if (this.unwatch) return;
    this.unwatch =
      this.source.watch?.(
        () => {
          void this.reload().then(() => this.deps.onSpecsChanged?.());
        },
        { jitterMs: this.deps.jitterMs },
      ) ?? null;
  }

  stopWatch(): void {
    this.unwatch?.();
    this.unwatch = null;
  }

  dispose(): void {
    this.stopWatch();
    this.cache = null;
    this.viewsCache = null;
    this.guidesCache = null;
    this.lastDomains = [];
  }

  status(): ConnectionStatus {
    // Live domains when connected; the last-known set while down so a domain-
    // pinned project still scopes to its own pages in the disconnect status.
    const domains = this.cache?.manifest?.domains ?? this.lastDomains;
    return {
      id: this.id,
      label: this.label,
      baseUrl: this.baseUrl,
      project: this.cache?.manifest?.project ?? null,
      connected: this.connected,
      error: this.lastError ?? undefined,
      errorDetail: this.lastErrorDetail ?? undefined,
      specCount: this.cache?.specs.length ?? 0,
      domains,
      matchesAllSites: domains.length === 0 && this.applyToAllSites,
      enabled: this.enabled,
    };
  }
}
