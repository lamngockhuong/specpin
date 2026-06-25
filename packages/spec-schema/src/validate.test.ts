import { describe, expect, it } from "vitest";
import { validateManifest, validateSpec, validateSpecFile, formatErrors } from "./validate.js";
import type { Manifest, Spec } from "./types.gen.js";

// The canonical example from the Phase 1 spec, section 3.
const exampleSpec: Spec = {
  id: "login-submit-btn",
  title: "Login button",
  description:
    "Calls POST /auth/login. Disabled while loading. Shows inline error on bad credentials.",
  businessRules: [
    "Lock account after 5 consecutive failures within 15 minutes",
    "Redirect to /dashboard if role=admin, else /home",
  ],
  tags: ["auth", "critical"],
  preferredDisplayMode: "modal",
  fingerprint: {
    testId: "login-submit",
    ariaLabel: null,
    id: null,
    cssSelector: "form.login button[type=submit]",
    xpath: "//form[@class='login']//button[@type='submit']",
    domPath: ["form", "button"],
    tagName: "button",
    textContent: "Login",
    attributes: { type: "submit", role: "button" },
    nearbyLabels: ["Email", "Password"],
    positionHint: { index: 0, siblingCount: 1 },
    frameworkHint: "react",
  },
  meta: {
    createdBy: "khuong",
    createdAt: "2026-06-25T08:00:00Z",
    updatedAt: "2026-06-25T08:00:00Z",
    source: "ai-generated",
  },
};

const exampleManifest: Manifest = {
  version: "1.0",
  project: "Acme CRM Frontend",
  domains: ["app.acme.io", "localhost:3000"],
  specFiles: ["login-page.spec.json", "checkout.spec.json"],
  settings: {
    defaultLocale: "vi",
    matchConfidenceThreshold: 0.6,
    defaultDisplayMode: "tooltip",
  },
};

describe("validateSpec", () => {
  it("accepts the canonical example spec", () => {
    const r = validateSpec(exampleSpec);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a spec missing fingerprint with a clear error path", () => {
    const { fingerprint: _fp, ...noFingerprint } = exampleSpec;
    const r = validateSpec(noFingerprint);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => formatErrors([e]).includes("fingerprint"))).toBe(true);
  });

  it("rejects an unknown extra property (additionalProperties:false)", () => {
    const r = validateSpec({ ...exampleSpec, bogus: 1 });
    expect(r.valid).toBe(false);
  });

  it("rejects an empty id", () => {
    const r = validateSpec({ ...exampleSpec, id: "" });
    expect(r.valid).toBe(false);
  });
});

describe("validateSpecFile", () => {
  it("accepts a file wrapping the example spec", () => {
    const r = validateSpecFile({
      $schema: "https://specpin.dev/schema/v1.json",
      group: "Login Page",
      specs: [exampleSpec],
    });
    expect(r.valid).toBe(true);
  });

  it("rejects a file with a malformed spec inside", () => {
    const r = validateSpecFile({ group: "X", specs: [{ id: "x" }] });
    expect(r.valid).toBe(false);
  });
});

describe("validateManifest", () => {
  it("accepts the canonical example manifest", () => {
    const r = validateManifest(exampleManifest);
    expect(r.valid).toBe(true);
  });

  it("rejects a manifest missing project", () => {
    const { project: _p, ...noProject } = exampleManifest;
    const r = validateManifest(noProject);
    expect(r.valid).toBe(false);
  });

  it("rejects an out-of-range matchConfidenceThreshold", () => {
    const r = validateManifest({
      ...exampleManifest,
      settings: { matchConfidenceThreshold: 1.5 },
    });
    expect(r.valid).toBe(false);
  });
});
