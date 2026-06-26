import type { Manifest, Spec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { createRenderer, isImplemented, resolveMode } from "../src/renderers/registry.js";

const baseSpec: Spec = {
  id: "x",
  title: "X",
  description: "d",
  fingerprint: {
    cssSelector: "button",
    xpath: "",
    domPath: [],
    tagName: "button",
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
  },
};

describe("resolveMode", () => {
  it("prefers the spec's preferredDisplayMode", () => {
    expect(resolveMode({ ...baseSpec, preferredDisplayMode: "sidebar" }, null)).toBe("sidebar");
  });

  it("falls back to the manifest default", () => {
    const manifest = {
      version: "1.0",
      project: "p",
      domains: [],
      specFiles: [],
      settings: { defaultDisplayMode: "sidebar" },
    } as unknown as Manifest;
    expect(resolveMode(baseSpec, manifest)).toBe("sidebar");
  });

  it("falls back to tooltip when nothing is set", () => {
    expect(resolveMode(baseSpec, null)).toBe("tooltip");
  });
});

describe("createRenderer", () => {
  it("creates the requested implemented renderer", () => {
    expect(createRenderer("tooltip", document).mode).toBe("tooltip");
    expect(createRenderer("sidebar", document).mode).toBe("sidebar");
  });

  it("falls back to tooltip for unimplemented modes", () => {
    expect(isImplemented("modal")).toBe(false);
    expect(createRenderer("modal", document).mode).toBe("tooltip");
  });
});
