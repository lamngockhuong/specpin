import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "fingerprint-core",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The crown-jewel matcher + capture carry the highest coverage bar.
      thresholds: {
        "src/match.ts": { lines: 90, functions: 90 },
        "src/capture.ts": { lines: 90, functions: 90 },
      },
    },
  },
});
