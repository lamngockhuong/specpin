# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Specpin is

Specpin pins business specifications (rules, descriptions, acceptance criteria) onto the elements of a *running* web UI. It is **not** a spec-driven code generator (unrelated to Spec Kit / OpenSpec): it generates no application code. It is a Git-native knowledge layer that attaches living docs to interfaces you already have. Specs live as JSON in the consumer repo's `.specs/`, link to elements via resilient fingerprints, and render in-browser.

Three-tier flow:

```
.specs/ (consumer repo) --> specpin serve (Go sidecar, localhost HTTP+SSE) --> browser extension (match + render)
```

## Toolchain

Node >= 22, pnpm 11, Turborepo, Go 1.26, Vitest. The repo is a pnpm + Turbo monorepo (`packages/*`, `apps/*`, `examples/*`).

## Commands

Root (Turbo orchestrates across all TS packages):

```bash
pnpm install
pnpm build            # turbo run build (respects ^build deps)
pnpm test             # vitest per package
pnpm lint             # biome check . (lint + format + import organize)
pnpm typecheck        # tsc --noEmit per package
pnpm schema-validate  # ajv-side cross-validation of the fixture corpus
pnpm format           # biome format --write .
```

Single package / single test:

```bash
pnpm --filter @specpin/fingerprint-core test          # one package's vitest
pnpm --filter @specpin/fingerprint-core exec vitest run -t "match"   # one test by name
pnpm --filter @specpin/extension build                # chrome-mv3 -> .output/
pnpm --filter @specpin/extension build:firefox        # firefox-mv2 -> .output/
pnpm --filter @specpin/demo-react-app dev             # demo target on http://localhost:3000
```

Go sidecar (run from `apps/cli/`):

```bash
make build            # sync-schema THEN go build -> bin/specpin
make check-schema     # CI gate: fails if embedded schema drifted (see invariant below)
go test ./...
go test ./internal/server -run TestName   # single Go test
go vet ./...
```

Full pre-PR gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm schema-validate`, plus `make check-schema && go test ./...` in `apps/cli`.

## Architecture: the big picture

Package roles (see `docs/system-architecture.md`):

| Path | Role |
|------|------|
| `packages/spec-schema` | JSON Schema v1 (**single source of truth**) + generated TS types + ajv validators |
| `packages/fingerprint-core` | framework-agnostic `captureFingerprint` + `matchElement` (pure DOM, no extension deps) |
| `packages/api-client` | typed `SidecarClient` over the sidecar HTTP contract + SSE helper |
| `apps/cli` | Go sidecar: `init` + `serve` (CRUD, SSE, health), hardened localhost |
| `apps/extension` | WXT MV3 extension (background SW + content script + popup/options) |
| `examples/demo-react-app` | demo UI with seeded `.specs/` |

### Critical invariant: one schema, two validators

`packages/spec-schema/schema/v1.json` is the SSOT. It feeds two independent validation paths that must never diverge:

- **TS side**: ajv. Types and validators in `packages/spec-schema/src/*.gen.*` are **generated** from the schema (`pnpm --filter @specpin/spec-schema gen` / `build`). Do not hand-edit `*.gen.ts` / `*.gen.cjs`.
- **Go side**: the sidecar embeds a *copy* at `apps/cli/internal/schema/v1.json` and validates with `santhosh-tekuri/jsonschema/v6`. This copy is synced by `make sync-schema` and must never be hand-edited. `make check-schema` is the CI drift gate.

When you change the schema: edit only `packages/spec-schema/schema/v1.json`, regenerate the TS artifacts, run `make sync-schema` in `apps/cli`, and update fixtures so both validators agree.

### Extension internals (`apps/extension/src`)

- `entrypoints/` - WXT entry points (background, content, popup, options).
- `background/sidecar-controller.ts` - holds `SidecarClient`, spec cache, relays SSE to content scripts.
- `content/` - `orchestrator.ts` drives match+render; `capture-*.ts` is the manual capture flow; `keyboard.ts` handles the shortcuts.
- `renderers/` - pluggable display modes via `registry.ts` (tooltip, sidebar, modal shipped; overlay + inline-badge dropped as redundant - enum values stay reserved and fall back to tooltip).
- `sources/` - pluggable spec sources via `registry.ts` (sidecar shipped; FileSystem/Manual deferred).
- `shared/shadow.ts` + `html.ts` - Shadow DOM isolation and CSP-safe HTML; rendering stays out of the host page's styles/CSP.
- `shared/tokens.gen.css` - generated from `designs/design-tokens.json` by `designs/sync-css-tokens.mjs` (SSOT for the live UI palette; dual-theme via `prefers-color-scheme`). Pages import it directly; `shared/tokens.ts` re-exports a `:host`-scoped variant (`?inline`) for the Shadow DOM renderers. Do not hand-edit the `.gen.css`. See `docs/design-system.md`.

### Fingerprint matching (`packages/fingerprint-core`)

Captures multiple signals per element (test-id anchors, aria, non-generated id, optimized cssSelector, xpath, domPath, text, whitelisted attrs, nearby labels, position, framework hint). Match order (current): exact anchors (confidence 1.0) -> unique cssSelector (0.7) -> else `needsReview`. A `data-spec-id` attribute makes matching trivially exact. The `matchElement` signature and `MatchResult` shape are stable so the planned hybrid weighted scorer can slot in without breaking callers.

### Sidecar security model (`apps/cli/internal/server`)

Binds `127.0.0.1` only (auto-picked port unless `--port`); every request needs `Authorization: Bearer <token>` (printed on `serve`); CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) and rejects web origins; writes are confined to `.specs/` (path-traversal guard), atomic, and pretty-printed for clean Git diffs.

## Docs

`docs/` holds the project documentation set (keep in sync when behavior, architecture, or standards change):

- `system-architecture.md` - components + invariants; `codebase-summary.md` - per-package map; `code-standards.md` - TS/Go conventions + schema workflow; `project-overview-pdr.md` - product scope/PDR; `project-roadmap.md` - shipped capabilities + planned features.
- `run-guide.md` - full init -> serve -> load -> connect -> render -> capture loop; `schema-reference.md` - v1 spec format; `design-system.md` - extension UI tokens (mockups in `apps/extension/designs/`); `scorer-tuning.md` - contributor guide for tuning the match scorer (WEIGHTS in `packages/fingerprint-core/src/score.ts`) from an exported drift corpus via `pnpm --filter @specpin/fingerprint-core tune`.

### Keeping docs in sync with UI changes

When an extension UI change alters user-visible behavior or appearance, update the docs in the SAME change. Purely internal refactors (no visible effect) need no doc update.

Map UI edit -> doc(s) to review (always update the `vi`/`ja` mirrors too):

| UI change | Docs to review |
|-----------|----------------|
| Options / popup / side-panel flow, nav, controls, or capture/guide behavior | `docs/run-guide.md` (+ `docs/vi/`) and `apps/web/src/content/docs/usage/*.md` (+ `vi/`, `ja/`) |
| Visual system: tokens, colors, a reusable component/pattern (e.g. a new control) | `docs/design-system.md` (+ `docs/vi/`) |
| New/changed user-facing capability | `docs/project-roadmap.md` (shipped list, if the capability warrants it) |

Safety net (not a substitute for the above): a non-blocking `Stop` hook (`.claude/hooks/remind-ui-docs.mjs`) reminds at end of turn when UI files changed but no doc did. A separate blocking hook (`check-doc-i18n-parity.mjs`) enforces that an edited source doc's existing locale mirrors are updated too (`docs/` has a `vi` mirror; the website docs have `vi` and `ja`).

### Vietnamese translation style (docs/vi/ and i18n)

English is the source of truth; `docs/vi/` and the `vi` i18n catalog are translations that must stay in sync when the English source changes. Translate for a native Vietnamese reader, not word-for-word:

- Convey the meaning, then phrase it the way it would be written natively. Rework the sentence structure instead of mirroring English clause order.
- Avoid stiff literal calques. Examples to not repeat: "nói bằng lời thường" (use "Giải thích đơn giản"), "các nút vặn" for knobs/params (use "các tham số điều chỉnh"), "nhẹ weight đi" (use "giảm weight").
- Keep technical terms and code identifiers in English (e.g. `scorer`, `fingerprint`, `WEIGHTS`, `commit`, `weight`); do not force-translate jargon into awkward Vietnamese.
- Prefer concise, idiomatic wording over a grammatically-correct-but-clunky rendering. When a translation "sounds translated", rewrite it.

## Status

Released and live on the Chrome Web Store (extension ID `kkfmoieoahdjneagognaoedggkiiolkn`, <https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn>). Firefox Add-ons publication is pending (build-from-source only for now). Active development continues.

For the shipped-capability list, planned work, and the decision log (including dropped ideas such as the overlay + inline-badge renderers), see `docs/project-roadmap.md`, the single source of truth for project status.
