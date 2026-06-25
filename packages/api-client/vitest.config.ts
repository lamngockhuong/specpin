import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-client",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
