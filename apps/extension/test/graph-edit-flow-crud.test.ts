import type { FlowsConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import {
  createEmptyFlow,
  createFlowInConfig,
  deleteFlowInConfig,
  renameFlowInConfig,
} from "../src/graph/graph-edit-flow-crud.js";

function baseConfig(): FlowsConfig {
  return {
    version: "1.0",
    flows: [
      {
        id: "application-status",
        object: { en: "Application" },
        states: [{ id: "draft", label: { en: "Draft" }, kind: "initial" }],
        transitions: [],
      },
    ],
  };
}

describe("createEmptyFlow", () => {
  it("builds an empty Flow: id, object, empty states/transitions", () => {
    expect(createEmptyFlow("order-status", { en: "Order" })).toEqual({
      id: "order-status",
      object: { en: "Order" },
      states: [],
      transitions: [],
    });
  });
});

describe("createFlowInConfig", () => {
  it("appends a brand-new flow and validates the result", () => {
    const result = createFlowInConfig(
      baseConfig(),
      createEmptyFlow("order-status", { en: "Order" }),
    );
    expect(result.ok).toBe(true);
    expect(result.config?.flows.map((f) => f.id)).toEqual(["application-status", "order-status"]);
  });

  it("refuses when the id already names a flow", () => {
    const config = baseConfig();
    const result = createFlowInConfig(config, createEmptyFlow("application-status", { en: "X" }));
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/already exists/);
  });

  it("composes from a genuinely empty FlowsConfig (the create-from-scratch case)", () => {
    const empty: FlowsConfig = { version: "1.0", flows: [] };
    const result = createFlowInConfig(empty, createEmptyFlow("application-status", { en: "App" }));
    expect(result.ok).toBe(true);
    expect(result.config?.flows).toHaveLength(1);
  });
});

describe("renameFlowInConfig", () => {
  it("replaces the flow's object, leaving states/transitions untouched", () => {
    const result = renameFlowInConfig(baseConfig(), "application-status", { en: "Applications" });
    expect(result.ok).toBe(true);
    const flow = result.config?.flows.find((f) => f.id === "application-status");
    expect(flow?.object).toEqual({ en: "Applications" });
    expect(flow?.states).toHaveLength(1);
  });

  it("refuses an unknown flow id", () => {
    const result = renameFlowInConfig(baseConfig(), "no-such-flow", { en: "X" });
    expect(result.ok).toBe(false);
  });
});

describe("deleteFlowInConfig", () => {
  it("removes the flow by id", () => {
    const result = deleteFlowInConfig(baseConfig(), "application-status");
    expect(result.ok).toBe(true);
    expect(result.config?.flows).toEqual([]);
  });

  it("leaves a valid, empty config when deleting the last flow", () => {
    const result = deleteFlowInConfig(baseConfig(), "application-status");
    expect(result.ok).toBe(true);
    expect(result.config).toEqual({ version: "1.0", flows: [] });
  });

  it("refuses an unknown flow id", () => {
    const result = deleteFlowInConfig(baseConfig(), "no-such-flow");
    expect(result.ok).toBe(false);
  });
});
