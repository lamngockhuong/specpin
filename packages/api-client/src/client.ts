import type {
  FlowsConfig,
  GuidesConfig,
  Manifest,
  ScreensConfig,
  ShotConfig,
  Spec,
  ViewsConfig,
} from "@specpin/spec-schema";
import { SidecarError } from "./errors.js";
import { type ConnectionState, type SubscribeOptions, subscribeEvents } from "./events.js";

export type {
  FlowsConfig,
  GuidesConfig,
  ScreensConfig,
  ShotConfig,
  ShotItem,
  ViewsConfig,
} from "@specpin/spec-schema";

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
/** Per-request timeout. A black-holed remote (no RST, no response) must not hang
 *  reload()'s Promise.allSettled forever; this bounds every request. */
const REQUEST_TIMEOUT_MS = 10_000;

export class SidecarClient {
  private readonly baseUrl: string;
  private token: string;
  private readonly fetchImpl: typeof fetch;
  /** Last ETag seen on GET /specs. Echoed back as If-Match on spec writes so a
   *  stale write (a teammate changed the bundle since this client last read it)
   *  gets a 409 instead of silently clobbering the newer state. */
  private lastSpecsEtag: string | undefined;

  constructor(options: SidecarClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Update the bearer token after a sidecar restart rotated it. */
  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { ifMatch?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    if (opts?.ifMatch && this.lastSpecsEtag) headers["If-Match"] = this.lastSpecsEtag;
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      // AbortSignal.timeout aborts with a TimeoutError DOMException; distinguish
      // it from a generic network failure so the UI can say "timed out".
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      throw new SidecarError(
        0,
        timedOut ? "timeout" : "network_error",
        [String(cause)],
        timedOut ? "sidecar timed out" : "sidecar unreachable",
      );
    }

    // Capture the bundle ETag from GET /specs for the next write. Guarded on the
    // path so a future ETag on another endpoint (e.g. /views) can't overwrite the
    // specs tag and make a spec write send a mismatched If-Match.
    if (path === "/specs") {
      const etag = res.headers.get("ETag");
      if (etag) this.lastSpecsEtag = etag;
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

  /** The status-flow FSM config from .specs/flows.json. The sidecar returns the
   *  empty default ({ version, flows: [] }) when the file is absent. */
  getFlows(): Promise<FlowsConfig> {
    return this.request<FlowsConfig>("GET", "/flows");
  }

  /** Write the status-flow FSM config (validated server-side). */
  async putFlows(config: FlowsConfig): Promise<void> {
    await this.request("PUT", "/flows", config);
  }

  /** The screen-transition config from .specs/screens.json. The sidecar returns
   *  the empty default ({ version, screens: [], transitions: [] }) when absent. */
  getScreens(): Promise<ScreensConfig> {
    return this.request<ScreensConfig>("GET", "/screens");
  }

  /** Write the screen-transition config (validated server-side). */
  async putScreens(config: ScreensConfig): Promise<void> {
    await this.request("PUT", "/screens", config);
  }

  /** List the screenIds of every stored shot artifact (.specs/shots/*.shot.json).
   *  The sidecar returns { screenIds: [] } when no shots exist yet. */
  async listShots(): Promise<string[]> {
    const res = await this.request<{ screenIds: string[] }>("GET", "/shots");
    return res?.screenIds ?? [];
  }

  /** Read one shot artifact by screenId. Rejects with a 404 SidecarError when absent. */
  getShot(screenId: string): Promise<ShotConfig> {
    return this.request<ShotConfig>("GET", `/shots/${encodeURIComponent(screenId)}`);
  }

  /** Write one shot artifact (validated server-side). The storage key is the
   *  shot's own screenId, so the URL and body screenId always agree. Shots are
   *  independent files, so no If-Match/ETag applies. */
  async putShot(shot: ShotConfig): Promise<void> {
    await this.request("PUT", `/shots/${encodeURIComponent(shot.screenId)}`, shot);
  }

  /** Delete one shot artifact by screenId. */
  async deleteShot(screenId: string): Promise<void> {
    await this.request("DELETE", `/shots/${encodeURIComponent(screenId)}`);
  }

  async saveSpec(file: string, spec: Spec): Promise<void> {
    await this.request("POST", "/specs", { file, spec }, { ifMatch: true });
  }

  async updateSpec(id: string, spec: Spec): Promise<void> {
    await this.request("PUT", `/specs/${encodeURIComponent(id)}`, spec, { ifMatch: true });
  }

  async deleteSpec(id: string): Promise<void> {
    await this.request("DELETE", `/specs/${encodeURIComponent(id)}`, undefined, { ifMatch: true });
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
