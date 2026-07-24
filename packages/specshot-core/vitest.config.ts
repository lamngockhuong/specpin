import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "specshot-core",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
