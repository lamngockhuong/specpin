import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extension",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
