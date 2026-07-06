import type { Spec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { cloneFields } from "../src/content/capture-form.js";

const source: Spec = {
  id: "login-btn-abc123",
  title: { en: "Login button" },
  description: { en: "Submits the login form" },
  businessRules: [{ en: "Disabled until the form is valid" }],
  tags: ["auth", "critical"],
  status: "approved",
  verifiedBy: ["tests/login.spec.ts"],
  fingerprint: {
    cssSelector: "#login",
    xpath: "//*[@id='login']",
    domPath: ["button"],
    tagName: "button",
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
  },
  meta: {
    createdBy: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    source: "manual",
    reviewedAt: "2026-02-01T00:00:00.000Z",
    reviewedBy: "alice",
  },
};

describe("cloneFields", () => {
  it("keeps authored content (title, description, rules, tags)", () => {
    const c = cloneFields(source);
    expect(c.title).toEqual({ en: "Login button" });
    expect(c.description).toEqual({ en: "Submits the login form" });
    expect(c.businessRules).toEqual([{ en: "Disabled until the form is valid" }]);
    expect(c.tags).toEqual(["auth", "critical"]);
  });

  it("resets provenance: draft status, no verifiedBy, no review stamp", () => {
    const c = cloneFields(source);
    expect(c.status).toBe("draft");
    expect(c.verifiedBy).toBeUndefined();
    expect(c.meta?.reviewedAt).toBeUndefined();
    expect(c.meta?.reviewedBy).toBeUndefined();
  });

  it("clears the id so it re-derives from the title on save", () => {
    expect(cloneFields(source).id).toBe("");
  });

  it("does not mutate the source spec", () => {
    cloneFields(source);
    expect(source.status).toBe("approved");
    expect(source.verifiedBy).toEqual(["tests/login.spec.ts"]);
    expect(source.meta?.reviewedBy).toBe("alice");
  });
});
