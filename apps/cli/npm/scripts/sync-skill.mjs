// Sync the canonical skill (apps/cli/skill/) into the npm package
// (apps/cli/npm/skill/) so it ships in the published tarball and is reachable
// via unpkg/jsdelivr. This mirrors how `make sync-schema` copies the SSOT
// schema into the Go embed location: one source of truth, a checked-in copy,
// and a drift gate.
//
//   node scripts/sync-skill.mjs          copy source -> bundled (default)
//   node scripts/sync-skill.mjs --check  exit non-zero if they differ (CI gate)
//
// npm tarballs do not reliably follow symlinks across environments, so the
// bundled copy is a real checked-in directory kept honest by --check.

import { readdir, readFile, cp, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "skill"); // apps/cli/skill
const DST = join(here, "..", "skill"); // apps/cli/npm/skill

// Recursively list files (relative paths) under a directory. Returns [] if the
// directory is absent rather than throwing, so --check can report a clean miss.
async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else out.push(relative(root, abs));
    }
  }
  await walk(root);
  return out.sort();
}

async function copy() {
  const files = await listFiles(SRC);
  if (files.length === 0) {
    console.error(`sync-skill: no files under ${SRC}; nothing to sync`);
    process.exit(1);
  }
  // Clear the destination so deletions in source propagate, then copy fresh.
  await rm(DST, { recursive: true, force: true });
  await cp(SRC, DST, { recursive: true });
  console.log(`sync-skill: copied ${files.length} file(s) -> ${relative(process.cwd(), DST)}`);
}

async function check() {
  const [srcFiles, dstFiles] = await Promise.all([listFiles(SRC), listFiles(DST)]);
  const offending = [];

  const srcSet = new Set(srcFiles);
  const dstSet = new Set(dstFiles);
  for (const rel of srcFiles) if (!dstSet.has(rel)) offending.push(`missing in bundle: ${rel}`);
  for (const rel of dstFiles) if (!srcSet.has(rel)) offending.push(`stale in bundle: ${rel}`);

  for (const rel of srcFiles) {
    if (!dstSet.has(rel)) continue;
    const [a, b] = await Promise.all([readFile(join(SRC, rel)), readFile(join(DST, rel))]);
    if (!a.equals(b)) offending.push(`content differs: ${rel}`);
  }

  if (offending.length > 0) {
    console.error("sync-skill: bundled skill drifted from apps/cli/skill/:");
    for (const o of offending) console.error(`  ${o}`);
    console.error("Run `npm run sync-skill` in apps/cli/npm to re-sync.");
    process.exit(1);
  }
  console.log("sync-skill: bundled skill in sync");
}

if (process.argv.includes("--check")) await check();
else await copy();
