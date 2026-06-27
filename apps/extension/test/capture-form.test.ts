import type { ElementFingerprint } from "@specpin/spec-schema";
import { validateSpec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { buildSpec, type CaptureFields, mergeLocalized } from "../src/content/capture-form.js";

const fingerprint: ElementFingerprint = {
  cssSelector: "form.login button",
  xpath: "/form/button",
  domPath: ["form", "button"],
  tagName: "button",
  attributes: { type: "submit" },
  positionHint: { index: 0, siblingCount: 1 },
  testId: "login-submit",
};

const fields: CaptureFields = {
  byLocale: {
    en: {
      title: "Login Button",
      description: "Submits the login form",
      businessRules: ["Lock after 5 failures", ""],
    },
  },
  defaultLocale: "en",
  tags: ["auth", " critical "],
  preferredDisplayMode: "sidebar",
};

describe("buildSpec", () => {
  it("produces a schema-valid spec", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("sets manual provenance and timestamps", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.meta?.source).toBe("manual");
    expect(spec.meta?.createdAt).toBe("2026-06-25T08:00:00Z");
    expect(spec.meta?.updatedAt).toBe("2026-06-25T08:00:00Z");
  });

  it("slugifies the default-locale title into the id and trims/filters lists", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.id).toBe("login-button-ab12cd");
    expect(spec.title).toEqual({ en: "Login Button" });
    expect(spec.businessRules).toEqual([{ en: "Lock after 5 failures" }]);
    expect(spec.tags).toEqual(["auth", "critical"]);
    expect(spec.preferredDisplayMode).toBe("sidebar");
  });

  it("falls back to a non-empty id when the title is symbols only", () => {
    const symbolFields: CaptureFields = {
      ...fields,
      byLocale: { en: { ...fields.byLocale.en, title: "!!!" } },
    };
    const spec = buildSpec(symbolFields, fingerprint, "2026-06-25T08:00:00Z", "x1");
    expect(spec.id).toBe("spec-x1");
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("collects every locale's title/description and pairs rules by line", () => {
    const multi: CaptureFields = {
      byLocale: {
        en: { title: "Login", description: "Submits", businessRules: ["Lock account"] },
        vi: { title: "Đăng nhập", description: "Gửi biểu mẫu", businessRules: ["Khoá tài khoản"] },
      },
      defaultLocale: "en",
      tags: [],
    };
    const spec = buildSpec(multi, fingerprint, "2026-06-25T08:00:00Z", "m1");
    expect(spec.title).toEqual({ en: "Login", vi: "Đăng nhập" });
    expect(spec.description).toEqual({ en: "Submits", vi: "Gửi biểu mẫu" });
    expect(spec.businessRules).toEqual([{ en: "Lock account", vi: "Khoá tài khoản" }]);
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("adding a third locale keeps the existing ones intact", () => {
    const three: CaptureFields = {
      byLocale: {
        en: { title: "Login", description: "Submits", businessRules: [] },
        vi: { title: "Đăng nhập", description: "Gửi", businessRules: [] },
        ja: { title: "ログイン", description: "送信", businessRules: [] },
      },
      defaultLocale: "en",
      tags: [],
    };
    const spec = buildSpec(three, fingerprint, "2026-06-25T08:00:00Z", "t1");
    expect(spec.title).toEqual({ en: "Login", vi: "Đăng nhập", ja: "ログイン" });
    expect(validateSpec(spec).valid).toBe(true);
  });
});

describe("mergeLocalized", () => {
  it("adds a locale without dropping existing ones", () => {
    expect(mergeLocalized({ en: "Login" }, "vi", "Đăng nhập")).toEqual({
      en: "Login",
      vi: "Đăng nhập",
    });
  });

  it("removes a locale when its value is blank", () => {
    expect(mergeLocalized({ en: "Login", vi: "x" }, "vi", "  ")).toEqual({ en: "Login" });
  });
});
