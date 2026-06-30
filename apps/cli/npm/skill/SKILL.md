---
name: specpin
description: >-
  Author and pin living business specs (rules, descriptions, acceptance
  criteria) onto the elements of a running web UI, and drive the specpin
  sidecar CLI. Use when the user wants to document UI elements with versioned
  specs, write or edit .specs/*.spec.json files, run "specpin serve"/"specpin
  validate", or mentions specpin, spec.json, or pinning specs to a page. The
  host coding agent is the author: it reads the UI source, writes schema-valid
  JSON, registers it in the manifest, and validates. No application code is
  generated.
---

# Specpin: author business specs for a running web UI

Specpin is a Git-native knowledge layer. It pins business specifications onto
the elements of a web UI you already have, then renders them in the browser as
you hover or browse. It is NOT a code generator and does not write application
code. You (the coding agent) author JSON spec files in the consumer repo's
`.specs/` directory; the `specpin` CLI serves and validates them; a browser
extension matches each spec's element fingerprint against the live DOM and
renders it.

Flow: `.specs/` (in the repo) -> `specpin serve` (Go sidecar, localhost) ->
browser extension (match + render).

Your job: read the UI source, write `<area>.spec.json` files that conform to
schema v1, register them in `manifest.json`, and confirm `specpin validate`
exits 0.

## Setup

No login, no API key, no model. The sidecar is localhost-only and prints its own
bearer token on `serve`. Contrast with agent CLIs that need auth: there is
nothing to authenticate here.

1. Check the CLI: `specpin --version` (or `npx @specpin/cli --version`).
2. If absent, install: `npm i -g @specpin/cli` (or use `npx @specpin/cli ...`).
3. Work inside the consumer repo. Author into its `.specs/` directory, never a
   temp directory.

## Authoring workflow (the core loop)

a. **Scaffold** (only if `.specs/manifest.json` is absent):
   `specpin init --project "<Name>" --domains <origin>` where `<origin>` is
   where the UI runs, e.g. `localhost:3000`. This refuses to overwrite an
   existing manifest.

b. **Identify the target element** in the UI source (JSX/HTML/Vue/Svelte) and
   decide the fingerprint approach. Specpin is non-intrusive by default: build the
   fingerprint from signals the element **already has** (an existing
   `data-testid` / `data-spec-id`, a non-generated `id`, an `aria-label`, or a
   unique selector) and do NOT edit the app's source. Adding a `data-spec-id` is
   an optional opt-in upgrade for the most resilient anchor, only when the project
   agrees to small markup additions. See `references/fingerprint-strategy.md`.

c. **Write `<area>.spec.json`** (one file per page or feature). It has a `group`
   string and a `specs[]` array. Each spec needs:
   - `id`: stable, unique within the project, e.g. `"login-submit-btn"`.
   - `title`, `description`: **locale-keyed objects**, never flat strings,
     e.g. `{ "en": "Log in button" }`. `description` must be non-empty.
   - `businessRules` (optional): array of locale-keyed objects, one rule each.
   - `tags` (optional): plain string array (not localized).
   - `preferredDisplayMode` (optional): `tooltip` | `sidebar` | `modal`
     (`overlay` and `inline-badge` are reserved and fall back to `tooltip`).
   - `fingerprint`: the element link (required). See the fingerprint reference.
   - `meta`: set `"source": "ai-generated"` for specs you author, plus
     `createdBy`, `createdAt`, `updatedAt` (RFC3339).

   `description` and each `businessRules` item may use a small, safe Markdown
   subset (bold, italic, `[label](url)` links, and lists in `description`).
   See `references/schema-authoring.md`.

d. **Register the file** in `manifest.json` under `specFiles[]`. A spec file on
   disk that is not listed (or listed but missing) trips a drift warning.

e. **Validate**: `specpin validate` (or `specpin validate --dir <path>`).
   Exit 0 = done. Exit 1 = fix the reported `FAIL` lines and re-run. Exit 2 =
   the check could not run (no manifest, wrong `--dir`).

f. **Preview** (optional): `specpin serve` prints a URL + token to paste into the
   extension, then specs render live on their elements with SSE live-reload.

## Do / Don't

DO:
- Set `meta.source: "ai-generated"` on every spec you author (output is meant to
  be reviewed by a human).
- Keep one `<area>.spec.json` per page or feature; name it after the area.
- Prefer an anchor the element **already has** (an existing `data-testid` /
  `data-spec-id`, a non-generated `id`, or an `aria-label`): it gives exact
  matching with zero source changes.
- Ground every business rule in real code or stated requirements.

DON'T:
- Edit the app's source to add `data-spec-id` / `data-testid` unless the project
  opts in. Specpin attaches to the UI you already have; adding an anchor is an
  optional resilience upgrade, never a requirement. Default to synthesizing the
  fingerprint from the existing markup.
- Invent business rules not supported by the code or the user's requirements.
- Use flat strings for `title` / `description` / `businessRules`: both
  validators reject `"title": "Log in"`. Use `{ "en": "Log in" }`.
- Add keys not in the schema: objects are `additionalProperties: false`.
- Hand-edit generated artifacts or write files outside `.specs/`.

## Reading `specpin validate` output

Each file prints `OK <file>` or `FAIL <file>` followed by indented error lines,
then a summary `N files checked, M error(s)`. Drift between `manifest.specFiles`
and on-disk files prints `warning:` lines (or `FAIL:` under `--strict-manifest`).

- Exit 0: all valid. You are done.
- Exit 1: schema violations or an unreadable spec file. Read each `FAIL` block,
  fix the JSON, re-run.
- Exit 2: could not run (missing `.specs/`, no `manifest.json`, or `--dir`
  pointed at the repo root instead of `.specs/`). Fix the path or run `init`.

## Staying up to date

This skill ships inside `@specpin/cli` and is version-synced with the CLI. To
fetch the latest copy without installing:

- `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`
- `https://unpkg.com/@specpin/cli@latest/skill/references/<file>.md`
- Schema for `$schema` autocomplete: `https://specpin.ohnice.app/schema/v1.json`
  (also `https://unpkg.com/@specpin/spec-schema/schema/v1.json`).

Compare `npm view @specpin/cli version` against your installed
`specpin --version`; refresh the skill if they differ.

## References (load on demand)

- `references/schema-authoring.md`: the full v1 shape (Manifest, SpecFile, Spec,
  LocalizedString, fingerprint, meta), a complete minimal valid example, and the
  Markdown subset.
- `references/fingerprint-strategy.md`: the test-id-first decision tree and how
  to derive each fingerprint field from source.
- `references/cli-commands.md`: every command, its flags, and exit-code
  semantics.
