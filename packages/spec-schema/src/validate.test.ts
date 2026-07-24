import { describe, expect, it } from "vitest";
import type { Manifest, ShotConfig, Spec } from "./types.gen.js";
import { validateManifest, validateShot, validateSpec, validateSpecFile } from "./validate.js";

// The canonical example from the Phase 1 spec, section 3.
const exampleSpec: Spec = {
  id: "login-submit-btn",
  title: { en: "Login button" },
  description: {
    en: "Calls POST /auth/login. Disabled while loading. Shows inline error on bad credentials.",
  },
  businessRules: [
    { en: "Lock account after 5 consecutive failures within 15 minutes" },
    { en: "Redirect to /dashboard if role=admin, else /home" },
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

  it("accepts a spec missing fingerprint as a pending (unpinned) spec", () => {
    const { fingerprint: _fp, ...noFingerprint } = exampleSpec;
    const r = validateSpec(noFingerprint);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
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
      $schema: "https://specpin.ohnice.app/schema/v1.json",
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

const exampleShot: ShotConfig = {
  version: "1",
  screenId: "checkout",
  image:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  items: [{ itemNo: "1", bbox: { startX: 0, startY: 0, endX: 10, endY: 10 }, specId: "cta" }],
};

describe("validateShot", () => {
  it("accepts a well-formed shot artifact", () => {
    const r = validateShot(exampleShot);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a shot missing screenId", () => {
    const { screenId: _s, ...noScreen } = exampleShot;
    expect(validateShot(noScreen).valid).toBe(false);
  });

  it("rejects a negative bbox coordinate", () => {
    const r = validateShot({
      ...exampleShot,
      items: [{ itemNo: "1", bbox: { startX: -1, startY: 0, endX: 10, endY: 10 } }],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects a malformed itemNo", () => {
    const r = validateShot({
      ...exampleShot,
      items: [{ itemNo: "0.1", bbox: { startX: 0, startY: 0, endX: 1, endY: 1 } }],
    });
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
