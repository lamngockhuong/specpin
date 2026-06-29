import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";
import { compile } from "json-schema-to-typescript";

// Regenerate src/types.gen.ts from schema/v1.json. The schema is the single
// source of truth; never hand-edit the generated types. CI fails on drift.
//
// The canonical v1.json root validates a SpecFile. To emit ALL entity types
// (including Manifest, which SpecFile does not reference), we compile a small
// synthetic root that references both top-level roots; every reachable $def is
// then declared. The synthetic wrapper itself is not re-exported by index.ts.
const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../schema/v1.json");
const typesOutPath = resolve(here, "../src/types.gen.ts");
const schemaOutPath = resolve(here, "../src/schema.gen.ts");
const validatorsOutPath = resolve(here, "../src/validators.gen.cjs");
const validatorsDtsPath = resolve(here, "../src/validators.gen.d.cts");

const schemaText = await readFile(schemaPath, "utf8");
const schema = JSON.parse(schemaText);

const genRoot = {
  $schema: schema.$schema,
  $id: "https://specpin.ohnice.app/schema/v1.types.json",
  title: "SpecpinSchemaRoots",
  type: "object",
  required: ["specFile", "manifest", "views", "guides"],
  additionalProperties: false,
  properties: {
    specFile: { $ref: "#/$defs/SpecFile" },
    manifest: { $ref: "#/$defs/Manifest" },
    // ViewsConfig is not referenced by SpecFile/Manifest; reference it here so the
    // type emitter declares its interface (like Manifest above).
    views: { $ref: "#/$defs/ViewsConfig" },
    // GuidesConfig (and GuideDef) are likewise unreferenced by the roots above;
    // reference here so their interfaces are emitted.
    guides: { $ref: "#/$defs/GuidesConfig" },
  },
  $defs: schema.$defs,
};

const banner = [
  "/* eslint-disable */",
  "/**",
  " * Generated from schema/v1.json by json-schema-to-typescript.",
  " * DO NOT EDIT BY HAND. Run `pnpm --filter @specpin/spec-schema gen`.",
  " */",
].join("\n");

const ts = await compile(genRoot, "SpecpinSchemaRoots", {
  bannerComment: banner,
  additionalProperties: false,
  declareExternallyReferenced: true,
  enableConstEnums: false,
});

await writeFile(typesOutPath, ts);
console.log(`Wrote ${typesOutPath}`);

// Emit the schema as a TS module so consumers (and the tsc build) can import it
// without pulling JSON from outside rootDir. The .json file remains the SSOT
// (the Go CLI embeds it directly); this module is regenerated from it.
const schemaModule = [
  "/* eslint-disable */",
  "/**",
  " * Generated from schema/v1.json. DO NOT EDIT BY HAND.",
  " * Run `pnpm --filter @specpin/spec-schema gen`.",
  " */",
  `export const schemaV1: Record<string, unknown> = ${JSON.stringify(schema, null, 2)};`,
  "",
].join("\n");

await writeFile(schemaOutPath, schemaModule);
console.log(`Wrote ${schemaOutPath}`);

// Precompile the validators to standalone code at build time. Ajv's default
// runtime compilation calls `new Function(...)`, which a content script inherits
// the host page's CSP for; pages without `unsafe-eval` make Ajv throw "Error
// compiling schema". Standalone code is plain functions (no eval) and is emitted
// as CommonJS so the two runtime helpers it pulls in (ajv/dist/runtime/* and
// ajv-formats/dist/formats) resolve via require() under any bundler. ESM consumers
// import the named exports through Node's CJS interop.
const schemaId = schema.$id as string;
const standaloneAjv = new Ajv2020({ allErrors: true, strict: false, code: { source: true } });
addFormats(standaloneAjv);
standaloneAjv.addSchema(schema);
const validatorsCode = standaloneCode(standaloneAjv, {
  validateSpecFile: schemaId,
  validateSpec: `${schemaId}#/$defs/Spec`,
  validateManifest: `${schemaId}#/$defs/Manifest`,
  validateViews: `${schemaId}#/$defs/ViewsConfig`,
  validateGuides: `${schemaId}#/$defs/GuidesConfig`,
});

const validatorsBanner = [
  "/* eslint-disable */",
  "// @generated from schema/v1.json by ajv standalone codegen. DO NOT EDIT BY HAND.",
  "// Run `pnpm --filter @specpin/spec-schema gen`.",
  "",
].join("\n");

await writeFile(validatorsOutPath, `${validatorsBanner + validatorsCode}\n`);
console.log(`Wrote ${validatorsOutPath}`);

const validatorsDts = [
  "/* eslint-disable */",
  "// Generated alongside validators.gen.cjs. DO NOT EDIT BY HAND.",
  'import type { ValidateFunction } from "ajv";',
  "export const validateSpecFile: ValidateFunction;",
  "export const validateSpec: ValidateFunction;",
  "export const validateManifest: ValidateFunction;",
  "export const validateViews: ValidateFunction;",
  "export const validateGuides: ValidateFunction;",
  "",
].join("\n");

await writeFile(validatorsDtsPath, validatorsDts);
console.log(`Wrote ${validatorsDtsPath}`);
