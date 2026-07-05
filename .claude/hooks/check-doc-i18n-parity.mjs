#!/usr/bin/env node
// Stop hook: warn when a source (default-locale) doc changed on this branch but a
// locale mirror that already exists on disk was NOT updated alongside it.
//
// Why this exists: our docs live in two i18n layouts (repo `docs/` with a `vi`
// mirror, and the Astro site with `vi`+`ja` mirrors). It is easy to edit the
// English source and forget one of the translated copies. This audits the whole
// branch diff (committed + uncommitted) once, at the end of a turn.
//
// Detection rule (deliberately low-noise):
//   - Only files whose DEFAULT-locale (source) variant changed are checked.
//   - For each configured locale, if that mirror file EXISTS but is not in the
//     changed set, it is flagged. Missing (never-translated) mirrors are ignored,
//     and locale-only edits (e.g. a vi typo fix) never trigger a warning.
//
// Behavior: exits 2 with a message so Claude fixes it in-session; guarded against
// loops via `stop_hook_active`. Fails OPEN (exit 0) on any infra error so it can
// never wedge a session.
//
// Diagnostic mode (no stdin, never blocks):
//   node check-doc-i18n-parity.mjs --diff <baseRef> <headRef>
// prints the findings for a given ref range — handy for testing/debugging.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Project-specific i18n roots. `locales` are the subdirectories under `root`
// that hold translations; the default locale (source) is the files that live
// directly under `root` (i.e. NOT under one of these locale subdirs).
const I18N_ROOTS = [
  { root: "docs", locales: ["vi"], exts: [".md"] },
  { root: "apps/web/src/content/docs", locales: ["vi", "ja"], exts: [".md", ".mdx"] },
];

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function lines(s) {
  return s.split("\n").map((l) => l.trim()).filter(Boolean);
}

function addLines(set, text) {
  for (const p of lines(text)) set.add(p);
}

function ext(path) {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i);
}

// Classify a repo-relative path into { cfg, locale, logical } or null if it is
// not a tracked doc under an i18n root with a matching extension. Roots must not
// be path-prefixes of each other (they aren't here: `docs` vs the apps/ path).
function classify(path) {
  for (const cfg of I18N_ROOTS) {
    const prefix = `${cfg.root}/`;
    if (!path.startsWith(prefix)) continue;
    if (!cfg.exts.includes(ext(path))) return null;
    const rel = path.slice(prefix.length);
    const seg = rel.split("/")[0];
    if (cfg.locales.includes(seg)) {
      return { cfg, locale: seg, logical: rel.slice(seg.length + 1) };
    }
    return { cfg, locale: "en", logical: rel }; // default/source locale
  }
  return null;
}

function mirrorPath(cfg, locale, logical) {
  return locale === "en" ? `${cfg.root}/${logical}` : `${cfg.root}/${locale}/${logical}`;
}

// Return the set of repo-relative paths changed on this branch: committed
// (merge-base..HEAD) plus all uncommitted work (staged, unstaged, untracked).
// NOTE: this git + base-branch logic is duplicated in remind-ui-docs.mjs;
// keep the two copies in sync (extract to a shared lib if a third hook needs it).
function changedFiles() {
  const changed = new Set();

  // Committed-on-branch changes vs the merge-base with the closest base branch.
  const upstream = git("rev-parse --abbrev-ref --symbolic-full-name @{upstream}").trim();
  let base = "";
  for (const cand of [upstream, "origin/main", "origin/master", "main", "master"]) {
    if (!cand) continue;
    const mb = git(`merge-base HEAD ${cand}`).trim();
    if (mb) {
      base = mb;
      break;
    }
  }
  if (base) addLines(changed, git(`diff --name-only ${base} HEAD`));

  // Uncommitted: tracked modifications (staged + unstaged) and untracked files.
  addLines(changed, git("diff --name-only HEAD"));
  addLines(changed, git("ls-files --others --exclude-standard"));

  return changed;
}

// Given the changed set, produce a list of { source, missing: [paths] }.
function findGaps(changed) {
  const gaps = [];
  for (const path of changed) {
    const c = classify(path);
    if (c?.locale !== "en") continue; // only source files drive the check
    const missing = [];
    for (const locale of c.cfg.locales) {
      const mp = mirrorPath(c.cfg, locale, c.logical);
      if (existsSync(join(projectDir, mp)) && !changed.has(mp)) missing.push(mp);
    }
    if (missing.length) gaps.push({ source: path, missing });
  }
  return gaps;
}

function report(gaps) {
  const out = ["[doc-i18n-parity] Source docs changed without their existing locale mirror(s):"];
  for (const g of gaps) out.push(`  • ${g.source} → not updated: ${g.missing.join(", ")}`);
  out.push("Update the listed mirror file(s) to match, or if the drift is intentional, say so to the user.");
  return out.join("\n");
}

// --- Diagnostic mode: `--diff <base> <head>` (prints findings, never blocks) ---
if (process.argv[2] === "--diff") {
  const [, , , base, head] = process.argv;
  const changed = new Set(lines(git(`diff --name-only ${base || "HEAD~1"} ${head || "HEAD"}`)));
  const gaps = findGaps(changed);
  console.log(gaps.length ? report(gaps) : "[doc-i18n-parity] no locale-mirror gaps in the given range.");
  process.exit(0);
}

// --- Normal Stop-hook mode ---
let stdin = "";
try {
  stdin = readFileSync(0, "utf8");
} catch {
  /* no stdin available */
}
let payload = {};
try {
  payload = JSON.parse(stdin || "{}");
} catch {
  /* non-JSON stdin: proceed with defaults */
}

// Loop guard: if we already blocked once and are being re-invoked in the same
// stop cycle, let it pass so an intentional drift can't wedge the session.
if (payload.stop_hook_active) process.exit(0);

const gaps = findGaps(changedFiles());
if (gaps.length === 0) process.exit(0);

process.stderr.write(`${report(gaps)}\n`);
process.exit(2);
