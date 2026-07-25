import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { createFlowsEditMode, createScreensEditMode } from "../src/graph/graph-edit-mode.js";
import { computeOrphanWarning } from "../src/graph/graph-edit-orphan-shots.js";

function baseScreensConfig(): ScreensConfig {
  return {
    version: "1.0",
    screens: [
      { id: "home", name: { en: "Home" }, urlGlob: "/" },
      { id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" },
    ],
    transitions: [],
  };
}

describe("createScreensEditMode dirty tracking (C3)", () => {
  it("starts clean", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    expect(mode.isDirty()).toBe(false);
  });

  it("a successful mutation marks the draft dirty", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    expect(mode.isDirty()).toBe(true);
  });

  it("a refused mutation does not mark the draft dirty", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const result = mode.addNode({ id: "home", name: { en: "Home 2" }, urlGlob: "/home2" });
    expect(result.ok).toBe(false);
    expect(mode.isDirty()).toBe(false);
  });

  it("resetDirty clears the flag (post-Save)", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    expect(mode.isDirty()).toBe(true);
    mode.resetDirty();
    expect(mode.isDirty()).toBe(false);
  });

  it("undoLast restores the prior draft", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    expect(mode.snapshot().screens.map((s) => s.id)).toContain("cart");
    const result = mode.undoLast();
    expect(result.ok).toBe(true);
    expect(mode.snapshot().screens.map((s) => s.id)).not.toContain("cart");
  });

  it("undoLast is single-step: a second call with no new mutation is a no-op error", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    mode.undoLast();
    const second = mode.undoLast();
    expect(second.ok).toBe(false);
  });

  it("undoLast only reverts the LAST mutation, not earlier ones", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    mode.addNode({ id: "wishlist", name: { en: "Wishlist" }, urlGlob: "/wishlist" });
    mode.undoLast();
    const ids = mode.snapshot().screens.map((s) => s.id);
    expect(ids).toContain("cart");
    expect(ids).not.toContain("wishlist");
  });

  // Regression: a refused mutation used to snapshot into the tracker
  // unconditionally, overwriting the one kept undo snapshot with the CURRENT
  // (already-mutated) draft -- so undoLast() after a refusal restored a
  // snapshot equal to current and silently did nothing.
  it("BUG FIX: a refused mutation must not clobber the undo snapshot -- undo still reverts the prior successful mutation", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const added = mode.addNode({ id: "cart", name: { en: "Cart" }, urlGlob: "/cart" });
    expect(added.ok).toBe(true);
    // duplicate id -- refused, must leave the draft AND the undo snapshot alone
    const duplicate = mode.addNode({ id: "cart", name: { en: "Cart 2" }, urlGlob: "/cart2" });
    expect(duplicate.ok).toBe(false);
    expect(mode.isDirty()).toBe(true);
    expect(mode.snapshot().screens.map((s) => s.id)).toContain("cart");

    const undone = mode.undoLast();
    expect(undone.ok).toBe(true);
    expect(mode.snapshot().screens.map((s) => s.id)).not.toContain("cart");
  });

  it("a refused mutation with nothing successful yet leaves undo with nothing to revert", () => {
    const mode = createScreensEditMode(baseScreensConfig());
    const refused = mode.addNode({ id: "home", name: { en: "Home 2" }, urlGlob: "/home2" });
    expect(refused.ok).toBe(false);
    expect(mode.isDirty()).toBe(false);
    expect(mode.undoLast().ok).toBe(false);
  });
});

function baseFlowsConfig(): FlowsConfig {
  return {
    version: "1.0",
    flows: [
      {
        id: "checkout",
        object: { en: "Order" },
        states: [{ id: "draft", label: { en: "Draft" }, kind: "initial" }],
        transitions: [],
      },
    ],
  };
}

describe("createFlowsEditMode dirty tracking (C3)", () => {
  it("BUG FIX: a refused mutation must not clobber the undo snapshot (flows side, same withUndo shape as screens)", () => {
    const mode = createFlowsEditMode(baseFlowsConfig(), "checkout");
    expect(mode).not.toBeNull();
    const added = mode?.addNode({ id: "paid", label: { en: "Paid" } });
    expect(added?.ok).toBe(true);
    const duplicate = mode?.addNode({ id: "paid", label: { en: "Paid again" } });
    expect(duplicate?.ok).toBe(false);
    expect(mode?.isDirty()).toBe(true);

    const undone = mode?.undoLast();
    expect(undone?.ok).toBe(true);
    expect(mode?.snapshot().states.map((s) => s.id)).not.toContain("paid");
  });
});

describe("computeOrphanWarning (C3 orphaned-shot warning)", () => {
  it("returns null when no screen was removed", () => {
    expect(computeOrphanWarning(["home"], ["home", "checkout"], ["home", "checkout"])).toBeNull();
  });

  it("returns null when a removed screen owns no shot", () => {
    expect(computeOrphanWarning(["checkout"], ["home", "checkout"], ["checkout"])).toBeNull();
  });

  it("fires with an exact count when a removed screen owns a shot", () => {
    expect(computeOrphanWarning(["home"], ["home", "checkout"], ["checkout"])).toEqual({
      count: 1,
    });
  });

  it("counts multiple orphaned shots", () => {
    expect(computeOrphanWarning(["home", "checkout"], ["home", "checkout", "cart"], [])).toEqual({
      count: 2,
    });
  });

  it("degrades to a generic caution (no count) when the shot inventory is unknown", () => {
    expect(computeOrphanWarning(null, ["home", "checkout"], ["checkout"])).toEqual({});
  });

  it("stays quiet (null) when the inventory is unknown but nothing was removed", () => {
    expect(computeOrphanWarning(null, ["home", "checkout"], ["home", "checkout"])).toBeNull();
  });
});
