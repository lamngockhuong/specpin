import { validateFlows, validateScreens } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import type { ImportConfig } from "../src/config-types.js";
import { mapConfig } from "../src/map-config.js";

const FSM_SOURCE = `
  export const T = [
    { from: "draft", to: "pending", trigger: "Submit" },
    { from: "pending", to: "approved", trigger: "Approve" },
  ];
`;

const ROUTES_SOURCE = `
  export function App() {
    return (
      <Routes>
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
      </Routes>
    );
  }
`;

describe("mapConfig", () => {
  it("assembles a FlowsConfig + ScreensConfig from adapter output", () => {
    const config: ImportConfig = {
      flows: [{ file: "/repo/src/fsm.ts", export: "T", adapter: "fsm-table", id: "order-status" }],
      screens: [{ file: "/repo/src/App.tsx", adapter: "react-router" }],
    };
    const fileTexts = new Map([
      ["/repo/src/fsm.ts", FSM_SOURCE],
      ["/repo/src/App.tsx", ROUTES_SOURCE],
    ]);

    const result = mapConfig(config, fileTexts);

    expect(result.warnings).toEqual([]);
    expect(result.flowsConfig).toMatchObject({ version: "1.0" });
    expect(result.flowsConfig.flows).toHaveLength(1);
    expect(result.flowsConfig.flows[0]).toMatchObject({
      id: "order-status",
      object: { en: "order-status" },
    });
    expect(result.flowsConfig.flows[0]?.states.map((s) => s.id)).toEqual([
      "draft",
      "pending",
      "approved",
    ]);

    expect(result.screensConfig.screens.map((s) => s.id)).toEqual(["customers", "customers-id"]);
    expect(result.screensConfig.transitions).toEqual([]);

    expect(validateFlows(result.flowsConfig).valid).toBe(true);
    expect(validateScreens(result.screensConfig).valid).toBe(true);
  });

  it("merges the same id + urlGlob from two entries silently (no warning)", () => {
    const config: ImportConfig = {
      flows: [],
      screens: [
        { file: "/repo/a.tsx", adapter: "react-router" },
        { file: "/repo/b.tsx", adapter: "react-router" },
      ],
    };
    const fileTexts = new Map([
      ["/repo/a.tsx", `export default [{ path: "/customers" }];`],
      ["/repo/b.tsx", `export default [{ path: "/customers" }, { path: "/settings" }];`],
    ]);
    const result = mapConfig(config, fileTexts);
    expect(result.screensConfig.screens.map((s) => s.id)).toEqual(["customers", "settings"]);
    expect(result.warnings).toEqual([]);
  });

  it("warns (last write wins) when the same screen id is produced with a different urlGlob", () => {
    // "/customers-id" and "/customers/id" both slugify to "customers-id" but
    // keep different literal urlGlobs — a genuine cross-entry collision.
    const config: ImportConfig = {
      flows: [],
      screens: [
        { file: "/repo/a.tsx", adapter: "react-router" },
        { file: "/repo/b.tsx", adapter: "react-router" },
      ],
    };
    const fileTexts = new Map([
      ["/repo/a.tsx", `export default [{ path: "/customers-id" }];`],
      ["/repo/b.tsx", `export default [{ path: "/customers/id" }];`],
    ]);
    const result = mapConfig(config, fileTexts);
    expect(result.screensConfig.screens).toHaveLength(1);
    expect(result.screensConfig.screens[0]).toMatchObject({
      id: "customers-id",
      urlGlob: "/customers/id",
    });
    expect(result.warnings.some((w) => w.includes("conflicting urlGlob"))).toBe(true);
  });

  it("warns and skips a flow entry whose adapter is not a flow adapter", () => {
    const config: ImportConfig = {
      flows: [{ file: "/repo/routes.tsx", export: "X", adapter: "react-router", id: "bad" }],
      screens: [],
    };
    const fileTexts = new Map([["/repo/routes.tsx", ROUTES_SOURCE]]);
    const result = mapConfig(config, fileTexts);
    expect(result.flowsConfig.flows[0]).toMatchObject({ id: "bad", states: [], transitions: [] });
    expect(result.warnings.some((w) => w.includes("is not a flow adapter"))).toBe(true);
  });

  it("warns and skips a screens entry whose adapter is not a screens adapter", () => {
    const config: ImportConfig = {
      flows: [],
      screens: [{ file: "/repo/fsm.ts", export: "T", adapter: "fsm-table" }],
    };
    const fileTexts = new Map([["/repo/fsm.ts", FSM_SOURCE]]);
    const result = mapConfig(config, fileTexts);
    expect(result.screensConfig.screens).toEqual([]);
    expect(result.warnings.some((w) => w.includes("is not a screens adapter"))).toBe(true);
  });

  it("warns when no source text was supplied for a referenced file", () => {
    const config: ImportConfig = {
      flows: [{ file: "/repo/missing.ts", export: "T", adapter: "fsm-table", id: "x" }],
      screens: [],
    };
    const result = mapConfig(config, new Map());
    expect(result.flowsConfig.flows[0]).toMatchObject({ id: "x", states: [], transitions: [] });
    expect(result.warnings.some((w) => w.includes("no source text supplied"))).toBe(true);
  });

  it("is deterministic: re-running on identical input yields byte-identical output", () => {
    const config: ImportConfig = {
      flows: [{ file: "/repo/src/fsm.ts", export: "T", adapter: "fsm-table", id: "order-status" }],
      screens: [{ file: "/repo/src/App.tsx", adapter: "react-router" }],
    };
    const fileTexts = new Map([
      ["/repo/src/fsm.ts", FSM_SOURCE],
      ["/repo/src/App.tsx", ROUTES_SOURCE],
    ]);
    const first = mapConfig(config, fileTexts);
    const second = mapConfig(config, fileTexts);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
