import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// tsc only emits the .ts sources; the generated standalone validator module is
// CommonJS (.cjs) and must be copied into dist so built consumers can import it.
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../src/validators.gen.cjs");
const distDir = resolve(here, "../dist");
const dest = resolve(distDir, "validators.gen.cjs");

await mkdir(distDir, { recursive: true });
await copyFile(src, dest);
console.log(`Copied ${src} -> ${dest}`);
