import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Manifest } from "@specpin/spec-schema";
import { DEMO_SPECS_DIR } from "../setup/paths.js";

/** A throwaway `.specs/` the sidecar serves and the write-path tests mutate. */
export interface SpecsCorpus {
  /** Absolute path to the temp copy. Always under `os.tmpdir()`. */
  dir: string;
  /** `manifest.project`, after any rewrite. */
  project: string;
  /** The `host:port` values written into `manifest.domains`. */
  domains: string[];
  /** Remove the temp copy. Safe to call twice. */
  cleanup(): Promise<void>;
}

export interface CorpusOptions {
  /** The demo app's port for this worker. `manifest.domains` is rewritten to it,
   *  because the committed corpus pins 3000/3001 and a per-worker preview server
   *  runs somewhere else entirely — without this, every spec matches nothing. */
  demoPort: number;
  /** Override `manifest.project`, so a second corpus is a distinct project rather
   *  than a duplicate of the first (the multi-project scenarios need this). */
  project?: string;
}

/** Assert a path really is under the OS temp dir. Called before any test writes:
 *  a fixture bug must never be able to mutate the committed corpus. */
export function assertTempPath(path: string): void {
  const root = tmpdir();
  if (!path.startsWith(root)) {
    throw new Error(`refusing to use ${path} as a writable corpus: not under ${root}`);
  }
}

/** Copy the demo corpus to a fresh temp dir and point its `domains` at this
 *  worker's demo-app port. The copy is what makes capture/edit tests safe to run:
 *  they write real files, and the repo corpus must stay untouched. */
export async function createSpecsCorpus(options: CorpusOptions): Promise<SpecsCorpus> {
  const dir = await mkdtemp(join(tmpdir(), "specpin-e2e-specs-"));
  assertTempPath(dir);
  await cp(DEMO_SPECS_DIR, dir, { recursive: true });

  const manifestPath = join(dir, "manifest.json");
  // Typed as the canonical `Manifest`, so a schema change that adds or renames a
  // field surfaces here rather than being silently dropped by a narrow inline cast.
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;

  const domains = [`127.0.0.1:${options.demoPort}`, `localhost:${options.demoPort}`];
  manifest.domains = domains;
  // Stamp a project name unique to this corpus. Tests in one worker reuse the same
  // sidecar port, so a readiness probe can otherwise be answered by the PREVIOUS
  // test's sidecar — which is still holding the port while serving a temp dir that
  // has already been deleted. `startSidecar` requires /health to report this exact
  // name, which turns that race into an immediate, legible failure instead of a
  // downstream "connection failed" from the extension.
  manifest.project = options.project ?? `${manifest.project} ${basename(dir)}`;
  // Pretty-printed with a trailing newline, matching how the sidecar writes files
  // — so a test that diffs a file it did not touch sees no incidental change.
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    dir,
    project: manifest.project,
    domains,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
