import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { createFlowsEditMode, createScreensEditMode } from "../src/graph/graph-edit-mode.js";

function baseScreensConfig(): ScreensConfig {
  return {
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
}

describe("createScreensEditMode", () => {
  it("adds a node, stamped nowhere yet (screens carry no source)", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    expect(result.ok).toBe(true);
    expect(mode.snapshot().screens.map((s) => s.id)).toContain("cart");
  });

  it("refuses to add a node whose id already exists", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.addNode({ id: "home", name: { en: "Home 2" }, urlGlob: "/home2" });
    expect(result.ok).toBe(false);
    expect(mode.snapshot().screens).toHaveLength(2);
  });

  it("adds an edge stamped source: manual", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.addEdge({
      id: "man-1",
      from: "home",
      to: "checkout",
      trigger: { en: "Buy" },
    });
    expect(result.ok).toBe(true);
    expect(mode.snapshot().transitions.find((t) => t.id === "man-1")?.source).toBe("manual");
  });

  it("refuses an edge referencing an unknown screen", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.addEdge({
      id: "man-1",
      from: "home",
      to: "nowhere",
      trigger: { en: "Buy" },
    });
    expect(result.ok).toBe(false);
    expect(mode.snapshot().transitions).toHaveLength(1);
  });

  it("deletes a manual edge", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addEdge({ id: "man-1", from: "home", to: "checkout", trigger: { en: "Buy" } });
    const result = mode.deleteEdge("man-1");
    expect(result.ok).toBe(true);
    expect(mode.snapshot().transitions.find((t) => t.id === "man-1")).toBeUndefined();
  });

  it("deletes an auto-captured edge, adopting it so Save drops the stale copy", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.deleteEdge("cap-1");
    expect(result.ok).toBe(true);
    expect(mode.snapshot().transitions.find((t) => t.id === "cap-1")).toBeUndefined();
    expect(mode.snapshot().adopted).toContain("cap-1");
  });

  it("deletes a node blocked only by an auto-captured edge, adopting that edge", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.deleteNode("checkout");
    expect(result.ok).toBe(true);
    expect(mode.snapshot().screens.map((s) => s.id)).not.toContain("checkout");
    // cap-1 (home -> checkout) cascaded away, adopted so Save won't resurrect it.
    expect(mode.snapshot().transitions.find((t) => t.id === "cap-1")).toBeUndefined();
    expect(mode.snapshot().adopted).toContain("cap-1");
  });

  it("deletes a node with no non-manual edges, cascading its manual edges", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    mode.addEdge({ id: "man-1", from: "checkout", to: "cart", trigger: { en: "Add" } });
    const result = mode.deleteNode("cart");
    expect(result.ok).toBe(true);
    expect(mode.snapshot().screens.map((s) => s.id)).not.toContain("cart");
    expect(mode.snapshot().transitions.find((t) => t.id === "man-1")).toBeUndefined();
  });

  it("the screen-delete shot guard refuses a delete when a shot references the screen", () => {
    const mode = createScreensEditMode(baseScreensConfig(), {
      hasShotReference: (id) => id === "cart",
    });
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    // "cart" has no non-manual edge referencing it, so only the shot guard fires.
    const result = mode.deleteNode("cart");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/shot/);
    expect(mode.snapshot().screens.map((s) => s.id)).toContain("cart");
  });

  it("getGraph re-derives from the live draft", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    const graph = mode.getGraph("en");
    expect(graph.nodes.map((n) => n.id)).toContain("cart");
  });

  it("updateNode edits an existing screen's fields by id (C2)", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.updateNode("home", { name: { en: "Homepage" }, urlGlob: "/home" });
    expect(result.ok).toBe(true);
    const home = mode.snapshot().screens.find((s) => s.id === "home");
    expect(home?.name).toEqual({ en: "Homepage" });
    expect(home?.urlGlob).toBe("/home");
  });

  it("updateNode refuses an unknown screen id", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.updateNode("nowhere", { name: { en: "X" } });
    expect(result.ok).toBe(false);
  });

  it("updateEdge edits a manual-owned transition's fields by id (C2)", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addEdge({ id: "man-1", from: "home", to: "checkout", trigger: { en: "Buy" } });
    const result = mode.updateEdge("man-1", { trigger: { en: "Purchase" }, guard: "amount > 0" });
    expect(result.ok).toBe(true);
    const edge = mode.snapshot().transitions.find((t) => t.id === "man-1");
    expect(edge?.trigger).toEqual({ en: "Purchase" });
    expect(edge?.guard).toBe("amount > 0");
  });

  it("updateEdge adopts an auto-captured transition to manual, then applies the edit", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.updateEdge("cap-1", { trigger: { en: "Renamed" } });
    expect(result.ok).toBe(true);
    const edge = mode.snapshot().transitions.find((t) => t.id === "cap-1");
    expect(edge?.trigger).toEqual({ en: "Renamed" });
    expect(edge?.source).toBe("manual");
    expect(mode.snapshot().adopted).toContain("cap-1");
  });

  it("undo reverts an adoption, restoring the auto-captured source and the adopted set", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.updateEdge("cap-1", { trigger: { en: "Renamed" } });
    expect(mode.snapshot().adopted).toContain("cap-1");
    expect(mode.undoLast().ok).toBe(true);
    const edge = mode.snapshot().transitions.find((t) => t.id === "cap-1");
    expect(edge?.source).toBe("auto-captured");
    expect(edge?.trigger).toEqual({ en: "nav" });
    expect(mode.snapshot().adopted).not.toContain("cap-1");
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
        ],
        transitions: [
          {
            id: "imp-1",
            from: "draft",
            to: "submitted",
            trigger: { en: "Submit" },
            source: "imported",
          },
        ],
      },
      {
        id: "order-status",
        object: { en: "Order" },
        states: [{ id: "placed", label: { en: "Placed" }, kind: "initial" }],
        transitions: [],
      },
    ],
  };
}

describe("createFlowsEditMode", () => {
  it("returns null for an unknown flow id", () => {
    expect(createFlowsEditMode(baseFlowsConfig(), "no-such-flow")).toBeNull();
  });

  it("adds a state and an edge, stamped source: manual, scoped to the selected flow", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    expect(mode).not.toBeNull();
    mode?.addNode({ id: "approved", label: { en: "Approved" }, kind: "terminal" });
    const result = mode?.addEdge({
      id: "man-1",
      from: "submitted",
      to: "approved",
      trigger: { en: "Approve" },
    });
    expect(result?.ok).toBe(true);
    expect(mode?.snapshot()).toMatchObject({ flowId: "application-status" });
    expect(mode?.snapshot().transitions.find((t) => t.id === "man-1")?.source).toBe("manual");
  });

  it("refuses to delete a state still referenced by a non-manual transition", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    const result = mode?.deleteNode("submitted");
    expect(result?.ok).toBe(false);
    expect(mode?.snapshot().states.map((s) => s.id)).toContain("submitted");
  });

  it("deletes a manual-only state, cascading its manual edges", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    mode?.addNode({ id: "rejected", label: { en: "Rejected" }, kind: "terminal" });
    mode?.addEdge({ id: "man-1", from: "submitted", to: "rejected", trigger: { en: "Reject" } });
    const result = mode?.deleteNode("rejected");
    expect(result?.ok).toBe(true);
    expect(mode?.snapshot().states.map((s) => s.id)).not.toContain("rejected");
    expect(mode?.snapshot().transitions.find((t) => t.id === "man-1")).toBeUndefined();
  });

  it("getGraph re-derives the WHOLE dataset, leaving other flows untouched", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    mode?.addNode({ id: "approved", label: { en: "Approved" }, kind: "terminal" });
    const graph = mode?.getGraph("en");
    expect(graph?.nodes.map((n) => n.id)).toContain("application-status:approved");
    expect(graph?.nodes.map((n) => n.id)).toContain("order-status:placed");
  });

  it("updateNode edits an existing state's fields by id (C2)", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    const result = mode?.updateNode("draft", { label: { en: "Draft (editing)" }, kind: "normal" });
    expect(result?.ok).toBe(true);
    const state = mode?.snapshot().states.find((s) => s.id === "draft");
    expect(state?.label).toEqual({ en: "Draft (editing)" });
    expect(state?.kind).toBe("normal");
  });

  it("updateNode refuses an unknown state id", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    expect(mode?.updateNode("nowhere", { label: { en: "X" } }).ok).toBe(false);
  });

  it("updateEdge refuses a non-manual (imported) transition", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    const result = mode?.updateEdge("imp-1", { trigger: { en: "Renamed" } });
    expect(result?.ok).toBe(false);
  });

  it("updateEdge edits a manual-owned transition's fields by id (C2)", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "application-status");
    mode?.addEdge({ id: "man-1", from: "draft", to: "submitted", trigger: { en: "Submit" } });
    const result = mode?.updateEdge("man-1", { role: "admin", specId: "submit-btn" });
    expect(result?.ok).toBe(true);
    const edge = mode?.snapshot().transitions.find((t) => t.id === "man-1");
    expect(edge?.role).toBe("admin");
    expect(edge?.specId).toBe("submit-btn");
  });
});
