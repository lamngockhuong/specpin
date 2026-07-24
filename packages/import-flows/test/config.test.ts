import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatErrors, validateFlows } from "@specpin/spec-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadImportConfig } from "../src/config.js";
import { validateImportConfig } from "../src/validate-import-config.js";

describe("@specpin/spec-schema interop (proves the workspace dep resolves from Node)", () => {
  it("validates a minimal FlowsConfig", () => {
    const result = validateFlows({ version: "1", flows: [] });
    expect(result.valid).toBe(true);
  });

  it("formatErrors renders a validation failure", () => {
    const result = validateFlows({ version: "1" });
    expect(result.valid).toBe(false);
    expect(formatErrors(result.errors)).toContain("flows");
  });
});

describe("validateImportConfig (pure structural guard)", () => {
  const validConfig = {
    flows: [
      {
        file: "src/order/fsm.ts",
        export: "ORDER_STATUS_TRANSITIONS",
        adapter: "fsm-table",
        id: "order-status",
      },
    ],
    screens: [{ file: "src/routes.tsx", adapter: "react-router" }],
  };

  it("accepts a valid config", () => {
    const result = validateImportConfig(validConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.flows).toHaveLength(1);
      expect(result.config.screens).toHaveLength(1);
    }
  });

  it("accepts a config with empty flows/screens", () => {
    const result = validateImportConfig({ flows: [], screens: [] });
    expect(result.ok).toBe(true);
  });

  it("rejects a flow entry missing a required field", () => {
    const result = validateImportConfig({
      flows: [{ file: "src/order/fsm.ts", adapter: "fsm-table", id: "order-status" }],
      screens: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("flows[0].export");
    }
  });

  it("rejects an unknown adapter", () => {
    const result = validateImportConfig({
      flows: [
        { file: "src/order/fsm.ts", export: "X", adapter: "bogus-adapter", id: "order-status" },
      ],
      screens: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("flows[0].adapter");
    }
  });

  it("rejects prototype-pollution keys parsed from JSON", () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "flows": [], "screens": []}');
    const result = validateImportConfig(parsed);
    expect(result.ok).toBe(false);
  });
});

describe("loadImportConfig (fs + validate + resolve)", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "import-flows-test-"));
    await mkdir(path.join(repoRoot, ".specs"), { recursive: true });
    await mkdir(path.join(repoRoot, "src"), { recursive: true });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  async function writeConfig(config: unknown): Promise<void> {
    await writeFile(
      path.join(repoRoot, ".specs", "import.config.json"),
      JSON.stringify(config, null, 2),
    );
  }

  it("loads and resolves a valid config to absolute paths", async () => {
    await writeConfig({
      flows: [
        { file: "src/fsm.ts", export: "TRANSITIONS", adapter: "fsm-table", id: "order-status" },
      ],
      screens: [{ file: "src/routes.tsx", adapter: "react-router" }],
    });

    const result = await loadImportConfig(repoRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.flows[0]?.file).toBe(path.resolve(repoRoot, "src/fsm.ts"));
      expect(result.config.screens[0]?.file).toBe(path.resolve(repoRoot, "src/routes.tsx"));
    }
  });

  it("reports a missing config file gracefully (no throw)", async () => {
    const result = await loadImportConfig(repoRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("not found");
    }
  });

  it("rejects a traversal path with forward slashes", async () => {
    await writeConfig({
      flows: [{ file: "../../outside.ts", export: "X", adapter: "fsm-table", id: "x" }],
      screens: [],
    });

    const result = await loadImportConfig(repoRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("escapes the repo root");
    }
  });

  it("rejects a traversal path with backslashes (Windows-style)", async () => {
    await writeConfig({
      flows: [],
      screens: [{ file: "..\\..\\outside.tsx", adapter: "react-router" }],
    });

    const result = await loadImportConfig(repoRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("escapes the repo root");
    }
  });

  it("reports invalid JSON gracefully (no throw)", async () => {
    await writeFile(path.join(repoRoot, ".specs", "import.config.json"), "{ not json");
    const result = await loadImportConfig(repoRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("Invalid JSON");
    }
  });
});
