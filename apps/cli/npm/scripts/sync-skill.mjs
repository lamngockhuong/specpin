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
// --check also asserts the two hand-maintained plugin manifests agree on
// identity (name/version/license/repository/homepage). That is not a skill
// sync, but it is the same "checked-in copies must not drift" problem and it
// rides a step CI already runs, which beats a second script for one assertion.
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

// `expect` is the destination's repo-relative path, spelled out so the "../"
// counting above is machine-checked rather than eyeballed.
//
// Note the plugin destination is `skills/specpin`, NOT `skills`: its sibling
// `plugins/specpin/skills/number-ui-image/` is hand-authored and has no source
// elsewhere in the repo. Since each destination is rm -rf'd before it is copied
// into, shortening this path by one segment would silently delete that skill.
const DESTS = [
  { label: "npm", path: join(here, "..", "skill"), expect: join("apps", "cli", "npm", "skill") },
  {
    label: "plugin",
    path: join(ROOT, "plugins", "specpin", "skills", "specpin"),
    expect: join("plugins", "specpin", "skills", "specpin"),
  },
];

// Destinations come from import.meta.url, never from argv, so they cannot be
// steered outside the repo. Assert it anyway — a miscounted "../" above would
// otherwise point rm -rf at the wrong tree. Checking against `expect` catches
// both a wrong depth and a truncated path; the repo-root and canonical-source
// cases are called out separately because those two are the catastrophic ones.
for (const { label, path, expect } of DESTS) {
  if (!path.startsWith(ROOT + sep)) {
    console.error(`sync-skill: destination "${label}" is not safely inside the repo: ${path}`);
    process.exit(1);
  }
  if (path === SRC) {
    console.error(`sync-skill: destination "${label}" is the canonical source itself: ${path}`);
    process.exit(1);
  }
  const actual = relative(ROOT, path);
  if (actual !== expect) {
    console.error(`sync-skill: destination "${label}" resolved to ${actual}, expected ${expect}`);
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
      // Name the target and keep the original error: a bare rejection does not
      // say which destination died, and swallowing the stack makes an
      // unexpected class (EPERM, EBUSY) harder to diagnose than no catch at all.
      console.error(`sync-skill: failed to sync "${label}" (${path});`);
      console.error("other destinations may be left un-synced; re-run after fixing.");
      throw err;
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

// The Claude and Codex plugin manifests are hand-maintained side by side and
// must agree on identity. Nothing else in the repo compares them, so a version
// bump applied to one and not the other would ship two different versions to
// the two hosts, silently. Checked here rather than in a script of its own so
// it rides the --check step CI already runs.
const MANIFESTS = [
  join(ROOT, "plugins", "specpin", ".claude-plugin", "plugin.json"),
  join(ROOT, "plugins", "specpin", ".codex-plugin", "plugin.json"),
];
const MANIFEST_SHARED_FIELDS = ["name", "version", "license", "repository", "homepage"];

async function diffManifests() {
  const parsed = [];
  for (const file of MANIFESTS) {
    try {
      parsed.push({ file, json: JSON.parse(await readFile(file, "utf8")) });
    } catch (err) {
      return [`${relative(ROOT, file)}: unreadable or invalid JSON (${err.message})`];
    }
  }

  const [a, b] = parsed;
  return MANIFEST_SHARED_FIELDS.filter((f) => a.json[f] !== b.json[f]).map(
    (f) =>
      `${f}: ${relative(ROOT, a.file)} has ${JSON.stringify(a.json[f])}, ` +
      `${relative(ROOT, b.file)} has ${JSON.stringify(b.json[f])}`,
  );
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

  const manifestDrift = await diffManifests();

  // Report both classes of drift before exiting, for the same reason the
  // destination loop above does not exit early: one CI run, every problem.
  if (drifted.length > 0) {
    console.error("sync-skill: checked-in copies drifted from apps/cli/skill/:");
    for (const { label, path, offending } of drifted) {
      console.error(`  [${label}] ${relative(process.cwd(), path)}`);
      for (const o of offending) console.error(`    ${o}`);
    }
    console.error("Run `npm run sync-skill` in apps/cli/npm to re-sync.");
  }
  if (manifestDrift.length > 0) {
    console.error("sync-skill: plugin manifests disagree:");
    for (const d of manifestDrift) console.error(`  ${d}`);
    console.error("Keep .claude-plugin/plugin.json and .codex-plugin/plugin.json in step.");
  }
  if (drifted.length > 0 || manifestDrift.length > 0) process.exit(1);

  console.log(`sync-skill: ${DESTS.length} checked-in copies in sync, plugin manifests agree`);
}

if (process.argv.includes("--check")) await check();
else await copy();
