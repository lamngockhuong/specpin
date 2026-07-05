#!/usr/bin/env node
// Stop hook: remind (do NOT block) when extension UI changed on this branch but
// no documentation file was touched alongside it.
//
// Why this exists: user-visible UI edits (options/popup/side-panel markup, the
// in-page renderers, UI strings, design tokens) usually need a matching doc
// change, and it is easy to ship the UI and forget the docs. This audits the
// whole branch diff (committed + uncommitted) once, at the end of a turn.
//
// Detection rule (deliberately low-noise, and only a nudge):
//   - Fire only when the changeset contains at least one UI file AND zero doc
//     files. If ANY doc changed, assume the author handled it and stay silent.
//   - The reminder is advisory: purely-internal UI refactors need no doc, so it
//     tells the reader to ignore it when nothing user-visible changed.
//
// Behavior: NON-BLOCKING. Emits a `systemMessage` and exits 0 so it can never
// wedge or force a session (that is the blocking i18n-parity hook's job, not
// this one). Fails OPEN on any infra error.
//
// Diagnostic mode (no stdin, never messages the user):
//   node remind-ui-docs.mjs --diff <baseRef> <headRef>
// prints whether the given range would fire — handy for testing.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// A changed path is "UI" if it matches any of these; "doc" if it matches a doc
// root. Keep UI scoped to the EXTENSION surface so editing the marketing site or
// unrelated code never nags. Update these lists if the layout moves.
const UI_PATTERNS = [
  /^apps\/extension\/src\/entrypoints\//,
  /^apps\/extension\/src\/renderers\//,
  /^apps\/extension\/src\/content\//,
  /^apps\/extension\/src\/i18n\/messages\//,
  /^apps\/extension\/designs\//,
  /^apps\/extension\/.*\.(html|css)$/,
];
const DOC_PATTERNS = [/^docs\//, /^apps\/web\/src\/content\/docs\//];

// The concrete files to review, shown in the reminder so it is actionable.
// Canonical UI->doc mapping lives in CLAUDE.md ("Keeping docs in sync with UI
// changes"); keep this checklist aligned with that table.
const DOC_CHECKLIST = [
  "docs/run-guide.md (+ docs/vi/) - user-facing flows",
  "docs/design-system.md (+ docs/vi/) - visual/token/component changes",
  "apps/web/src/content/docs/usage/*.md (+ vi/ + ja/) - website usage docs",
];

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

// Repo-relative paths changed on this branch: committed (merge-base..HEAD) plus
// all uncommitted work (staged, unstaged, untracked).
// NOTE: this git + base-branch logic is duplicated in check-doc-i18n-parity.mjs;
// keep the two copies in sync (extract to a shared lib if a third hook needs it).
function changedFiles() {
  const changed = new Set();
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
  if (base) for (const p of lines(git(`diff --name-only ${base} HEAD`))) changed.add(p);
  for (const p of lines(git("diff --name-only HEAD"))) changed.add(p);
  for (const p of lines(git("ls-files --others --exclude-standard"))) changed.add(p);
  return changed;
}

// Return the UI files that changed with no doc change anywhere, or [] if the
// rule does not fire.
function findUiWithoutDocs(changed) {
  const uiHits = [...changed].filter((p) => UI_PATTERNS.some((re) => re.test(p)));
  const docTouched = [...changed].some((p) => DOC_PATTERNS.some((re) => re.test(p)));
  return docTouched ? [] : uiHits;
}

function report(uiHits) {
  const list = uiHits.map((p) => `  • ${p}`).join("\n");
  return [
    "[ui-docs] UI files changed but no docs were updated:",
    list,
    "If this changes user-visible behavior or appearance, update the docs:",
    ...DOC_CHECKLIST.map((d) => `  - ${d}`),
    "If the change is purely internal (refactor, no visible effect), ignore this.",
  ].join("\n");
}

// --- Diagnostic mode: `--diff <base> <head>` (prints, never messages) ---
if (process.argv[2] === "--diff") {
  const [, , , base, head] = process.argv;
  const changed = new Set(lines(git(`diff --name-only ${base || "HEAD~1"} ${head || "HEAD"}`)));
  const hits = findUiWithoutDocs(changed);
  console.log(hits.length ? report(hits) : "[ui-docs] no UI-without-docs gap in the given range.");
  process.exit(0);
}

// --- Normal Stop-hook mode (non-blocking) ---
let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  /* no/invalid stdin: proceed with defaults */
}
if (payload.stop_hook_active) process.exit(0); // avoid re-emitting within a stop cycle

const hits = findUiWithoutDocs(changedFiles());
if (hits.length === 0) process.exit(0);

// Non-blocking: surface a reminder to the user, then allow the stop.
process.stdout.write(JSON.stringify({ systemMessage: report(hits) }));
process.exit(0);
