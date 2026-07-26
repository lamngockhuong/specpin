import type { ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { transitionAlreadyCommitted } from "../src/shared/transition-committed.js";

const from = { id: "home", urlGlob: "/" };
const to = { id: "checkout", urlGlob: "/checkout" };

function screens(transitions: ScreensConfig["transitions"]): ScreensConfig {
  return {
    version: "1.0",
    screens: [
      { id: "home", name: { en: "Home" }, urlGlob: "/" },
      { id: "checkout-page", name: { en: "Checkout" }, urlGlob: "/checkout" },
    ],
    transitions,
  };
}

describe("transitionAlreadyCommitted", () => {
  it("is false when no committed transition connects the two screens", () => {
    expect(transitionAlreadyCommitted(screens([]), from, to)).toBe(false);
  });

  it("is true when a committed transition connects them by RESOLVED id (urlGlob match)", () => {
    // The captured `to` id is "checkout" but the committed screen for /checkout is
    // "checkout-page"; resolving by urlGlob still recognizes the edge as existing.
    const cfg = screens([
      { id: "hand-authored", from: "home", to: "checkout-page", trigger: { en: "Go" } },
    ]);
    expect(transitionAlreadyCommitted(cfg, from, to)).toBe(true);
  });

  it("matches regardless of the committed transition's own id", () => {
    const cfg = screens([
      { id: "whatever-custom-id", from: "home", to: "checkout-page", trigger: { en: "x" } },
    ]);
    expect(transitionAlreadyCommitted(cfg, from, to)).toBe(true);
  });

  it("is false for a committed transition in the OTHER direction", () => {
    const cfg = screens([
      { id: "reverse", from: "checkout-page", to: "home", trigger: { en: "back" } },
    ]);
    expect(transitionAlreadyCommitted(cfg, from, to)).toBe(false);
  });
});
