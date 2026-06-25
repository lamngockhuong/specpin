import { defineConfig } from "vitest/config";

// Root Vitest config. Each TS package owns its own vitest.config.ts; this file
// aggregates them so `vitest run` at the repo root exercises the whole workspace.
// Per-package runs go through `turbo run test` (each package script: `vitest run`).
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/extension"],
  },
});
