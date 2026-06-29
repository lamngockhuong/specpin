// Copies the spec-schema SSOT into Astro's public/ so the site serves it at
// /schema/v1.json, matching the schema's $id (https://specpin.ohnice.app/schema/v1.json).
// Runs before `astro build` and `astro dev`. The copy is gitignored and never
// hand-edited: packages/spec-schema/schema/v1.json is the single source of truth,
// same discipline as the embedded Go copy synced by `make sync-schema`.
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../packages/spec-schema/schema/v1.json");
const targetDir = resolve(here, "../public/schema");
const target = resolve(targetDir, "v1.json");

await mkdir(targetDir, { recursive: true });
// copyFile throws ENOENT (naming source + target) if the SSOT is missing.
await copyFile(source, target);
console.log(`[sync-schema] ${source} -> ${target}`);
