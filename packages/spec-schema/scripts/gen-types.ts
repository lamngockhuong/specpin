import { compile } from "json-schema-to-typescript";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

const schemaText = await readFile(schemaPath, "utf8");
const schema = JSON.parse(schemaText);

const genRoot = {
  $schema: schema.$schema,
  $id: "https://specpin.dev/schema/v1.types.json",
  title: "SpecpinSchemaRoots",
  type: "object",
  required: ["specFile", "manifest"],
  additionalProperties: false,
  properties: {
    specFile: { $ref: "#/$defs/SpecFile" },
    manifest: { $ref: "#/$defs/Manifest" },
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
