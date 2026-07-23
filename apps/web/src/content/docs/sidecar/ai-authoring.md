---
title: Authoring specs with an AI agent
description: Let your coding agent (Claude Code, Cursor, Codex) write schema-valid specs with the @specpin/cli skill, then validate and serve them.
---

Specpin ships no LLM of its own. `specpin generate` is a stub, and the CLI never calls a model. Instead, **your coding agent** (Claude Code, Cursor, Codex, and others) authors specs through a portable skill bundled inside `@specpin/cli`. The agent reads your UI source, writes schema-valid `.specs/*.spec.json` files, registers them in the manifest, and runs `specpin validate`. The Go sidecar only serves and validates.

This is the inverse of the usual "the CLI has a built-in agent" model: here your existing agent is the author, and the CLI is its offline validator and server.

## The skill

The skill ships inside the published npm package, so your agent can read it without installing anything:

- `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`
- `https://unpkg.com/@specpin/cli@latest/skill/references/<file>.md`

`SKILL.md` is self-sufficient. Three on-demand references go deeper:

- `schema-authoring.md` — the v1 spec shape plus a complete valid example.
- `fingerprint-strategy.md` — the test-id-first decision tree for anchoring a spec to an element.
- `cli-commands.md` — every command and its exit codes.

The [canonical source lives on GitHub](https://github.com/lamngockhuong/specpin/tree/main/apps/cli/skill).

## Point your agent at it

- **Claude Code (and other kit-style skills):** install the skill, or fetch `SKILL.md` and hand it to the agent. It triggers on requests to author business specs for UI elements or run the `specpin` CLI.
- **Any other agent:** paste the unpkg `SKILL.md` URL (or its contents) into the agent's context and ask it to author specs for your screen.

There is no API key, auth, or model setup to do here: the sidecar is localhost-only and prints its own bearer token when you run `serve`.

## The authoring loop

1. **Scaffold** (once): `specpin init --project "<Name>" --domains <origin>`. See [Install and run the CLI](/sidecar/cli/).
2. **Author:** the agent picks a target element and, by default, fingerprints it from signals it already has — an existing `data-testid` / `data-spec-id`, a non-generated `id`, an `aria-label`, or a unique selector — without editing your app's source. It writes an `<area>.spec.json` with locale-keyed `title` / `description`, optional `businessRules`, a `fingerprint`, and `meta.source: "ai-generated"`. Adding a `data-spec-id` for an exact anchor is an optional opt-in, only when your project wants it.
   - Optional provenance fields the agent may add (all backward-compatible): `links` (ticket / doc / PR URLs, `http`/`https` only), `verifiedBy` (repo-relative test paths — **declarative**: `specpin validate` only checks the files *exist*, it does not run them or imply they pass, so only list real files), and `status` (`draft` / `approved` / `deprecated`; omit for neutral).
   - The agent must **not** author `meta.reviewedAt` / `meta.reviewedBy`: those are stamped by a human via the extension's Mark-reviewed action, and `reviewedBy` is a non-PII token committed to Git and exports (never an email or identity).
3. **Register:** add the new file to `manifest.json` `specFiles[]`.
4. **Validate:** `specpin validate` (exit 0 required; fix the `FAIL` lines on exit 1). Any `verifiedBy` path that does not exist in the repo fails validation — a broken-link check, not a test run.
5. **Preview:** `specpin serve`, then the extension renders the specs live on the page.

Prefer to author by hand instead? See [Capturing and editing specs](/usage/capturing-and-editing/) for the in-browser flow.

## Worked example

The bundled demo carries an AI-authored spec produced by following this skill: [`examples/demo-react-app/.specs/nav.spec.json`](https://github.com/lamngockhuong/specpin/blob/main/examples/demo-react-app/.specs/nav.spec.json) pins a spec onto the nav "Log out" button via its `data-spec-id="nav-logout"` anchor, and passes `specpin validate` (exit 0).

The demo app adopts `data-spec-id` across its elements by convention, so this example shows the **opt-in** exact-anchor path: add the attribute, mirror it in `fingerprint.testId`, fill the remaining required fields, register, validate. Projects that prefer not to touch their source synthesize the fingerprint from existing markup instead (see the skill's fingerprint strategy).

## Guardrails

- Output is marked `meta.source: "ai-generated"` and is meant to be reviewed by a human before it ships.
- The agent must ground every business rule in real code or stated requirements — never invent them.
- Both validators reject flat strings for localized fields and unknown keys (`additionalProperties: false`), so an invalid spec fails fast at `specpin validate`. See [Spec format](/sidecar/spec-format/) for the fields you touch.
