// write-canonical.ts — TS mirror of apps/cli/internal/store/store.go's
// Canonicalize + WriteCanonical + atomicWrite: 2-space pretty-print, a
// trailing newline, atomic temp-file + rename, confined to .specs/ under the
// repo root (reusing the A1 traversal + symlink guard).
//
// Unlike the Go sidecar — which re-indents arbitrary raw bytes received over
// HTTP from an untrusted client — every caller here already holds a typed
// config object assembled by merge.ts, so canonicalization is just a
// deterministic JSON.stringify: the object's own key insertion order IS the
// canonical key order (merge.ts is responsible for constructing that order
// consistently across runs so re-serialization is idempotent).

import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveWithinRoot } from "./resolve-config-paths.js";

/** Pretty-prints `config` at 2-space indent with exactly one trailing
 * newline. Pure and idempotent: canonicalizing an already-canonical value
 * (parse -> canonicalize) reproduces the same string. */
export function canonicalize(config: unknown): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export type WriteCanonicalResult = { ok: true; path: string } | { ok: false; error: string };

/** Writes `config` to `fileName` inside `specsDir`, canonicalized, and
 * atomically (temp file in the same directory, then rename). Confined to
 * `specsDir` by the same traversal guard `resolveConfigPaths` uses for
 * source files, and rejects writing through a symlink — the write-path
 * counterpart of the Go sidecar's `resolve` guard. */
export async function writeCanonical(
  specsDir: string,
  fileName: string,
  config: unknown,
): Promise<WriteCanonicalResult> {
  const resolved = resolveWithinRoot(specsDir, fileName);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const full = resolved.absPath;

  try {
    const stat = await fs.lstat(full);
    if (stat.isSymbolicLink()) {
      return { ok: false, error: `refusing to write through a symlink: ${fileName}` };
    }
  } catch {
    // ENOENT (file does not exist yet) is the expected common case.
  }

  const dir = path.dirname(full);
  await fs.mkdir(dir, { recursive: true });
  const data = canonicalize(config);
  const tmpPath = path.join(
    dir,
    `.specpin-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
  );
  await fs.writeFile(tmpPath, data, "utf8");
  try {
    await fs.rename(tmpPath, full);
  } catch (e) {
    await fs.rm(tmpPath, { force: true });
    throw e;
  }
  return { ok: true, path: full };
}
