import { validateSpec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { buildPendingSpec } from "../../src/spec/build-pending-spec.js";

describe("buildPendingSpec", () => {
  it("builds a pending Spec (no fingerprint) that passes validateSpec", () => {
    const result = buildPendingSpec({
      id: "login-submit-btn",
      title: { en: "Submit button" },
      description: { en: "Submits the login form" },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.spec).not.toBeNull();
    expect(result.spec).not.toHaveProperty("fingerprint");
    expect(validateSpec(result.spec).valid).toBe(true);
  });

  it("attaches optional businessRules and tags when provided", () => {
    const result = buildPendingSpec({
      id: "login-submit-btn",
      title: { en: "Submit button" },
      description: { en: "Submits the login form" },
      businessRules: [{ en: "Disabled until the form is valid" }],
      tags: ["auth"],
    });
    expect(result.valid).toBe(true);
    expect(result.spec?.businessRules).toEqual([{ en: "Disabled until the form is valid" }]);
    expect(result.spec?.tags).toEqual(["auth"]);
  });

  it("omits businessRules/tags entirely when not provided", () => {
    const result = buildPendingSpec({
      id: "login-submit-btn",
      title: { en: "Submit button" },
      description: { en: "Submits the login form" },
    });
    expect(result.spec).not.toHaveProperty("businessRules");
    expect(result.spec).not.toHaveProperty("tags");
  });

  it("returns invalid with errors for an empty title locale map", () => {
    const result = buildPendingSpec({
      id: "login-submit-btn",
      title: {},
      description: { en: "Submits the login form" },
    });
    expect(result.valid).toBe(false);
    expect(result.spec).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns invalid for an empty id", () => {
    const result = buildPendingSpec({
      id: "",
      title: { en: "Submit button" },
      description: { en: "Submits the login form" },
    });
    expect(result.valid).toBe(false);
    expect(result.spec).toBeNull();
  });
});
