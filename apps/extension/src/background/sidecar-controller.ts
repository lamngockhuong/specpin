import {
  SidecarClient,
  SidecarError,
  type SpecsResponse,
  type SpecWithFile,
} from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { originMatchesDomains } from "../content/orchestrator.js";
import { ManualSource } from "../sources/manual.js";
import { selectSource } from "../sources/registry.js";
import { SidecarSource } from "../sources/sidecar.js";
import type { SpecSource } from "../sources/source.js";

export interface TestResult {
  ok: boolean;
  project?: string;
  error?: string;
}

export interface ControllerDeps {
  /** Called after specs are reloaded from a live SSE change. */
  onSpecsChanged?: () => void;
}

/**
 * Owns the available sources (sidecar + manual import), the spec cache, and the
 * SSE subscription. On reload it picks the first available source in fallback
 * order (sidecar, then manual). Kept free of extension-runtime APIs so it can be
 * unit-tested; the background entrypoint injects storage and tab-broadcast.
 */
export class SidecarController {
  private client: SidecarClient | null = null;
  private sidecarSource: SidecarSource | null = null;
  private readonly manual = new ManualSource();
  private cache: SpecsResponse | null = null;
  private unwatch: (() => void) | null = null;
  private lastLocalSeq = 0;
  private activeSource: string | null = null;

  constructor(private readonly deps: ControllerDeps = {}) {}

  configure(baseUrl: string, token: string): void {
    this.client = new SidecarClient({ baseUrl, token });
    this.sidecarSource = new SidecarSource(this.client);
  }

  /** Whether a sidecar connection is configured. */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Whether any specs are currently cached (sidecar or manual). */
  hasContent(): boolean {
    return this.cache !== null;
  }

  /**
   * Apply Manual-import specs (or clear with null) if this write is newer than
   * the last applied one. Returns false for stale/out-of-order writes so two
   * Options tabs cannot clobber a newer selection with an older one.
   */
  setLocalSpecs(specs: SpecsResponse | null, seq: number): boolean {
    if (seq <= this.lastLocalSeq) return false;
    this.lastLocalSeq = seq;
    this.manual.setSpecs(specs);
    return true;
  }

  /** Active source id for the UI (set on the last successful reload). */
  activeSourceId(): string | null {
    return this.activeSource;
  }

  async testConnection(): Promise<TestResult> {
    if (!this.client) return { ok: false, error: "not configured" };
    try {
      const health = await this.client.health();
      return { ok: health.ok, project: health.project };
    } catch (e) {
      const msg = e instanceof SidecarError ? e.code : String(e);
      return { ok: false, error: msg };
    }
  }

  async reload(): Promise<SpecsResponse> {
    const candidates: SpecSource[] = [];
    if (this.sidecarSource) candidates.push(this.sidecarSource);
    candidates.push(this.manual); // available only once local specs are set
    const source = await selectSource(candidates);
    if (!source) {
      this.activeSource = null;
      this.cache = null;
      throw new SidecarError(0, "no_source");
    }
    this.activeSource = source.id;
    this.cache = await source.loadSpecs();
    return this.cache;
  }

  getCache(): SpecsResponse | null {
    return this.cache;
  }

  /** Write a captured spec through the sidecar, then refresh the cache. Capture
   * is sidecar-only; Manual import is read-only. */
  async saveSpec(file: string, spec: Spec): Promise<{ ok: boolean; errors?: string[] }> {
    if (!this.sidecarSource) return { ok: false, errors: ["not configured"] };
    try {
      await this.sidecarSource.saveSpec(file, spec);
      await this.reload();
      return { ok: true };
    } catch (e) {
      const errors = e instanceof SidecarError ? [e.code, ...e.details] : [String(e)];
      return { ok: false, errors };
    }
  }

  /** Specs whose project domains include the given origin (cache must be warm). */
  specsForOrigin(origin: string): SpecWithFile[] {
    if (!this.cache) return [];
    const domains = this.cache.manifest?.domains ?? [];
    if (!originMatchesDomains(origin, domains)) return [];
    return this.cache.specs;
  }

  /** Begin watching the sidecar for live changes; reloads + notifies on each
   * change. Manual import has no live updates (re-import via Options). */
  startWatch(): void {
    if (!this.sidecarSource?.watch) return;
    this.stopWatch();
    this.unwatch = this.sidecarSource.watch(() => {
      void this.reload().then(() => this.deps.onSpecsChanged?.());
    });
  }

  stopWatch(): void {
    this.unwatch?.();
    this.unwatch = null;
  }

  /** Re-establish the watch and refresh the cache (used by the UI "Reconnect"). */
  async reconnect(): Promise<SpecsResponse> {
    this.stopWatch();
    const specs = await this.reload();
    this.startWatch();
    return specs;
  }
}
