# Authoring specs with an AI agent

> Tiếng Việt: [`vi/ai-authoring.md`](./vi/ai-authoring.md). English is the source of truth.

Specpin adds no LLM to the CLI. `specpin generate` is a stub. AI authoring is
driven by **your coding agent** (Claude Code, Cursor, Codex, etc.) through a
portable skill bundled inside `@specpin/cli`. The agent reads your UI source,
writes schema-valid `.specs/*.spec.json` files, registers them in the manifest,
and runs `specpin validate`. The Go CLI only serves and validates.

This inverts the usual "CLI has a built-in agent" model: here the host agent is
the author, and the CLI is its offline validator and server.

## The skill

The canonical source lives in this repo at [`apps/cli/skill/`](../apps/cli/skill/)
and ships in the published npm package, so it is reachable without installing:

- `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`
- `https://unpkg.com/@specpin/cli@latest/skill/references/<file>.md`

`SKILL.md` is self-sufficient. Three on-demand references deepen it:
`schema-authoring.md` (the v1 shape plus a complete valid example),
`fingerprint-strategy.md` (the test-id-first decision tree), and
`cli-commands.md` (every command and its exit codes).

A drift gate (`node apps/cli/npm/scripts/sync-skill.mjs --check`, run in CI)
keeps the bundled copy identical to the canonical source, mirroring how the Go
sidecar's embedded schema is kept in sync.

## Pointing your agent at it

- **Claude Code / kit-style skills**: install the skill or fetch `SKILL.md` and
  hand it to the agent. It triggers on requests to author business specs for UI
  elements or run the `specpin` CLI.
- **Any other agent**: paste the unpkg `SKILL.md` URL (or its contents) into the
  agent's context and ask it to author specs for your screen.

No auth, key, or model setup: the sidecar is localhost-only and prints its own
bearer token on `serve`.

## The authoring loop

1. **Scaffold** (once): `specpin init --project "<Name>" --domains <origin>`.
2. **Author**: the agent picks a target element and, by default, fingerprints it
   from signals it already has (an existing `data-testid` / `data-spec-id`, a
   non-generated `id`, an `aria-label`, or a unique selector) without editing the
   app's source. It writes an `<area>.spec.json` with locale-keyed `title` /
   `description`, optional `businessRules`, a `fingerprint`, and
   `meta.source: "ai-generated"`. Adding a `data-spec-id` for an exact anchor is
   an optional opt-in, only when the project wants it.
3. **Register**: add the new file to `manifest.json` `specFiles[]`.
4. **Validate**: `specpin validate` (exit 0 required; fix `FAIL` lines on exit 1).
5. **Preview**: `specpin serve`, then the extension renders the specs live.

See the full loop, including the manual capture path, in
[`run-guide.md`](./run-guide.md).

## Worked example

The bundled demo carries an AI-authored spec produced by following this skill:
[`examples/demo-react-app/.specs/nav.spec.json`](../examples/demo-react-app/.specs/nav.spec.json)
pins a spec onto the nav "Log out" button via its `data-spec-id="nav-logout"`
anchor, and passes `specpin validate` (exit 0). The demo app adopts `data-spec-id`
across its elements by convention, so this example shows the **opt-in** exact
anchor path: add the attribute, mirror it in `fingerprint.testId`, fill the
remaining required fields, register, validate. Projects that prefer not to touch
their source synthesize the fingerprint from existing markup instead (see the
skill's fingerprint strategy).

## Guardrails

- Output is marked `meta.source: "ai-generated"` and is meant to be reviewed by
  a human before it ships.
- The agent must ground every business rule in real code or stated
  requirements, never invent them.
- Both validators reject flat strings for localized fields and unknown keys
  (`additionalProperties: false`), so an invalid spec fails fast at
  `specpin validate`.
