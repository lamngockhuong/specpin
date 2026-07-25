import type { Flow, FlowsConfig, Screen, ScreensConfig, Transition } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { mergeFlows, mergeScreens } from "../src/merge.js";

function flow(id: string, extra: Partial<Flow> = {}): Flow {
  return { id, object: { en: id }, states: [], transitions: [], ...extra };
}

function screen(id: string, urlGlob = `/${id}`, extra: Partial<Screen> = {}): Screen {
  return { id, name: { en: id }, urlGlob, ...extra };
}

function transition(id: string, from: string, to: string): Transition {
  return { id, from, to, trigger: { en: id }, source: "manual" };
}

describe("mergeFlows — provenance matrix", () => {
  it("case 1: preserves a hand-authored Flow untouched and refreshes the imported one", () => {
    const handAuthored = flow("A", { object: { en: "Hand-authored A" } });
    const existing: FlowsConfig = { version: "1.0", flows: [handAuthored, flow("B")] };
    const imported: FlowsConfig = {
      version: "1.0",
      flows: [flow("B", { object: { en: "Fresh B" } })],
    };

    const result = mergeFlows(existing, imported, new Set(["B"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.config.flows.find((f) => f.id === "A");
    const b = result.config.flows.find((f) => f.id === "B");
    expect(a).toBe(handAuthored); // same reference: byte-identical
    expect(b?.object).toEqual({ en: "Fresh B" });
  });

  it("case 3: aborts on a Flow id collision with a hand-authored (not previously owned) entry", () => {
    const existing: FlowsConfig = { version: "1.0", flows: [flow("order-status")] };
    const imported: FlowsConfig = { version: "1.0", flows: [flow("order-status")] };

    const result = mergeFlows(existing, imported, new Set()); // not owned -> hand-authored

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('flow id "order-status"');
    expect(result.error).toContain("refusing to clobber");
  });

  it("does not collide when the existing Flow id was previously import-owned", () => {
    const existing: FlowsConfig = { version: "1.0", flows: [flow("order-status")] };
    const imported: FlowsConfig = {
      version: "1.0",
      flows: [flow("order-status", { object: { en: "Refreshed" } })],
    };

    const result = mergeFlows(existing, imported, new Set(["order-status"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.flows).toHaveLength(1);
    expect(result.config.flows[0]?.object).toEqual({ en: "Refreshed" });
  });

  it("prunes an import-owned Flow no longer declared by the config", () => {
    const existing: FlowsConfig = { version: "1.0", flows: [flow("stale"), flow("kept")] };
    const imported: FlowsConfig = { version: "1.0", flows: [] };

    const result = mergeFlows(existing, imported, new Set(["stale"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.flows.map((f) => f.id)).toEqual(["kept"]);
  });

  it("is deterministic: re-running the same merge yields byte-identical output", () => {
    const existing: FlowsConfig = { version: "1.0", flows: [flow("manual")] };
    const imported: FlowsConfig = { version: "1.0", flows: [flow("z"), flow("a")] };

    const first = mergeFlows(existing, imported, new Set());
    const second = mergeFlows(existing, imported, new Set());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    if (first.ok) expect(first.config.flows.map((f) => f.id)).toEqual(["manual", "a", "z"]);
  });
});

describe("mergeScreens — provenance matrix", () => {
  it("case 4: prunes a removed import-owned screen, keeps a hand-authored screen with the same-shaped id", () => {
    const existingA: ScreensConfig = {
      version: "1.0",
      screens: [screen("customers"), screen("settings")],
      transitions: [],
    };
    // First run: import owns "settings"; second run no longer produces it.
    const importedGone: ScreensConfig = { version: "1.0", screens: [], transitions: [] };
    const pruned = mergeScreens(existingA, importedGone, new Set(["settings"]));
    expect(pruned.ok).toBe(true);
    if (pruned.ok) expect(pruned.config.screens.map((s) => s.id)).toEqual(["customers"]);

    // Separately: a hand-authored screen sharing an id never in the owned set
    // is always kept, regardless of what the config produces this run.
    const existingB: ScreensConfig = {
      version: "1.0",
      screens: [
        screen("customers"),
        screen("settings", "/settings", { name: { en: "Hand Settings" } }),
      ],
      transitions: [],
    };
    const keep = mergeScreens(existingB, importedGone, new Set()); // "settings" never owned
    expect(keep.ok).toBe(true);
    if (keep.ok) expect(keep.config.screens.map((s) => s.id)).toEqual(["customers", "settings"]);
  });

  it("keeps a pruning candidate whose id a shot still references, with a note", () => {
    const existing: ScreensConfig = {
      version: "1.0",
      screens: [screen("checkout")],
      transitions: [],
    };
    const imported: ScreensConfig = { version: "1.0", screens: [], transitions: [] };

    const result = mergeScreens(existing, imported, new Set(["checkout"]), new Set(["checkout"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.screens.map((s) => s.id)).toEqual(["checkout"]);
    expect(result.notes.some((n) => n.includes('"checkout"') && n.includes("shot"))).toBe(true);
  });

  it("case 5: never touches screens.transitions (same array reference, untouched content)", () => {
    const existingTransitions = [transition("t1", "checkout", "confirm")];
    const existing: ScreensConfig = {
      version: "1.0",
      screens: [screen("checkout")],
      transitions: existingTransitions,
    };
    const imported: ScreensConfig = {
      version: "1.0",
      screens: [screen("confirm")],
      transitions: [],
    };

    const result = mergeScreens(existing, imported, new Set());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.transitions).toBe(existingTransitions); // reference identity
    expect(result.config.transitions).toEqual([transition("t1", "checkout", "confirm")]);
  });

  it("aborts on a Screen id collision with a hand-authored (not previously owned) entry", () => {
    const existing: ScreensConfig = {
      version: "1.0",
      screens: [screen("checkout")],
      transitions: [],
    };
    const imported: ScreensConfig = {
      version: "1.0",
      screens: [screen("checkout")],
      transitions: [],
    };

    const result = mergeScreens(existing, imported, new Set());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('screen id "checkout"');
    expect(result.error).toContain("refusing to clobber");
  });

  it("upserts an existing screen in place and appends new screens sorted by id", () => {
    const existing: ScreensConfig = {
      version: "1.0",
      screens: [screen("manual"), screen("checkout")],
      transitions: [],
    };
    const imported: ScreensConfig = {
      version: "1.0",
      screens: [screen("checkout", "/checkout/v2"), screen("z-new"), screen("a-new")],
      transitions: [],
    };

    const result = mergeScreens(existing, imported, new Set(["checkout"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.screens.map((s) => s.id)).toEqual([
      "manual",
      "checkout",
      "a-new",
      "z-new",
    ]);
    expect(result.config.screens.find((s) => s.id === "checkout")?.urlGlob).toBe("/checkout/v2");
  });
});
