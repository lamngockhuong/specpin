import type { SpecsResponse, SpecWithFile } from "@specpin/api-client";
import { SCHEMA_V1_ID } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import type { ManualBatch } from "../src/shared/config.js";
import { bundleToFiles, exportZipName, sanitizeSpecFileName } from "../src/shared/export-bundle.js";
import { parseLocalBundle } from "../src/sources/local-bundle.js";

function specWithFile(id: string, file: string): SpecWithFile {
  return {
    id,
    title: { en: id },
    description: { en: "desc" },
    fingerprint: {
      cssSelector: "button",
      xpath: "/button",
      domPath: ["button"],
      tagName: "button",
      attributes: {},
      positionHint: { index: 0, siblingCount: 1 },
    },
    _file: file,
  } as unknown as SpecWithFile;
}

function batch(specs: SpecWithFile[], fileGroups?: Record<string, string>): ManualBatch {
  const bundle: SpecsResponse = {
    manifest: { version: "1.0", project: "Acme CRM", domains: ["crm.test"], specFiles: [] },
    specs,
  };
  return {
    id: "b1",
    label: "Acme CRM",
    source: "manual",
    importedAt: 0,
    fileGroups,
    specs: bundle,
  };
}

describe("sanitizeSpecFileName (zip-slip guard)", () => {
  it("drops directory portions and traversal, restricts the charset", () => {
    expect(sanitizeSpecFileName("../../etc/passwd.spec.json")).toBe("passwd.spec.json");
    expect(sanitizeSpecFileName("/abs/login.spec.json")).toBe("login.spec.json");
    expect(sanitizeSpecFileName("a b/weird name!.spec.json")).toBe("weird-name.spec.json");
    expect(sanitizeSpecFileName("..")).toBe("specs.spec.json");
  });
});

describe("bundleToFiles", () => {
  it("rebuilds manifest.json + per-group files, strips _file, sets $schema + group", () => {
    const b = batch([specWithFile("a", "login.spec.json")], { "login.spec.json": "Login" });
    const files = bundleToFiles(b.specs, b.fileGroups);
    expect(Object.keys(files).sort()).toEqual(["login.spec.json", "manifest.json"]);
    const manifest = files["manifest.json"] as { $schema?: string; specFiles: string[] };
    expect(manifest.$schema).toBe(SCHEMA_V1_ID);
    expect(manifest.specFiles).toEqual(["login.spec.json"]);
    const file = files["login.spec.json"] as { $schema: string; group: string; specs: unknown[] };
    expect(file.$schema).toBe(SCHEMA_V1_ID);
    expect(file.group).toBe("Login");
    expect(file.specs[0]).not.toHaveProperty("_file");
  });

  it("falls back to a file-base group when fileGroups has none (pre-plan batch)", () => {
    const b = batch([specWithFile("a", "dashboard.spec.json")]);
    const files = bundleToFiles(b.specs, b.fileGroups);
    expect((files["dashboard.spec.json"] as { group: string }).group).toBe("Dashboard");
  });

  it("round-trips through parseLocalBundle (specs + group preserved)", () => {
    const original = batch(
      [specWithFile("login-btn", "login.spec.json"), specWithFile("nav", "nav.spec.json")],
      { "login.spec.json": "Login", "nav.spec.json": "Navigation" },
    );
    const files = bundleToFiles(original.specs, original.fileGroups);
    // Split into the { manifest, files } envelope the picker/parse expects.
    const { "manifest.json": manifest, ...specFiles } = files;
    const parsed = parseLocalBundle(JSON.stringify({ manifest, files: specFiles }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.specs?.specs.map((s) => s.id).sort()).toEqual(["login-btn", "nav"]);
    expect(parsed.fileGroups).toEqual({
      "login.spec.json": "Login",
      "nav.spec.json": "Navigation",
    });
  });
});

describe("exportZipName", () => {
  it("slugifies the project into <slug>.specs.zip", () => {
    expect(exportZipName("Acme CRM")).toBe("acme-crm.specs.zip");
    expect(exportZipName("")).toBe("specpin-export.specs.zip");
  });
});
