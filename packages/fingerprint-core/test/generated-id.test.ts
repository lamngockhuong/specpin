import { describe, expect, it } from "vitest";
import { isGeneratedClass, isGeneratedId } from "../src/generated-id.js";

describe("isGeneratedId", () => {
  it("flags framework-generated ids", () => {
    for (const id of [":r1:", ":R2a:", "css-1a2b3c", "sc-bdVaJa", "mui-42", "radix-:r5:", "a1b2c3d4e5"]) {
      expect(isGeneratedId(id), id).toBe(true);
    }
  });

  it("keeps human-authored ids", () => {
    for (const id of ["login-submit", "email", "submitBtn", "header2024", "nav-main"]) {
      expect(isGeneratedId(id), id).toBe(false);
    }
  });

  it("treats empty/absent as not-a-usable-id (false)", () => {
    expect(isGeneratedId(null)).toBe(false);
    expect(isGeneratedId(undefined)).toBe(false);
    expect(isGeneratedId("")).toBe(false);
  });
});

describe("isGeneratedClass", () => {
  it("flags CSS-in-JS / CSS-module hashes", () => {
    for (const c of ["css-1a2b3c", "Button_root__a1b2c", "header-9f8e7d6c"]) {
      expect(isGeneratedClass(c), c).toBe(true);
    }
  });

  it("keeps semantic / utility classes", () => {
    for (const c of ["btn", "login-form", "bg-blue-500", "text-lg"]) {
      expect(isGeneratedClass(c), c).toBe(false);
    }
  });
});
