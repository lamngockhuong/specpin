import type { ElementFingerprint } from "@specpin/spec-schema";
import { validateSpec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { buildSpec, type CaptureFields } from "../src/content/capture-form.js";

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
  title: "Login Button",
  description: "Submits the login form",
  businessRules: ["Lock after 5 failures", ""],
  tags: ["auth", " critical "],
  preferredDisplayMode: "sidebar",
};

describe("buildSpec", () => {
  it("produces a schema-valid spec", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    const result = validateSpec(spec);
    expect(result.valid).toBe(true);
  });

  it("sets manual provenance and timestamps", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.meta?.source).toBe("manual");
    expect(spec.meta?.createdAt).toBe("2026-06-25T08:00:00Z");
    expect(spec.meta?.updatedAt).toBe("2026-06-25T08:00:00Z");
  });

  it("slugifies the title into the id and trims/filters lists", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.id).toBe("login-button-ab12cd");
    expect(spec.businessRules).toEqual(["Lock after 5 failures"]);
    expect(spec.tags).toEqual(["auth", "critical"]);
    expect(spec.preferredDisplayMode).toBe("sidebar");
  });

  it("falls back to a non-empty id when the title is symbols only", () => {
    const spec = buildSpec({ ...fields, title: "!!!" }, fingerprint, "2026-06-25T08:00:00Z", "x1");
    expect(spec.id).toBe("spec-x1");
    expect(validateSpec(spec).valid).toBe(true);
  });
});
