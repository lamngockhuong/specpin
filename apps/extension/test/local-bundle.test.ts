import { describe, expect, it } from "vitest";
import { parseLocalBundle } from "../src/sources/local-bundle.js";

const manifest = {
  $schema: "https://specpin.dev/schema/v1.json",
  version: "1.0",
  project: "Test",
  domains: ["localhost:3000"],
  specFiles: ["login.spec.json"],
};

const specFile = {
  group: "Login",
  specs: [
    {
      id: "login-btn",
      title: { en: "Log in" },
      description: { en: "submits the form" },
      fingerprint: {
        cssSelector: "button",
        xpath: "/button",
        domPath: ["button"],
        tagName: "button",
        attributes: {},
        positionHint: { index: 0, siblingCount: 1 },
      },
    },
  ],
};

function bundle(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("parseLocalBundle", () => {
  it("accepts a valid bundle and flattens specs with _file", () => {
    const { specs, errors } = parseLocalBundle(
      bundle({ manifest, files: { "login.spec.json": specFile } }),
    );
    expect(errors).toEqual([]);
    expect(specs?.specs).toHaveLength(1);
    expect(specs?.specs[0]._file).toBe("login.spec.json");
    expect(specs?.manifest.project).toBe("Test");
  });

  it("rejects malformed JSON", () => {
    const { specs, errors } = parseLocalBundle("{ not json ");
    expect(specs).toBeUndefined();
    expect(errors[0]).toMatch(/invalid json/i);
  });

  it("rejects prototype-pollution keys", () => {
    const { specs, errors } = parseLocalBundle(
      '{"manifest":{},"files":{"__proto__":{"polluted":true}}}',
    );
    expect(specs).toBeUndefined();
    expect(errors[0]).toMatch(/forbidden key/i);
  });

  it("rejects a schema-invalid spec file", () => {
    const broken = { group: "X", specs: [{ id: "x" }] }; // missing title/description/fingerprint
    const { specs, errors } = parseLocalBundle(
      bundle({ manifest, files: { "x.spec.json": broken } }),
    );
    expect(specs).toBeUndefined();
    expect(errors.some((e) => e.startsWith("x.spec.json:"))).toBe(true);
  });

  it("rejects a file name not ending in .spec.json", () => {
    const { specs, errors } = parseLocalBundle(
      bundle({ manifest, files: { "login.json": specFile } }),
    );
    expect(specs).toBeUndefined();
    expect(errors[0]).toMatch(/must end with \.spec\.json/);
  });

  it("rejects too many files (size cap)", () => {
    const files: Record<string, unknown> = {};
    for (let i = 0; i < 101; i++) files[`f${i}.spec.json`] = {};
    const { specs, errors } = parseLocalBundle(bundle({ manifest, files }));
    expect(specs).toBeUndefined();
    expect(errors[0]).toMatch(/too many files/i);
  });

  it("requires manifest and files", () => {
    expect(parseLocalBundle('{"files":{}}').errors[0]).toMatch(/manifest/i);
    expect(parseLocalBundle('{"manifest":{}}').errors[0]).toMatch(/files/i);
  });
});
