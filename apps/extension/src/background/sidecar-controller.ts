import {
  SidecarClient,
  SidecarError,
  type SpecsResponse,
  type SpecWithFile,
} from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";
import { originMatchesDomains } from "../content/orchestrator.js";
import { SidecarSource } from "../sources/sidecar.js";

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
 * Owns the SidecarClient + active source + spec cache + SSE subscription. Kept
 * free of extension-runtime APIs so it can be unit-tested; the background
 * entrypoint injects storage and tab-broadcast behavior.
 */
export class SidecarController {
  private client: SidecarClient | null = null;
  private source: SidecarSource | null = null;
  private cache: SpecsResponse | null = null;
  private unwatch: (() => void) | null = null;

  constructor(private readonly deps: ControllerDeps = {}) {}

  configure(baseUrl: string, token: string): void {
    this.client = new SidecarClient({ baseUrl, token });
    this.source = new SidecarSource(this.client);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Active source id for the UI, or null when unconfigured. */
  activeSourceId(): string | null {
    return this.source?.id ?? null;
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
    if (!this.source) throw new SidecarError(0, "not_configured");
    this.cache = await this.source.loadSpecs();
    return this.cache;
  }

  getCache(): SpecsResponse | null {
    return this.cache;
  }

  /** Write a captured spec through the active source, then refresh the cache. */
  async saveSpec(file: string, spec: Spec): Promise<{ ok: boolean; errors?: string[] }> {
    if (!this.source) return { ok: false, errors: ["not configured"] };
    try {
      await this.source.saveSpec(file, spec);
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

  /** Begin watching for live changes; reloads + notifies on each change. */
  startWatch(): void {
    if (!this.source?.watch) return;
    this.stopWatch();
    this.unwatch = this.source.watch(() => {
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
