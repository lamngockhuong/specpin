import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "spec-schema",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
