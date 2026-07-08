import { describe, expect, it } from "vitest";
import { isGeneratedClass, isGeneratedId, isUtilityClass } from "../src/generated-id.js";

describe("isGeneratedId", () => {
  it("flags framework-generated ids", () => {
    for (const id of [
      ":r1:",
      ":R2a:",
      "css-1a2b3c",
      "sc-bdVaJa",
      "mui-42",
      "radix-:r5:",
      "a1b2c3d4e5",
    ]) {
      expect(isGeneratedId(id), id).toBe(true);
    }
  });

  it("flags modern headless-UI id schemes", () => {
    for (const id of [
      "base-ui-_r_s_", // Base UI / MUI Base
      "base-ui-_r_4up_",
      "_r_s_", // bare useId, colons rewritten to underscores
      "ark-1", // Ark UI / Zag
      "chakra-abc", // Chakra
      "mantine-xyz",
      "nextui-123",
    ]) {
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

describe("isUtilityClass", () => {
  it("flags atomic / utility classes", () => {
    for (const c of [
      "bg-red-1",
      "text-red-6",
      "border-red-3",
      "bg-blue-500",
      "px-2",
      "gap-1",
      "mt-4",
      "w-full",
      "hover:bg-gray-2",
      "md:flex",
      "w-[168px]",
    ]) {
      expect(isUtilityClass(c), c).toBe(true);
    }
  });

  it("keeps semantic identity classes (incl. semantic-but-numeric names)", () => {
    for (const c of [
      "login-form",
      "card",
      "table-head",
      "btn",
      "inline-flex",
      "items-center",
      // numeric suffixes that are NOT Tailwind utilities must survive as identity
      "heading-1",
      "heading-2",
      "col-6",
      "col-12",
      "step-1",
      "order-2",
      "section-1",
      "form-2fa",
    ]) {
      expect(isUtilityClass(c), c).toBe(false);
    }
  });

  it("treats empty as not-a-utility (false)", () => {
    expect(isUtilityClass("")).toBe(false);
  });
});
