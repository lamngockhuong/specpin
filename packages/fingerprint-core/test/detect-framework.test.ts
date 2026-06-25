import { afterEach, describe, expect, it } from "vitest";
import { detectFramework } from "../src/detect-framework.js";

afterEach(() => {
  document.documentElement.removeAttribute("ng-version");
  document.body.innerHTML = "";
});

describe("detectFramework", () => {
  it("defaults to vanilla", () => {
    expect(detectFramework(document)).toBe("vanilla");
  });

  it("detects Angular via ng-version", () => {
    document.documentElement.setAttribute("ng-version", "18.0.0");
    expect(detectFramework(document)).toBe("angular");
  });

  it("detects Vue via data-v-app", () => {
    document.body.innerHTML = `<div data-v-app></div>`;
    expect(detectFramework(document)).toBe("vue");
  });

  it("detects React via fiber keys", () => {
    const el = document.createElement("div");
    (el as unknown as Record<string, unknown>)["__reactFiber$abc123"] = {};
    document.body.appendChild(el);
    expect(detectFramework(document)).toBe("react");
  });

  it("detects React via data-reactroot", () => {
    document.body.innerHTML = `<div data-reactroot></div>`;
    expect(detectFramework(document)).toBe("react");
  });
});
