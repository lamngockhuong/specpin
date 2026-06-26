import type { Spec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { localizeSpec, pickLocale } from "../src/content/localize-spec.js";

const spec = {
  id: "login",
  title: { en: "Login", vi: "Đăng nhập" },
  description: { en: "Submits the form" },
  businessRules: [{ en: "Lock account", vi: "Khoá tài khoản" }, { en: "Redirect" }],
} as unknown as Spec;

describe("localizeSpec", () => {
  it("resolves to the requested locale with per-field fallback", () => {
    const text = localizeSpec(spec, "vi", "en");
    expect(text.title).toBe("Đăng nhập");
    // description has no vi -> falls back to en.
    expect(text.description).toBe("Submits the form");
    // second rule has no vi -> falls back to en; never blank.
    expect(text.businessRules).toEqual(["Khoá tài khoản", "Redirect"]);
  });

  it("defaults to en when no locale is supplied", () => {
    expect(localizeSpec(spec).title).toBe("Login");
  });
});

describe("pickLocale", () => {
  it("prefers the stored locale", () => {
    expect(pickLocale("vi", "en")).toBe("vi");
  });
  it("falls back to the project default, then en", () => {
    expect(pickLocale(null, "vi")).toBe("vi");
    expect(pickLocale(null, undefined)).toBe("en");
    expect(pickLocale(undefined, null)).toBe("en");
  });
});
