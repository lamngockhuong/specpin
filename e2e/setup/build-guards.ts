import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  CLI_DIR,
  DEMO_APP_DIR,
  DEMO_APP_DIST,
  EXTENSION_DIR,
  EXTENSION_OUTPUT,
  SIDECAR_BIN,
} from "./paths.js";

/** Whether a build artifact is older than its sources, plus the reason — logged by
 *  `global-setup` so a dev can always see why a run rebuilt (or why it did not). */
export interface StaleCheck {
  stale: boolean;
  reason: string;
}

/** Never worth walking anywhere: build output, deps, caches. Skipping them keeps a
 *  guard well under a second on a warm checkout. */
const ALWAYS_SKIP = [
  "node_modules",
  ".output",
  ".wxt",
  ".turbo",
  "dist",
  "bin",
  "coverage",
  ".git",
];

interface SourceSet {
  root: string;
  /** Directory names to skip in addition to `ALWAYS_SKIP` — inputs that cannot
   *  change the artifact, so touching them must not force a rebuild. */
  skipDirs?: string[];
  /** Which files count as inputs. Default: every file under `root`. */
  matches?: (path: string) => boolean;
}

/** Newest mtime (epoch ms) among a source set's files. A missing root contributes
 *  nothing rather than throwing, so an optional input dir is safe to list. */
async function newestMtime(root: string, set: SourceSet): Promise<number> {
  const skip = new Set([...ALWAYS_SKIP, ...(set.skipDirs ?? [])]);
  const matches = set.matches ?? (() => true);
  let newest = 0;
  // A missing dir yields null rather than throwing, so an optional input root is
  // safe to list. Inferred, not annotated: `readdir`'s overloads make the explicit
  // type resolve to the Buffer variant.
  const entries = await readdir(root, { withFileTypes: true }).catch(() => null);
  if (!entries) return 0;
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      const nested = await newestMtime(path, set);
      if (nested > newest) newest = nested;
      continue;
    }
    if (!entry.isFile() || !matches(path)) continue;
    const info = await stat(path);
    if (info.mtimeMs > newest) newest = info.mtimeMs;
  }
  return newest;
}

/** mtime of a single artifact, or 0 when it does not exist (= definitively stale). */
async function artifactMtime(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

/** Compare a built artifact against its source set. */
async function compare(label: string, artifact: string, set: SourceSet): Promise<StaleCheck> {
  const built = await artifactMtime(artifact);
  if (built === 0) return { stale: true, reason: `${label}: no build output yet` };
  const newest = await newestMtime(set.root, set);
  if (newest > built) return { stale: true, reason: `${label}: sources changed since last build` };
  return { stale: false, reason: `${label}: up to date` };
}

/** The built MV3 extension vs its sources. `manifest.json` is the artifact probe:
 *  its absence is the clearest "never built" signal. `test/` and `designs/` are
 *  skipped — neither reaches the bundle, and editing a unit test all day should not
 *  force a rebuild on every E2E run. */
export function extensionStale(): Promise<StaleCheck> {
  return compare("extension", join(EXTENSION_OUTPUT, "manifest.json"), {
    root: EXTENSION_DIR,
    skipDirs: ["test", "designs"],
  });
}

/** `bin/specpin` vs the Go sources. `skill/` and `npm/` are excluded for the same
 *  reason CI's `go` path filter excludes them: neither contributes to the binary. */
export function sidecarStale(): Promise<StaleCheck> {
  const isGoInput = (path: string) =>
    extname(path) === ".go" ||
    path.endsWith("go.mod") ||
    path.endsWith("go.sum") ||
    // The embedded schema is compiled in via go:embed, so a synced schema
    // legitimately invalidates the binary.
    path.endsWith(".json");
  return compare("sidecar", SIDECAR_BIN, {
    root: CLI_DIR,
    skipDirs: ["skill", "npm", "testdata"],
    matches: isGoInput,
  });
}

/** The demo app's `dist/` vs its sources. `vite preview` serves `dist/`, so an
 *  unbuilt demo app is as fatal to the harness as an unbuilt extension. `.specs/`
 *  is skipped: it is the spec corpus the sidecar serves, not a build input. */
export function demoAppStale(): Promise<StaleCheck> {
  return compare("demo-app", join(DEMO_APP_DIST, "index.html"), {
    root: DEMO_APP_DIR,
    skipDirs: [".specs"],
  });
}
