// Resolves every `file` in a validated ImportConfig to an absolute path
// under the repo root, rejecting traversal that would escape it. Kept
// separate from validation so path resolution (which needs `repoRoot`) and
// structural validation (pure, no context) stay independently testable.

import path from "node:path";
import type { ImportConfig } from "./config-types.js";

/** Resolve `relFile` under `repoRoot`, rejecting absolute paths and any
 * traversal that escapes the root. Handles both `/` and `\` separators on
 * EVERY OS: a committed `import.config.json` may be authored on Windows with
 * `..\..` separators, but on POSIX Node's `path` treats `\` as an ordinary
 * filename char and would miss the traversal. Normalizing backslashes to `/`
 * up front makes the escape guard OS-independent (defense in depth). */
export function resolveWithinRoot(
  repoRoot: string,
  relFile: string,
): { ok: true; absPath: string } | { ok: false; error: string } {
  const normalized = relFile.replace(/\\/g, "/");
  if (path.isAbsolute(normalized)) {
    return { ok: false, error: `path must be relative to the repo root: "${relFile}"` };
  }
  const absRoot = path.resolve(repoRoot);
  const absPath = path.resolve(absRoot, normalized);
  const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
  if (absPath !== absRoot && !absPath.startsWith(rootWithSep)) {
    return { ok: false, error: `path escapes the repo root: "${relFile}"` };
  }
  return { ok: true, absPath };
}

/** Resolve every `file` in a validated config to an absolute path under
 * `repoRoot`. Returns errors (not a throw) for any path that escapes the
 * root — traversal is a user-input error, not exceptional. */
export function resolveConfigPaths(
  repoRoot: string,
  config: ImportConfig,
): { ok: true; config: ImportConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const flows = config.flows.map((entry, i) => {
    const resolved = resolveWithinRoot(repoRoot, entry.file);
    if (!resolved.ok) {
      errors.push(`flows[${i}].${resolved.error}`);
      return entry;
    }
    return { ...entry, file: resolved.absPath };
  });

  const screens = config.screens.map((entry, i) => {
    const resolved = resolveWithinRoot(repoRoot, entry.file);
    if (!resolved.ok) {
      errors.push(`screens[${i}].${resolved.error}`);
      return entry;
    }
    return { ...entry, file: resolved.absPath };
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { ...config, flows, screens } };
}
