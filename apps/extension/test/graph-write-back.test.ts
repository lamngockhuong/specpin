import type { ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { mergeScreensConfig } from "../src/graph/graph-write-back.js";

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
