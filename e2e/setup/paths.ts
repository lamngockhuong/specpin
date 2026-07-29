import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `e2e/` itself. Every other path is derived from it, so a moved harness needs
 *  exactly one edit. */
export const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** The monorepo root (`e2e/` sits directly under it). */
export const REPO_ROOT = dirname(E2E_DIR);

export const EXTENSION_DIR = resolve(REPO_ROOT, "apps/extension");
/** The built Chrome MV3 extension Playwright loads with `--load-extension`. */
export const EXTENSION_OUTPUT = resolve(EXTENSION_DIR, ".output/chrome-mv3");

export const CLI_DIR = resolve(REPO_ROOT, "apps/cli");
/** The sidecar binary the harness builds and spawns.
 *
 *  `.exe` on Windows: the Makefile pins `-o bin/specpin` with no extension, but
 *  Node's `spawn` resolves an extension-less path through `PATHEXT` and so reports
 *  ENOENT for a real file. The harness therefore builds its own suffixed binary
 *  rather than reusing the Makefile's name. Both are covered by the
 *  `/apps/cli/bin/` gitignore entry. */
export const SIDECAR_BIN = resolve(
  CLI_DIR,
  process.platform === "win32" ? "bin/specpin.exe" : "bin/specpin",
);

/** Canonical JSON Schema (the SSOT) and the copy the sidecar embeds. The harness
 *  compares them instead of syncing: a build that silently rewrote a tracked file
 *  would break the zero-repo-mutation guarantee. */
export const SCHEMA_SRC = resolve(REPO_ROOT, "packages/spec-schema/schema/v1.json");
export const SCHEMA_EMBEDDED = resolve(CLI_DIR, "internal/schema/v1.json");

export const DEMO_APP_DIR = resolve(REPO_ROOT, "examples/demo-react-app");
/** `vite preview` serves this, so it must exist before the demo-app fixture starts. */
export const DEMO_APP_DIST = resolve(DEMO_APP_DIR, "dist");
/** The seeded spec corpus every sidecar fixture copies to a temp dir. */
export const DEMO_SPECS_DIR = resolve(DEMO_APP_DIR, ".specs");

/** Test-only bearer token, pinned so the harness never parses it out of stdout
 *  (the classic E2E flake source). Scoped to `e2e/` — it must never appear in
 *  `apps/` source, docs, or any shipped artifact. */
export const E2E_TOKEN = "e2e-token";

/** Second test token, for the multi-sidecar scenarios. Deliberately different
 *  from `E2E_TOKEN` so a cross-project auth leak fails loudly instead of
 *  accidentally passing. */
export const E2E_TOKEN_B = "e2e-token-b";
