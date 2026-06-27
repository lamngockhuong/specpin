import {
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

  private client: SidecarClient;
  private source: SpecSource;
  private token: string;
  private readonly injectedSource: boolean;
  private cache: SpecsResponse | null = null;
  private viewsCache: ViewsConfig | null = null;
  private unwatch: (() => void) | null = null;
  private connected = false;
  private lastError: string | null = null;

  constructor(
    conn: Connection,
    private readonly deps: ConnectionDeps = {},
  ) {
    this.id = conn.id;
    this.baseUrl = conn.baseUrl;
    this.label = conn.label;
    this.applyToAllSites = conn.applyToAllSites ?? false;
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
    if (!this.injectedSource && (conn.baseUrl !== this.baseUrl || conn.token !== this.token)) {
      this.baseUrl = conn.baseUrl;
      this.token = conn.token;
      this.client = new SidecarClient({ baseUrl: conn.baseUrl, token: conn.token });
      this.source = new SidecarSource(this.client);
    }
  }

  /** Reload this connection's specs (and its team-default views). Captures
   *  failure on the instance instead of throwing, so the registry can keep
   *  aggregating the others. */
  async reload(): Promise<void> {
    // Fetch specs and views to the same sidecar in parallel (one round-trip, not
    // two). allSettled keeps the views fetch isolated: an older sidecar without
    // /views (404) must not drop the specs we loaded, and a specs failure marks
    // the connection disconnected regardless of the views result.
    const [specs, views] = await Promise.allSettled([
      this.source.loadSpecs(),
      this.source.loadViews?.() ?? Promise.resolve(null),
    ]);
    if (specs.status === "fulfilled") {
      this.cache = specs.value;
      this.connected = true;
      this.lastError = null;
    } else {
      this.cache = null;
      this.viewsCache = null;
      this.connected = false;
      this.lastError =
        specs.reason instanceof SidecarError ? specs.reason.code : String(specs.reason);
      return;
    }
    this.viewsCache = views.status === "fulfilled" ? (views.value ?? null) : null;
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

  /** Sidecar currently reachable (last reload succeeded). Cheaper than building
   *  a full ConnectionStatus just to read this flag. */
  isConnected(): boolean {
    return this.connected;
  }

  saveSpec(file: string, spec: Spec): Promise<void> {
    return this.source.saveSpec(file, spec);
  }

  /** Does this connection's project serve the given origin? Empty `domains` does
   *  NOT silently match every site (RT-SA1): it matches only with opt-in. Shares
   *  the rule with the popup via `statusServesOrigin`. */
  matchesOrigin(origin: string): boolean {
    const domains = this.cache?.manifest?.domains ?? [];
    return statusServesOrigin(
      { domains, matchesAllSites: domains.length === 0 && this.applyToAllSites },
      origin,
    );
  }

  startWatch(): void {
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
  }

  status(): ConnectionStatus {
    const domains = this.cache?.manifest?.domains ?? [];
    return {
      id: this.id,
      label: this.label,
      baseUrl: this.baseUrl,
      project: this.cache?.manifest?.project ?? null,
      connected: this.connected,
      error: this.lastError ?? undefined,
      specCount: this.cache?.specs.length ?? 0,
      domains,
      matchesAllSites: domains.length === 0 && this.applyToAllSites,
    };
  }
}
