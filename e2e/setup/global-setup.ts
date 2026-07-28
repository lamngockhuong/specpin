import { readFile } from "node:fs/promises";
import { demoAppStale, extensionStale, sidecarStale } from "./build-guards.js";
import { CLI_DIR, REPO_ROOT, SCHEMA_EMBEDDED, SCHEMA_SRC, SIDECAR_BIN } from "./paths.js";
import { runCommand } from "./run-command.js";

/** `make build` runs `sync-schema` first, which COPIES the canonical schema over
 *  the embedded one. The harness must never write a tracked file (zero repo
 *  mutation), so it verifies instead and hands a drift back to the developer —
 *  which also keeps `make check-schema`'s drift gate the single authority. */
async function assertSchemaInSync(): Promise<void> {
  const [canonical, embedded] = await Promise.all([
    readFile(SCHEMA_SRC, "utf8"),
    readFile(SCHEMA_EMBEDDED, "utf8"),
  ]);
  if (canonical === embedded) return;
  throw new Error(
    "embedded sidecar schema has drifted from packages/spec-schema/schema/v1.json.\n" +
      "Run `make sync-schema` in apps/cli and rebuild; the E2E harness will not " +
      "modify a tracked file to paper over the drift.",
  );
}

/** `go build` rather than `make build`: identical output (the Makefile's only extra
 *  step is the sync we assert above instead), minus a hard dependency on `make`,
 *  which is absent from a default Windows dev machine. */
async function buildSidecar(): Promise<void> {
  await assertSchemaInSync();
  await runCommand("go", ["build", "-o", SIDECAR_BIN, "."], {
    cwd: CLI_DIR,
    env: { CGO_ENABLED: "0" },
  });
}

function buildExtension(): Promise<void> {
  return runCommand("pnpm", ["--filter", "@specpin/extension", "build"], { cwd: REPO_ROOT });
}

/** `vite preview` serves `dist/`, so the demo app is a build input to the harness
 *  exactly like the extension and the sidecar. */
function buildDemoApp(): Promise<void> {
  return runCommand("pnpm", ["--filter", "@specpin/demo-react-app", "build"], { cwd: REPO_ROOT });
}

/** Build only what is stale, and say which of the three ran — so a dev looking at a
 *  slow run can see the cause instead of guessing. */
export default async function globalSetup(): Promise<void> {
  const checks = await Promise.all([extensionStale(), sidecarStale(), demoAppStale()]);
  const [extension, sidecar, demoApp] = checks;

  for (const check of checks) {
    console.log(`[e2e setup] ${check.reason}`);
  }

  const builds: Array<Promise<void>> = [];
  if (extension?.stale) builds.push(buildExtension());
  if (sidecar?.stale) builds.push(buildSidecar());
  if (demoApp?.stale) builds.push(buildDemoApp());

  if (builds.length === 0) {
    console.log("[e2e setup] all artifacts warm, nothing to build");
    return;
  }

  const started = Date.now();
  // Independent toolchains (WXT, Go, Vite) — run them concurrently so a cold
  // checkout pays the slowest build, not their sum.
  await Promise.all(builds);
  console.log(`[e2e setup] built ${builds.length} artifact(s) in ${Date.now() - started}ms`);
}
