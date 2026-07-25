import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { mergeScreensConfig, mergeScreensDraft } from "../src/graph/graph-write-back.js";
import { mergeFlowsConfig } from "../src/graph/graph-write-back-flows.js";

function baseConfig(): ScreensConfig {
  return {
    version: "1.0",
    screens: [{ id: "home", name: { en: "Home" }, urlGlob: "/" }],
    transitions: [
      {
        id: "manual-1",
        from: "home",
        to: "checkout",
        trigger: { en: "Buy" },
        source: "manual",
      },
    ],
  };
}

describe("mergeScreensConfig", () => {
  it("appends a new screen and a new transition, stamped with the given source", () => {
    const config = baseConfig();
    const result = mergeScreensConfig({
      config,
      screens: [{ id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" }],
      transitions: [{ id: "cap-1", from: "home", to: "checkout", trigger: { en: "navigation" } }],
      source: "auto-captured",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.screens.map((s) => s.id)).toEqual(["home", "checkout"]);
    const added = result.config?.transitions.find((t) => t.id === "cap-1");
    expect(added?.source).toBe("auto-captured");
  });

  it("never mutates the input config", () => {
    const config = baseConfig();
    const snapshot = JSON.parse(JSON.stringify(config));
    mergeScreensConfig({
      config,
      screens: [{ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" }],
      transitions: [{ id: "cap-1", from: "home", to: "cart", trigger: { en: "navigation" } }],
      source: "auto-captured",
    });
    expect(config).toEqual(snapshot);
  });

  it("skips a candidate screen whose id already exists (never overwrites an existing node)", () => {
    const config = baseConfig();
    const result = mergeScreensConfig({
      config,
      screens: [{ id: "home", name: { en: "Renamed by capture" }, urlGlob: "/" }],
      source: "auto-captured",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.screens).toHaveLength(1);
    expect(result.config?.screens[0]?.name).toEqual({ en: "Home" });
  });

  it("skips a candidate screen whose urlGlob already names a DIFFERENTLY-id'd committed screen, and remaps its edge endpoints to the existing node (no dangling edge, no duplicate node)", () => {
    const config = baseConfig();
    // "checkout" isn't a committed screen yet, but "home" already covers urlGlob "/".
    const result = mergeScreensConfig({
      config,
      screens: [{ id: "root-page", name: { en: "Root (guessed)" }, urlGlob: "/" }],
      transitions: [
        { id: "cap-1", from: "root-page", to: "root-page", trigger: { en: "navigation" } },
      ],
      source: "auto-captured",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.screens.map((s) => s.id)).toEqual(["home"]);
    const added = result.config?.transitions.find((t) => t.id === "cap-1");
    expect(added).toMatchObject({ from: "home", to: "home" });
  });

  it("dedupes an idempotent re-merge of the SAME source (re-approve), overwriting in place", () => {
    const config = baseConfig();
    const first = mergeScreensConfig({
      config,
      transitions: [{ id: "cap-1", from: "home", to: "home", trigger: { en: "navigation" } }],
      source: "auto-captured",
    });
    const second = mergeScreensConfig({
      config: first.config as ScreensConfig,
      transitions: [{ id: "cap-1", from: "home", to: "home", trigger: { en: "updated" } }],
      source: "auto-captured",
    });
    expect(second.ok).toBe(true);
    expect(second.config?.transitions.filter((t) => t.id === "cap-1")).toHaveLength(1);
    expect(second.config?.transitions.find((t) => t.id === "cap-1")?.trigger).toEqual({
      en: "updated",
    });
  });

  it("refuses to overwrite a transition id owned by a DIFFERENT source (never clobbers manual/imported)", () => {
    const config = baseConfig();
    const result = mergeScreensConfig({
      config,
      transitions: [
        { id: "manual-1", from: "home", to: "checkout", trigger: { en: "navigation" } },
      ],
      source: "auto-captured",
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/owned by source "manual"/);
  });

  it("preserves every existing manual/imported screen and transition untouched", () => {
    const config = baseConfig();
    const result = mergeScreensConfig({
      config,
      screens: [{ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" }],
      transitions: [{ id: "cap-1", from: "home", to: "cart", trigger: { en: "navigation" } }],
      source: "auto-captured",
    });
    expect(result.config?.screens.find((s) => s.id === "home")).toEqual(config.screens[0]);
    expect(result.config?.transitions.find((t) => t.id === "manual-1")).toEqual(
      config.transitions[0],
    );
  });

  it("aborts (ok:false, no config) on a schema violation, e.g. a transition referencing no trigger", () => {
    const config = baseConfig();
    const result = mergeScreensConfig({
      config,
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed for the test
      transitions: [{ id: "bad", from: "home", to: "home" } as any],
      source: "auto-captured",
    });
    expect(result.ok).toBe(false);
    expect(result.config).toBeUndefined();
  });
});

describe("mergeScreensDraft (Track C's editor Save, delete-aware)", () => {
  it("applies the draft's manual screens/transitions and preserves auto-captured ones", () => {
    const config: ScreensConfig = {
      version: "1.0",
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" },
      ],
      transitions: [
        {
          id: "cap-1",
          from: "home",
          to: "checkout",
          trigger: { en: "nav" },
          source: "auto-captured",
        },
      ],
    };
    const result = mergeScreensDraft({
      config,
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" },
        { id: "cart", name: { en: "Cart" }, urlGlob: "/cart" },
      ],
      transitions: [
        { id: "man-1", from: "checkout", to: "cart", trigger: { en: "Add" }, source: "manual" },
      ],
      source: "manual",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.screens.map((s) => s.id).sort()).toEqual(["cart", "checkout", "home"]);
    expect(result.config?.transitions.find((t) => t.id === "cap-1")?.source).toBe("auto-captured");
    expect(result.config?.transitions.find((t) => t.id === "man-1")?.source).toBe("manual");
  });

  it("actually removes a manual transition/screen the draft dropped (full replace of the owned slice)", () => {
    const config: ScreensConfig = {
      version: "1.0",
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "cart", name: { en: "Cart" }, urlGlob: "/cart" },
      ],
      transitions: [
        { id: "man-1", from: "home", to: "cart", trigger: { en: "Add" }, source: "manual" },
      ],
    };
    // The draft dropped both "cart" and its edge -- deletion must take effect.
    const result = mergeScreensDraft({
      config,
      screens: [{ id: "home", name: { en: "Home" }, urlGlob: "/" }],
      transitions: [],
      source: "manual",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.screens.map((s) => s.id)).toEqual(["home"]);
    expect(result.config?.transitions).toEqual([]);
  });

  it("never drops a screen a preserved auto-captured transition still needs, even if the draft omitted it", () => {
    const config: ScreensConfig = {
      version: "1.0",
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" },
      ],
      transitions: [
        {
          id: "cap-1",
          from: "home",
          to: "checkout",
          trigger: { en: "nav" },
          source: "auto-captured",
        },
      ],
    };
    // Draft only carries "home" -- but "checkout" is still needed by cap-1.
    const result = mergeScreensDraft({
      config,
      screens: [{ id: "home", name: { en: "Home" }, urlGlob: "/" }],
      transitions: [],
      source: "manual",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.screens.map((s) => s.id).sort()).toEqual(["checkout", "home"]);
    expect(result.config?.transitions.find((t) => t.id === "cap-1")).toBeDefined();
  });
});

function baseFlowsConfig(): FlowsConfig {
  return {
    version: "1.0",
    flows: [
      {
        id: "application-status",
        object: { en: "Application" },
        states: [
          { id: "draft", label: { en: "Draft" }, kind: "initial" },
          { id: "submitted", label: { en: "Submitted" } },
          { id: "approved", label: { en: "Approved" }, kind: "terminal" },
        ],
        transitions: [
          {
            id: "imp-1",
            from: "draft",
            to: "submitted",
            trigger: { en: "Submit" },
            source: "imported",
          },
          {
            id: "man-1",
            from: "submitted",
            to: "approved",
            trigger: { en: "Approve" },
            source: "manual",
          },
        ],
      },
    ],
  };
}

describe("mergeFlowsConfig", () => {
  it("preserves every imported/auto-captured transition and applies the draft's manual ones", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "application-status",
      states: config.flows[0].states,
      transitions: [
        ...config.flows[0].transitions,
        { id: "man-2", from: "draft", to: "approved", trigger: { en: "Fast-track" } },
      ],
      source: "manual",
    });
    expect(result.ok).toBe(true);
    const flow = result.config?.flows[0];
    expect(flow?.transitions.find((t) => t.id === "imp-1")).toEqual(config.flows[0].transitions[0]);
    expect(flow?.transitions.find((t) => t.id === "man-2")?.source).toBe("manual");
  });

  it("upserts a new state and dedupes a repeated transition id in the draft (last wins)", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "application-status",
      states: [
        ...config.flows[0].states,
        { id: "rejected", label: { en: "Rejected" }, kind: "terminal" },
      ],
      transitions: [
        { id: "man-1", from: "submitted", to: "rejected", trigger: { en: "Reject" } },
        { id: "man-1", from: "submitted", to: "rejected", trigger: { en: "Reject (final)" } },
      ],
      source: "manual",
    });
    expect(result.ok).toBe(true);
    const flow = result.config?.flows[0];
    expect(flow?.states.map((s) => s.id)).toContain("rejected");
    const matches = flow?.transitions.filter((t) => t.id === "man-1");
    expect(matches).toHaveLength(1);
    expect(matches?.[0]?.trigger).toEqual({ en: "Reject (final)" });
  });

  it("actually removes a manual transition the draft dropped (full replace of the owned slice)", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "application-status",
      states: config.flows[0].states,
      transitions: [config.flows[0].transitions[0]], // drops man-1
      source: "manual",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.flows[0]?.transitions.find((t) => t.id === "man-1")).toBeUndefined();
  });

  it("never drops a state an imported transition still needs, even if the draft omitted it", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "application-status",
      states: config.flows[0].states.filter((s) => s.id !== "submitted"),
      transitions: [config.flows[0].transitions[0]],
      source: "manual",
    });
    expect(result.ok).toBe(true);
    expect(result.config?.flows[0]?.states.map((s) => s.id)).toContain("submitted");
  });

  it("refuses a clobber attempt on an id owned by a different source", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "application-status",
      states: config.flows[0].states,
      transitions: [{ id: "imp-1", from: "draft", to: "approved", trigger: { en: "hack" } }],
      source: "manual",
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/owned by a different source/);
  });

  it("aborts on an unknown flow id", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "no-such-flow",
      states: [],
      transitions: [],
      source: "manual",
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toMatch(/unknown flow/);
  });

  it("aborts (ok:false) on a schema violation", () => {
    const config = baseFlowsConfig();
    const result = mergeFlowsConfig({
      config,
      flowId: "application-status",
      states: config.flows[0].states,
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed for the test
      transitions: [{ id: "bad", from: "draft", to: "draft" } as any],
      source: "manual",
    });
    expect(result.ok).toBe(false);
    expect(result.config).toBeUndefined();
  });
});
