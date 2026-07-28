import { E2E_TOKEN, SIDECAR_BIN } from "../setup/paths.js";
import { spawnManaged, waitUntilReady } from "./managed-process.js";
import { type CorpusOptions, createSpecsCorpus } from "./specs-corpus.js";

/** A running sidecar plus the throwaway corpus it serves. */
export interface Sidecar {
  baseUrl: string;
  token: string;
  /** The temp `.specs/` this sidecar serves. Write-path tests assert against it. */
  specsDir: string;
  project: string;
  /** The `host:port` values in the served manifest. */
  domains: string[];
  /** Authenticated fetch against this sidecar, for probes that bypass the extension.
   *  Deliberately raw HTTP rather than `SidecarClient`: some scenarios must be able to
   *  send a request with no token at all, which a client that injects one cannot do. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  stop(): Promise<void>;
}

export interface SidecarOptions extends CorpusOptions {
  /** Port to pin. Never auto-picked: the harness must know the URL before the
   *  process starts so it can seed the connection without parsing stdout. */
  port: number;
  /** Bearer token to pin. Defaults to the shared test token; the multi-project
   *  scenarios pass a distinct one so a cross-project auth leak fails loudly. */
  token?: string;
}

/** Spawn a sidecar over a fresh temp corpus and wait until `/health` answers 200.
 *
 *  `--token` is pinned (`serve.go` supports it) rather than scraped from stdout:
 *  parsing a token out of a log line is the classic E2E flake, and it is avoidable
 *  here. The bind address is left at its `127.0.0.1` default — never pass `--host`. */
export async function startSidecar(options: SidecarOptions): Promise<Sidecar> {
  const token = options.token ?? E2E_TOKEN;
  const corpus = await createSpecsCorpus(options);
  const baseUrl = `http://127.0.0.1:${options.port}`;

  const managed = spawnManaged(
    SIDECAR_BIN,
    ["serve", "--dir", corpus.dir, "--port", String(options.port), "--token", token],
    {},
  );

  const authFetch = (path: string, init?: RequestInit) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });

  const stop = async (): Promise<void> => {
    await managed.stop(`sidecar on port ${options.port}`);
    // Only after the process is gone: Windows refuses to remove a directory a live
    // process still holds open.
    await corpus.cleanup();
  };

  try {
    // `/health` sits behind the auth middleware, so the probe carries the token.
    // A no-Origin request is allowed by the CORS policy, so plain fetch is fine.
    //
    // Readiness requires the reported project to be THIS corpus's. A 200 alone is not
    // enough: tests in a worker share the sidecar port, so the previous test's
    // process — still shutting down, still bound, now serving a deleted temp dir —
    // will happily answer the first probe. Accepting that 200 hands the extension a
    // dead corpus and blames it on the extension.
    await waitUntilReady(
      managed,
      async () => {
        const response = await authFetch("/health");
        if (response.status !== 200) return false;
        const health = (await response.json()) as { project?: string };
        return health.project === corpus.project;
      },
      { subject: `sidecar serving "${corpus.project}" on port ${options.port}` },
    );
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    baseUrl,
    token,
    specsDir: corpus.dir,
    project: corpus.project,
    domains: corpus.domains,
    fetch: authFetch,
    stop,
  };
}
