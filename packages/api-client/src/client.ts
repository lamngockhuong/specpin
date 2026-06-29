import type { GuidesConfig, Manifest, Spec, ViewsConfig } from "@specpin/spec-schema";
import { SidecarError } from "./errors.js";
import { type ConnectionState, type SubscribeOptions, subscribeEvents } from "./events.js";

export type { GuidesConfig, ViewsConfig } from "@specpin/spec-schema";

export interface SidecarClientOptions {
  baseUrl: string;
  token: string;
  /** Override fetch (tests / non-global environments). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  project: string;
}

/** A spec as returned by GET /specs: it carries the file it lives in. */
export type SpecWithFile = Spec & { _file: string };

export interface SpecsResponse {
  manifest: Manifest;
  specs: SpecWithFile[];
}

/** Typed client over the sidecar HTTP contract. Attaches the bearer token to
 * every request and normalizes failures to {@link SidecarError}. */
export class SidecarClient {
  private readonly baseUrl: string;
  private token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SidecarClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Update the bearer token after a sidecar restart rotated it. */
  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new SidecarError(0, "network_error", [String(cause)], "sidecar unreachable");
    }

    if (!res.ok) {
      let code = `http_${res.status}`;
      let details: string[] = [];
      try {
        const payload = (await res.json()) as { error?: string; details?: unknown };
        if (typeof payload?.error === "string") code = payload.error;
        if (Array.isArray(payload?.details)) details = payload.details.map(String);
      } catch {
        // non-JSON error body; keep the default code
      }
      throw new SidecarError(res.status, code, details);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health");
  }

  getSpecs(): Promise<SpecsResponse> {
    return this.request<SpecsResponse>("GET", "/specs");
  }

  /** The team-default visibility config from .specs/views.json. The sidecar
   *  returns the empty default ({ version, hidden: [] }) when the file is absent. */
  getViews(): Promise<ViewsConfig> {
    return this.request<ViewsConfig>("GET", "/views");
  }

  /** Write the team-default visibility config (validated server-side). */
  async putViews(config: ViewsConfig): Promise<void> {
    await this.request("PUT", "/views", config);
  }

  /** The named-guides config from .specs/guides.json. The sidecar returns the
   *  empty default ({ version, guides: [] }) when the file is absent. */
  getGuides(): Promise<GuidesConfig> {
    return this.request<GuidesConfig>("GET", "/guides");
  }

  /** Write the named-guides config (validated server-side). */
  async putGuides(config: GuidesConfig): Promise<void> {
    await this.request("PUT", "/guides", config);
  }

  async saveSpec(file: string, spec: Spec): Promise<void> {
    await this.request("POST", "/specs", { file, spec });
  }

  async updateSpec(id: string, spec: Spec): Promise<void> {
    await this.request("PUT", `/specs/${encodeURIComponent(id)}`, spec);
  }

  async deleteSpec(id: string): Promise<void> {
    await this.request("DELETE", `/specs/${encodeURIComponent(id)}`);
  }

  /** Subscribe to live change events. Returns an unsubscribe function. */
  subscribe(onChange: () => void, options: Omit<SubscribeOptions, "fetch"> = {}): () => void {
    return subscribeEvents(this.baseUrl, this.token, onChange, {
      ...options,
      fetch: this.fetchImpl,
    });
  }
}

export type { ConnectionState };
