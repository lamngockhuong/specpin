// Sync the canonical skill (apps/cli/skill/) into every checked-in copy of it.
// This mirrors how `make sync-schema` copies the SSOT schema into the Go embed
// location: one source of truth, checked-in copies, and a drift gate.
//
// Two destinations today:
//   apps/cli/npm/skill/                  ships in the published npm tarball,
//                                        reachable via unpkg/jsdelivr
//   plugins/specpin/skills/specpin/      ships in the Claude Code / Codex plugin,
//                                        fetched by git from this repo
//
//   node scripts/sync-skill.mjs          copy source -> all destinations (default)
//   node scripts/sync-skill.mjs --check  exit non-zero if ANY destination differs (CI gate)
//
// Both copies are real checked-in directories rather than symlinks: npm tarballs
// do not reliably follow symlinks across environments, and a git-fetched plugin
// has the same problem. --check is what keeps them honest.

import { readdir, readFile, cp, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/cli/npm/scripts
const SRC = join(here, "..", "..", "skill"); // apps/cli/skill
const ROOT = join(here, "..", "..", "..", ".."); // repo root

const DESTS = [
  { label: "npm", path: join(here, "..", "skill") },
  { label: "plugin", path: join(ROOT, "plugins", "specpin", "skills", "specpin") },
];

// The destinations are derived from import.meta.url, never from argv, so they
// cannot be steered outside the repo. Assert it anyway: each destination is
// rm -rf'd before it is copied into, so a miscounted "../" in the lines above
// would otherwise delete the wrong tree. Note ROOT itself must be REJECTED,
// not allowed: a destination that resolves to the repo root would wipe the
// whole checkout. Same for the canonical source, which is never a destination.
for (const { label, path } of DESTS) {
  if (!path.startsWith(ROOT + sep)) {
    console.error(`sync-skill: destination "${label}" is not safely inside the repo: ${path}`);
    process.exit(1);
  }
  if (path === SRC) {
    console.error(`sync-skill: destination "${label}" is the canonical source itself: ${path}`);
    process.exit(1);
  }
}

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
  for (const { label, path } of DESTS) {
    // Clear the destination so deletions in source propagate, then copy fresh.
    // Name the failing target: a bare stack trace does not say which of the
    // destinations died, and a mid-loop failure leaves one synced and one not.
    try {
      await rm(path, { recursive: true, force: true });
      await cp(SRC, path, { recursive: true });
    } catch (err) {
      console.error(`sync-skill: failed to sync "${label}" (${path}): ${err.message}`);
      console.error("Other destinations may be left un-synced; re-run after fixing.");
      process.exit(1);
    }
    console.log(
      `sync-skill: copied ${files.length} file(s) -> ${relative(process.cwd(), path)} (${label})`,
    );
  }
}

// Compare one destination against the source. Returns a list of human-readable
// drift descriptions, empty when the destination is in sync.
async function diffDest(srcFiles, destPath) {
  const dstFiles = await listFiles(destPath);
  const offending = [];

  const srcSet = new Set(srcFiles);
  const dstSet = new Set(dstFiles);
  for (const rel of srcFiles) if (!dstSet.has(rel)) offending.push(`missing in copy: ${rel}`);
  for (const rel of dstFiles) if (!srcSet.has(rel)) offending.push(`stale in copy: ${rel}`);

  for (const rel of srcFiles) {
    if (!dstSet.has(rel)) continue;
    const [a, b] = await Promise.all([readFile(join(SRC, rel)), readFile(join(destPath, rel))]);
    if (!a.equals(b)) offending.push(`content differs: ${rel}`);
  }

  return offending;
}

async function check() {
  const srcFiles = await listFiles(SRC);
  // Check every destination before exiting: reporting only the first drifting
  // target would cost a second CI run to discover the second one.
  const drifted = [];
  for (const { label, path } of DESTS) {
    const offending = await diffDest(srcFiles, path);
    if (offending.length > 0) drifted.push({ label, path, offending });
  }

  if (drifted.length > 0) {
    console.error("sync-skill: checked-in copies drifted from apps/cli/skill/:");
    for (const { label, path, offending } of drifted) {
      console.error(`  [${label}] ${relative(process.cwd(), path)}`);
      for (const o of offending) console.error(`    ${o}`);
    }
    console.error("Run `npm run sync-skill` in apps/cli/npm to re-sync.");
    process.exit(1);
  }
  console.log(`sync-skill: ${DESTS.length} checked-in copies in sync`);
}

if (process.argv.includes("--check")) await check();
else await copy();
