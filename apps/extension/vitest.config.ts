import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing";

export default defineConfig({
  // WxtVitest resolves `#imports` and provides the in-memory `fakeBrowser`, so
  // tests can exercise the storage layer (config.ts, storage.sync) without a
  // real browser. Tests that need it reset state via `fakeBrowser.reset()`.
  plugins: [WxtVitest()],
  test: {
    name: "extension",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
