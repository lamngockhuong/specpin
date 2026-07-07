import { describe, expect, it } from "vitest";
import { parseLocalBundle, parseLocalFiles } from "../src/sources/local-bundle.js";

const manifest = {
  $schema: "https://specpin.ohnice.app/schema/v1.json",
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

  it("retains each file's group in fileGroups (the flatten drops it from specs)", () => {
    const { fileGroups, errors } = parseLocalBundle(
      bundle({ manifest, files: { "login.spec.json": specFile } }),
    );
    expect(errors).toEqual([]);
    expect(fileGroups).toEqual({ "login.spec.json": "Login" });
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

  it("parses valid guides.json / views.json / required.json alongside specs", () => {
    const { specs, guides, views, required, errors } = parseLocalBundle(
      bundle({
        manifest,
        files: {
          "login.spec.json": specFile,
          "guides.json": { version: "1.0", guides: [{ id: "g", name: "Guide", steps: [] }] },
          "views.json": { version: "1.0", hidden: ["tag:legacy"] },
          "required.json": { version: "1.0", required: ["login-btn"] },
        },
      }),
    );
    expect(errors).toEqual([]);
    expect(specs?.specs).toHaveLength(1); // configs are not counted as specs
    expect(guides?.guides).toHaveLength(1);
    expect(views?.hidden).toEqual(["tag:legacy"]);
    expect(required?.required).toEqual(["login-btn"]);
  });

  it("reports a clear error for a schema-invalid config file", () => {
    const { specs, errors } = parseLocalBundle(
      bundle({
        manifest,
        files: {
          "login.spec.json": specFile,
          "views.json": { version: "1.0" }, // missing required `hidden`
        },
      }),
    );
    expect(specs).toBeUndefined();
    expect(errors.some((e) => e.startsWith("views.json:"))).toBe(true);
  });
});

describe("parseLocalFiles", () => {
  const manifestFile = { name: "manifest.json", text: JSON.stringify(manifest) };
  const loginFile = { name: "login.spec.json", text: JSON.stringify(specFile) };

  it("assembles manifest + spec files into a valid bundle", () => {
    const { specs, errors } = parseLocalFiles([manifestFile, loginFile]);
    expect(errors).toEqual([]);
    expect(specs?.specs).toHaveLength(1);
    expect(specs?.specs[0]._file).toBe("login.spec.json");
    expect(specs?.manifest.project).toBe("Test");
  });

  it("merges multiple spec files", () => {
    const profile = { name: "profile.spec.json", text: JSON.stringify(specFile) };
    const { specs, errors } = parseLocalFiles([manifestFile, loginFile, profile]);
    expect(errors).toEqual([]);
    expect(specs?.specs).toHaveLength(2);
  });

  it("tolerates path-prefixed names (webkitRelativePath)", () => {
    const { specs } = parseLocalFiles([
      { name: ".specs/manifest.json", text: JSON.stringify(manifest) },
      { name: ".specs/login.spec.json", text: JSON.stringify(specFile) },
    ]);
    expect(specs?.specs).toHaveLength(1);
  });

  it("errors when no manifest.json is selected", () => {
    const { specs, errors } = parseLocalFiles([loginFile]);
    expect(specs).toBeUndefined();
    expect(errors.some((e) => /no manifest\.json/i.test(e))).toBe(true);
  });

  it("errors when no spec file is selected", () => {
    const { specs, errors } = parseLocalFiles([manifestFile]);
    expect(specs).toBeUndefined();
    expect(errors.some((e) => /no \*\.spec\.json/i.test(e))).toBe(true);
  });

  it("rejects two manifest files", () => {
    const { specs, errors } = parseLocalFiles([manifestFile, manifestFile, loginFile]);
    expect(specs).toBeUndefined();
    expect(errors.some((e) => /multiple manifest/i.test(e))).toBe(true);
  });

  it("rejects an unexpected file name", () => {
    const { specs, errors } = parseLocalFiles([manifestFile, { name: "notes.txt", text: "{}" }]);
    expect(specs).toBeUndefined();
    expect(errors.some((e) => /expected manifest\.json/i.test(e))).toBe(true);
  });

  it("routes .specs/ config files through the shared validation path", () => {
    const { specs, guides, views, required, errors } = parseLocalFiles([
      manifestFile,
      loginFile,
      { name: "guides.json", text: JSON.stringify({ version: "1.0", guides: [] }) },
      { name: ".specs/views.json", text: JSON.stringify({ version: "1.0", hidden: ["spec:x"] }) },
      { name: "required.json", text: JSON.stringify({ version: "1.0", required: [] }) },
    ]);
    expect(errors).toEqual([]);
    expect(specs?.specs).toHaveLength(1);
    expect(guides).toEqual({ version: "1.0", guides: [] });
    expect(views?.hidden).toEqual(["spec:x"]);
    expect(required).toEqual({ version: "1.0", required: [] });
  });

  it("reports invalid JSON per file", () => {
    const { specs, errors } = parseLocalFiles([
      manifestFile,
      { name: "login.spec.json", text: "{ not json" },
    ]);
    expect(specs).toBeUndefined();
    expect(errors[0]).toMatch(/login\.spec\.json: invalid json/i);
  });

  it("delegates schema validation to parseLocalBundle", () => {
    const broken = {
      name: "x.spec.json",
      text: JSON.stringify({ group: "X", specs: [{ id: "x" }] }),
    };
    const { specs, errors } = parseLocalFiles([manifestFile, broken]);
    expect(specs).toBeUndefined();
    expect(errors.some((e) => e.startsWith("x.spec.json:"))).toBe(true);
  });
});
