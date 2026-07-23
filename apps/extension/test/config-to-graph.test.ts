import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { flowsToGraph, screensToGraph, urlGlobCategory } from "../src/graph/config-to-graph.js";

describe("flowsToGraph", () => {
  const config: FlowsConfig = {
    version: "1.0",
    flows: [
      {
        id: "application-status",
        object: { en: "Application", vi: "Đơn" },
        states: [
          { id: "draft", label: { en: "Draft" }, kind: "initial" },
          { id: "submitted", label: { en: "Submitted" }, specId: "app-submit-btn" },
          { id: "approved", label: { en: "Approved" }, kind: "terminal" },
        ],
        transitions: [
          {
            id: "t1",
            from: "draft",
            to: "submitted",
            trigger: { en: "Submit" },
            specId: "app-submit-btn",
          },
          {
            id: "t2",
            from: "submitted",
            to: "approved",
            trigger: { en: "Approve" },
            guard: "role == admin",
            role: "admin",
          },
        ],
      },
    ],
  };

  it("derives one node per FlowState, prefixed by flow id for cross-flow uniqueness", () => {
    const graph = flowsToGraph(config, "en");
    expect(graph.nodes.map((n) => n.id)).toEqual([
      "application-status:draft",
      "application-status:submitted",
      "application-status:approved",
    ]);
    expect(graph.nodes[1]).toMatchObject({
      label: "Submitted",
      specId: "app-submit-btn",
      category: "Application",
    });
    expect(graph.nodes[0].kind).toBe("initial");
    expect(graph.nodes[2].kind).toBe("terminal");
  });

  it("derives one edge per Transition with from/to remapped to the prefixed node ids", () => {
    const graph = flowsToGraph(config, "en");
    expect(graph.edges).toEqual([
      {
        id: "application-status:t1",
        from: "application-status:draft",
        to: "application-status:submitted",
        label: "Submit",
        guard: null,
        role: null,
        specId: "app-submit-btn",
      },
      {
        id: "application-status:t2",
        from: "application-status:submitted",
        to: "application-status:approved",
        label: "Approve",
        guard: "role == admin",
        role: "admin",
        specId: null,
      },
    ]);
  });

  it("resolves LocalizedString labels via the requested locale, falling back to defaultLocale", () => {
    const graph = flowsToGraph(config, "vi", "en");
    expect(graph.nodes[0].category).toBe("Đơn");
    // states only have an `en` label -- falls back to defaultLocale, then id.
    expect(graph.nodes[0].label).toBe("Draft");
  });

  it("drops a transition whose from/to references a state id absent from states (referential integrity is a runtime concern, not schema-enforced)", () => {
    const dangling: FlowsConfig = {
      version: "1.0",
      flows: [
        {
          id: "f1",
          object: { en: "Thing" },
          states: [{ id: "a", label: { en: "A" } }],
          transitions: [
            { id: "e1", from: "a", to: "ghost", trigger: { en: "Go" } },
            { id: "e2", from: "ghost", to: "a", trigger: { en: "Back" } },
          ],
        },
      ],
    };
    const graph = flowsToGraph(dangling, "en");
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it("keeps identically-named state ids from two different flows distinct", () => {
    const twoFlows: FlowsConfig = {
      version: "1.0",
      flows: [
        {
          id: "flow-a",
          object: { en: "A" },
          states: [{ id: "draft", label: { en: "Draft A" } }],
          transitions: [],
        },
        {
          id: "flow-b",
          object: { en: "B" },
          states: [{ id: "draft", label: { en: "Draft B" } }],
          transitions: [],
        },
      ],
    };
    const graph = flowsToGraph(twoFlows, "en");
    expect(graph.nodes.map((n) => n.id)).toEqual(["flow-a:draft", "flow-b:draft"]);
  });
});

describe("screensToGraph", () => {
  const config: ScreensConfig = {
    version: "1.0",
    screens: [
      { id: "home", name: { en: "Home" }, urlGlob: "/", specIds: ["nav-home"] },
      {
        id: "checkout",
        name: { en: "Checkout" },
        urlGlob: "/checkout/*",
        description: { en: "Checkout flow" },
      },
    ],
    transitions: [
      { id: "n1", from: "home", to: "checkout", trigger: { en: "Buy now" }, specId: "buy-btn" },
    ],
  };

  it("derives one node per Screen, categorized by the urlGlob's top segment", () => {
    const graph = screensToGraph(config, "en");
    expect(graph.nodes).toEqual([
      { id: "home", label: "Home", category: "root", specId: "nav-home", urlGlob: "/" },
      {
        id: "checkout",
        label: "Checkout",
        category: "checkout",
        specId: null,
        urlGlob: "/checkout/*",
      },
    ]);
  });

  it("derives one edge per Transition, unchanged from/to (screens are a single flat list)", () => {
    const graph = screensToGraph(config, "en");
    expect(graph.edges).toEqual([
      {
        id: "n1",
        from: "home",
        to: "checkout",
        label: "Buy now",
        guard: null,
        role: null,
        specId: "buy-btn",
      },
    ]);
  });

  it("drops a transition whose from/to references a missing screen id", () => {
    const dangling: ScreensConfig = {
      version: "1.0",
      screens: [{ id: "home", name: { en: "Home" }, urlGlob: "/" }],
      transitions: [{ id: "n1", from: "home", to: "gone", trigger: { en: "Go" } }],
    };
    const graph = screensToGraph(dangling, "en");
    expect(graph.edges).toHaveLength(0);
  });
});

describe("urlGlobCategory", () => {
  it("uses the first non-empty path segment, stripped of glob characters", () => {
    expect(urlGlobCategory("/checkout/*")).toBe("checkout");
    expect(urlGlobCategory("/deals/new")).toBe("deals");
  });

  it("falls back to 'root' for the bare root glob or an all-wildcard segment", () => {
    expect(urlGlobCategory("/")).toBe("root");
    expect(urlGlobCategory("/*")).toBe("root");
  });
});
