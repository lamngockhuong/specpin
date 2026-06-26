# Codebase Summary

Specpin monorepo (~4,620 LOC: 83 TS files, 17 Go files) implementing a Git-native spec layer for web UIs. Three packages (spec-schema, fingerprint-core, api-client), two apps (Go sidecar CLI, WXT browser extension), one demo.

## Package Dependencies

```
spec-schema (base, no deps)
  |
  +-> fingerprint-core (DOM fingerprinting)
  |     |
  |     +-> api-client (HTTP client over sidecar)
  |           |
  |           +-> extension (WXT MV3, Chrome+Firefox)
  |
  +-> cli (Go sidecar, embeds schema copy)
```

All TS packages depend on `spec-schema` for types. Extension depends on all three TS packages. CLI embeds a synced copy of `v1.json` (never hand-edited).

## packages/spec-schema

**Purpose**: JSON Schema v1 SSOT + generated TS types + ajv validators.

**Key files:**
- `schema/v1.json` - canonical schema (118 lines), defines `Spec`, `SpecManifest`, `Fingerprint`, `MatchResult`.
- `src/schema.gen.ts` - generated ajv standalone validator (7,694 lines, never edit).
- `src/types.gen.ts` - generated TS types (3,057 lines, never edit).
- `src/validators.gen.cjs` - CJS ajv validator for Node consumers (49,843 lines, never edit).
- `src/validate.ts` - thin wrapper exposing `validateSpec()`, `validateManifest()` (27 lines).
- `scripts/gen-types.ts` - codegen runner (json-schema-to-typescript + ajv standalone).
- `scripts/copy-gen-assets.ts` - copies `.gen.cjs` + `.gen.d.cts` to dist post-build.
- `scripts/validate-fixtures.ts` - cross-validates fixtures (valid + invalid) against schema.

**Scripts:**
- `pnpm gen` - regenerate types + validators from `v1.json`.
- `pnpm build` - gen + tsc + copy assets.
- `pnpm schema-validate` - run fixture validation (CI gate).

**Conventions:**
- All generated files match `*.gen.*` pattern (ignored by Biome).
- Never hand-edit generated files; always regenerate via `pnpm gen`.

## packages/fingerprint-core

**Purpose**: Framework-agnostic DOM fingerprinting (capture + match), no extension deps.

**Key files:**
- `src/capture.ts` - `captureFingerprint(element)` (145 lines). Extracts anchors (test-id, aria, id, data-spec-id), cssSelector, xpath, domPath, text, attrs, labels, position, framework hint.
- `src/match.ts` - `matchElement(fingerprint, root)` (90 lines). Tries exact anchors first (confidence 1.0), then unique cssSelector (0.7), else `needsReview`. Returns `MatchResult`.
- `src/selector.ts` - `buildCssSelector(element)` (98 lines). Optimized selector generation, prefers classes over nth-child when unique.
- `src/xpath.ts` - `buildXPath(element)` (38 lines). Fallback path when CSS ambiguous.
- `src/detect-framework.ts` - `detectFramework()` (39 lines). Heuristics for React, Vue, Angular, Svelte.
- `src/generated-id.ts` - `isGeneratedId(id)` (49 lines). Filters framework-generated IDs (uuid, base64, hash patterns).
- `src/css-escape.ts` - CSS identifier escaper (32 lines). Handles special chars in selectors.
- `src/index.ts` - barrel export (23 lines).

**Test coverage**: Vitest with happy-dom. Coverage tracked via `pnpm test:coverage`.

**Conventions:**
- Pure functions, no side effects.
- All exports from `index.ts` only.
- `MatchResult` shape is stable (confidence: number, element: Element | null, status: 'exact' | 'partial' | 'needsReview').

## packages/api-client

**Purpose**: Typed HTTP client over sidecar REST contract + SSE helper.

**Key files:**
- `src/client.ts` - `SidecarClient` class (187 lines). Methods: `ping()`, `getManifest()`, `listSpecs()`, `getSpec(id)`, `saveSpec(spec)`, `deleteSpec(id)`. Handles Bearer token, JSON serialization, error mapping.
- `src/events.ts` - `SidecarEventSource` class (74 lines). SSE wrapper with exponential backoff (min 1s, max 30s, reset after 5s stable). Emits `specsChanged`, `manifestChanged`, `error`.
- `src/errors.ts` - `SidecarError` hierarchy (42 lines). `NotFoundError`, `ValidationError`, `UnauthorizedError`, `NetworkError`.
- `src/types.ts` - HTTP contract types (39 lines). Re-exports from spec-schema + `SidecarConfig`, `ConnectionStatus`.

**Scripts:**
- `pnpm build` - tsc only (no codegen).
- `pnpm test` - unit tests for client error handling, SSE reconnect logic.

**Conventions:**
- All API methods return `Promise<T>`, throw `SidecarError` on failure.
- SSE reconnect resets backoff only after 5s stable connection (M3 fix from code review).

## apps/cli (Go sidecar)

**Purpose**: Localhost HTTP+SSE server exposing `.specs/` with token auth.

**Module**: `specpin` (Go 1.26), dependencies: `cobra`, `gorilla/mux`, `gorilla/handlers`, `santhosh-tekuri/jsonschema/v6`, `fsnotify`.

**Structure:**
```
cmd/
  root.go       - cobra root command (33 lines)
  init.go       - `specpin init` scaffold manifest (62 lines)
  serve.go      - `specpin serve` entrypoint (115 lines)
  generate.go   - stub for 1.1 AI feature (19 lines)
internal/
  schema/
    schema.go   - embeds v1.json, exposes validator (41 lines)
    v1.json     - COPY of packages/spec-schema/schema/v1.json (synced via make)
  server/
    server.go   - HTTP handlers: CRUD + SSE hub (312 lines)
    middleware.go - token auth + CORS (89 lines)
    hub.go      - SSE broadcast hub (102 lines)
  store/
    store.go    - file-based spec store (241 lines, atomic writes, pretty JSON)
  watch/
    watch.go    - fsnotify watcher, triggers SSE (87 lines)
```

**Key flows:**
- `serve`: auto-pick free port (or --port), print URL+token, bind 127.0.0.1, start HTTP+SSE, watch `.specs/`.
- `init`: create `.specs/manifest.json` with default values.
- Middleware: every request needs `Authorization: Bearer <token>`. CORS accepts only `chrome-extension://`, `moz-extension://`, `safari-web-extension://` origins. Rejects web origins.
- Store: writes confined to `.specs/`, path-traversal guard (H1 review fix). File ops atomic (temp + rename). Pretty-printed JSON (2-space indent) for clean Git diffs.

**Makefile:**
- `make sync-schema` - cp schema from packages/spec-schema.
- `make check-schema` - diff canonical vs embedded (CI gate).
- `make build` - sync-schema + go build -> bin/specpin.
- `make test` - go test ./...
- `make vet` - go vet ./...

**Conventions:**
- Go standard layout (cmd/, internal/, no pkg/).
- Errors wrapped with context (`fmt.Errorf("%w", err)`).
- No global state; server holds all state.
- Schema embedded via `//go:embed`, never read from disk at runtime.

## apps/extension (WXT MV3)

**Purpose**: Cross-browser extension (Chrome mv3, Firefox mv2) matching + rendering specs.

**Framework**: WXT 0.20, webextension-polyfill 0.12.

**Structure:**
```
src/
  entrypoints/
    background.ts     - SW, SidecarClient lifecycle (183 lines)
    content.ts        - orchestrator, match+render loop (133 lines)
    popup/            - connection UI (index.html, main.ts, styles.css)
    options/          - settings page (index.html, main.ts, styles.css)
  background/
    sidecar-controller.ts - manages client state, relays to content (124 lines)
  content/
    orchestrator.ts   - main loop: fetch specs, match, render (187 lines)
    capture-mode.ts   - element picker, form overlay (241 lines)
    capture-form.ts   - spec authoring form (156 lines)
    keyboard.ts       - shortcut handler (Ctrl+Shift+C toggle capture) (47 lines)
  renderers/
    registry.ts       - `SpecRenderer` interface + registry (31 lines)
    tooltip.ts        - hover peek renderer (134 lines)
    sidebar.ts        - persistent panel renderer (287 lines)
  sources/
    registry.ts       - `SpecSource` interface + registry (29 lines)
    sidecar.ts        - SidecarSource adapter (98 lines)
  shared/
    shadow.ts         - Shadow DOM utilities for isolated styles (52 lines)
    html.ts           - safe HTML escaping (23 lines)
    messaging.ts      - typed message passing (67 lines)
    config.ts         - storage helpers (41 lines)
```

**Key flows:**
- Background SW: on install/startup, wait for popup connection config. On connect, instantiate `SidecarClient`, start SSE listener, relay `specsChanged` to content scripts.
- Content script: on load, ask BG for specs. For each spec, call `matchElement(fingerprint)`. If match, get active renderer (tooltip | sidebar), call `renderer.render(spec, element)`. Listen for capture mode toggle (keyboard shortcut or popup action).
- Capture mode: enter picker mode (hover highlights elements). On click, freeze element, show capture form (title, description, rules). On save, `captureFingerprint(element)`, POST to sidecar, exit capture mode, reload specs.
- Renderers: all implement `SpecRenderer` interface (`render(spec, element)`, `remove(specId)`, `dispose()`). Tooltip uses Floating UI for positioning. Sidebar pins to viewport edge (right side, teal theme).
- Sources: pluggable spec fetchers. MVP ships `SidecarSource` only. Interface allows FileSystem, Manual CSV in 1.1.

**Build:**
- `pnpm build` - WXT build for chrome-mv3 -> `.output/chrome-mv3/`.
- `pnpm build:firefox` - WXT build -b firefox -> `.output/firefox-mv2/`.
- `pnpm zip` - package for store upload.

**Conventions:**
- All DOM writes via shadow roots (style isolation).
- Message passing typed via `messaging.ts` union types.
- Config mutations rejected unless from extension page (M4 review fix).
- Generated IDs escaped before DOM insertion (M1 review fix).

## examples/demo-react-app

**Purpose**: Sample React 19 + Vite app with seeded `.specs/` for instant tryout.

**Structure:**
```
src/
  App.tsx           - main component, login form + dashboard cards
  main.tsx          - React 19 entry
.specs/
  manifest.json     - v1 manifest (version, createdAt, updatedAt)
  login.spec.json   - spec for login form (email input, submit button)
  localhost.spec.json - spec for dashboard cards
```

**Key features:**
- Elements tagged with `data-spec-id` for exact matching.
- Seeded specs validated by CI schema job (prevents rot).
- Runs on port 3000 (Vite dev server).

**Scripts:**
- `pnpm dev` - start dev server.
- `pnpm build` - Vite build.

## Toolchain & CI

**Node/TS:**
- Node >= 20, pnpm 10.33, Turborepo 2.3.
- TypeScript 5.7, strict mode + noUncheckedIndexedAccess.
- Biome 2 (`biome.json`): single tool for lint + format + import organize. Lint = recommended preset plus `noUnusedVariables` + `noUnusedImports`. Ignores `*.gen.*`, `apps/cli/**`, `packages/spec-schema/schema/**`, and `.gitignore` paths.
- Format: spaces (2), lineWidth 100, double quotes, semicolons, trailingComma all (matches the prior Prettier config).
- Vitest 3 for all TS packages (happy-dom for fingerprint-core DOM tests).

**Go:**
- Go 1.26, standard layout.
- Testing: stdlib `testing` package.
- CI: `go vet`, `go test ./...`, `make build`, `make check-schema`.

**CI (.github/workflows/ci.yml):**
Two jobs (JS, Go):

**JS job:**
1. pnpm install --frozen-lockfile
2. turbo run build
3. biome ci . (lint + format gate)
4. turbo run typecheck
5. turbo run test
6. turbo run schema-validate (cross-validate fixtures through ajv)

**Go job (working-directory: apps/cli):**
1. make check-schema (fail if embedded v1.json drifted)
2. go vet ./...
3. go test ./...
4. make build (produces bin/specpin)

**Schema drift gate**: both jobs must pass. JS job validates fixtures through ajv. Go job validates same fixtures through Go validator + checks embedded schema copy matches canonical source.

## File Naming Conventions

- TS files: kebab-case (`capture-mode.ts`, `sidecar-controller.ts`).
- Go files: snake_case per Go stdlib convention (`server.go`, `middleware.go`).
- Generated files: `*.gen.*` pattern (`schema.gen.ts`, `validators.gen.cjs`), never edit.
- Test files: `*.test.ts` (TS), `*_test.go` (Go).
- Config files: lowercase (`biome.json`, `tsconfig.json`, `turbo.json`).

## Code Standards (derived from actual config)

**TypeScript:**
- Strict mode, noUncheckedIndexedAccess, noImplicitOverride.
- Unused vars allowed with `_` prefix (`argsIgnorePattern: "^_"`).
- ESM only (`"type": "module"` in all package.json).
- Target ES2022, moduleResolution bundler.
- Composite projects, declaration + sourceMap.
- All generated files ignored by lint/typecheck.

**Go:**
- CGO_ENABLED=0 for static binaries.
- go vet + go test before build.
- Errors wrapped with context.
- No global mutable state.
- Schema embedded at compile time (`//go:embed`).

**Git:**
- Pretty-printed JSON (2-space indent) for clean diffs.
- Lock files committed (pnpm-lock.yaml, go.sum).
- Generated files committed (`.gen.*` in packages/spec-schema/dist for npm publish).
- `.output/`, `dist/`, `coverage/`, `.turbo/` ignored.

## Key Invariants

1. **One schema, two validators**: `packages/spec-schema/schema/v1.json` is SSOT. TS side uses ajv. Go side embeds copy at `apps/cli/internal/schema/v1.json`. `make sync-schema` syncs. `make check-schema` CI gate prevents drift.

2. **Generated files never hand-edited**: all `*.gen.*` files regenerated via `pnpm --filter @specpin/spec-schema gen`. Biome ignores them. Git tracks them (for consumers without build step).

3. **Fingerprint matching order**: (1) exact anchors (test-id, aria, id, data-spec-id) confidence 1.0, (2) unique cssSelector confidence 0.7, (3) else `needsReview`. Hybrid weighted scorer deferred to 1.1 but `MatchResult` interface stable.

4. **Sidecar security**: binds 127.0.0.1 only, token auth on all requests, CORS restricted to extension origins, path-traversal guard on writes, no web origin access.

5. **Extension style isolation**: all DOM injections via shadow roots. No style leakage to/from host page.

6. **Atomic spec writes**: temp file + rename. Pretty JSON (indent 2) for Git.

## LOC Breakdown (approximate)

| Area | LOC | Files |
|------|-----|-------|
| packages/spec-schema (hand-written) | ~650 | 6 TS + 3 scripts |
| packages/spec-schema (generated) | ~61,500 | 3 gen files |
| packages/fingerprint-core | ~550 | 9 TS |
| packages/api-client | ~350 | 4 TS |
| apps/cli | ~970 | 17 Go |
| apps/extension | ~2,100 | 35 TS |
| examples/demo-react-app | ~200 | 3 TS + 2 specs |
| **Total (source, excl. generated)** | **~4,820** | **83 TS + 17 Go** |

## Where Things Live

**Schema changes**: edit `packages/spec-schema/schema/v1.json`, run `pnpm --filter @specpin/spec-schema gen`, then `cd apps/cli && make sync-schema`.

**Fingerprint logic**: `packages/fingerprint-core/src/capture.ts` (capture signals), `match.ts` (matching order), `selector.ts` (CSS optimization).

**Sidecar HTTP handlers**: `apps/cli/internal/server/server.go` (CRUD endpoints), `middleware.go` (auth+CORS), `hub.go` (SSE broadcast).

**Extension rendering**: `apps/extension/src/renderers/` (tooltip.ts, sidebar.ts), `content/orchestrator.ts` (match loop).

**Extension capture**: `apps/extension/src/content/capture-mode.ts` (picker), `capture-form.ts` (authoring form).

**Docs**: `docs/` (architecture, run-guide, schema-reference, design-system, this file).

**Plans**: `plans/260625-1504-specpin-phase1-mvp/` (8 phase files), `plans/reports/` (code review, brainstorm).

**CI**: `.github/workflows/ci.yml` (JS + Go jobs).
