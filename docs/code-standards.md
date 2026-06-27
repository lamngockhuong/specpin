# Code Standards

> Tiếng Việt: [`vi/code-standards.md`](./vi/code-standards.md). English is the source of truth.

Standards derived from actual tooling config and observed conventions in the Specpin monorepo. All rules reflect what the codebase already enforces, not aspirational guidelines.

## File Naming

**TypeScript/JavaScript**: kebab-case
- `capture-mode.ts`, `sidecar-controller.ts`, `keyboard.ts`
- Test files: `*.test.ts`
- Config files: lowercase (`biome.json`, `tsconfig.json`)

**Go**: snake_case (Go stdlib convention)
- `server.go`, `middleware.go`, `hub.go`
- Test files: `*_test.go`

**Generated files**: `*.gen.*` pattern
- `schema.gen.ts`, `types.gen.ts`, `validators.gen.cjs`, `validators.gen.d.cts`
- NEVER hand-edit these files
- Always regenerate via `pnpm --filter @specpin/spec-schema gen`
- Biome ignores them (see the `files.includes` negations in `biome.json`)
- Git tracks them (required for consumers without build step)

**Markdown**: lowercase with hyphens
- `system-architecture.md`, `run-guide.md`, `schema-reference.md`

## TypeScript Standards

### Compiler Options (tsconfig.base.json)

```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "lib": ["ES2022", "DOM", "DOM.Iterable"],
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "declaration": true,
  "composite": true,
  "sourceMap": true,
  "esModuleInterop": true,
  "resolveJsonModule": true,
  "isolatedModules": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true
}
```

**Key rules:**
- Strict mode ON (all strict checks enabled).
- `noUncheckedIndexedAccess`: array/object access returns `T | undefined`, forces explicit checks.
- `noImplicitOverride`: must use `override` keyword when overriding base class methods.
- Composite projects for workspace references.
- ESM only (`"type": "module"` in all package.json).

### Biome (biome.json)

One tool handles lint, format, and import organize. There is no ESLint or Prettier.

**Linter:** `recommended` preset plus two stricter correctness rules:

```jsonc
"linter": {
  "rules": {
    "preset": "recommended",
    "correctness": {
      "noUnusedVariables": "error",
      "noUnusedImports": "error"
    }
  }
}
```

**Formatter:** matches the prior Prettier style, so the migration diff stayed small:

```jsonc
"formatter": {
  "indentStyle": "space",
  "indentWidth": 2,
  "lineWidth": 100
}
```

Quotes (double), semicolons (always), and trailing commas (all) use Biome defaults, which already
match the old Prettier config.

**Ignores** (`files.includes` negations, plus `.gitignore` via `vcs.useIgnoreFile`):
- `**/*.gen.*` (all generated files)
- `apps/cli/**` (Go sidecar)
- `packages/spec-schema/schema/**` (schema SSOT)

**Commands:**
- `pnpm lint` -> `biome check .` (lint + format check + import organize, read-only)
- `pnpm lint:fix` -> `biome check --write .` (applies safe fixes)
- `pnpm format` -> `biome format --write .`

**Enforcement**: `biome ci .` in CI gates both lint and format. Run `pnpm lint` locally before a PR.

### Package Structure

All TS packages follow this structure:

```
package/
  src/
    index.ts          # Barrel export (only public API)
    *.ts              # Implementation
    *.test.ts         # Vitest tests
  dist/               # Build output (gitignored except for published packages)
  tsconfig.json       # Extends tsconfig.base.json
  package.json
  vitest.config.ts    # If custom config needed
```

**package.json requirements:**
- `"type": "module"` (ESM only)
- `"main": "./dist/index.js"`
- `"types": "./dist/index.d.ts"`
- `"exports"` field for modern bundlers
- `"files": ["dist"]` (or `["dist", "schema"]` for spec-schema)

**Scripts (standard across packages):**
- `build`: `tsc -p tsconfig.json` (or `tsx scripts/gen-types.ts && tsc` for spec-schema)
- `typecheck`: `tsc -p tsconfig.json --noEmit`
- `test`: `vitest run`

Linting is not a per-package script: Biome runs once from the repo root (`pnpm lint`).

### Testing (Vitest 3)

**Config**: happy-dom for DOM tests (fingerprint-core), no DOM for others.

**File naming**: `*.test.ts` alongside source files.

**Coverage**: tracked via `@vitest/coverage-v8` (fingerprint-core has `test:coverage` script).

**CI gate**: `pnpm test` (turbo run test across all packages).

## Go Standards

### Project Layout

Go standard layout (no `pkg/` directory):

```
apps/cli/
  cmd/              # Command implementations (cobra)
    root.go
    init.go
    serve.go
    generate.go
  internal/         # Private packages
    schema/
    server/
    store/
    watch/
  bin/              # Build output (gitignored)
  Makefile
  go.mod
  go.sum
```

**`internal/` rule**: code in `internal/` cannot be imported by external modules (Go enforced).

### Coding Conventions

**Error handling:**
```go
if err != nil {
    return fmt.Errorf("context: %w", err)
}
```
Always wrap errors with context using `%w` (unwrappable).

**No global mutable state**: server holds all state, passed via struct fields or function params.

**Schema embedding:**
```go
//go:embed v1.json
var schemaData []byte
```
Schema loaded at compile time, never read from disk at runtime.

**Build flags:**
```makefile
CGO_ENABLED=0 go build -o $(BIN) .
```
Static binaries only (no C dependencies).

### Testing

**Framework**: stdlib `testing` package.

**File naming**: `*_test.go` (Go convention).

**Table-driven tests** preferred:
```go
func TestFoo(t *testing.T) {
    tests := []struct {
        name string
        input string
        want string
    }{
        {"case1", "input1", "output1"},
        {"case2", "input2", "output2"},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := Foo(tt.input)
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

**CI gates**: `go vet ./...`, `go test ./...`, `make build`.

### Makefile Standards

All Go projects use Makefile for build orchestration (not go:generate).

**Standard targets:**
- `build`: build binary (depends on any codegen steps)
- `test`: `go test ./...`
- `vet`: `go vet ./...`
- `clean`: remove build artifacts

**CLI-specific (apps/cli/Makefile):**
- `sync-schema`: copy `packages/spec-schema/schema/v1.json` to `internal/schema/v1.json`
- `check-schema`: diff canonical vs embedded, fail if drifted (CI gate)
- `build`: depends on `sync-schema`

## Schema Management (Critical Invariant)

**One schema, two validators**:

1. **Canonical source**: `packages/spec-schema/schema/v1.json` (130+ lines, hand-edited). Defines `Spec`, `SpecManifest`, `SpecFile`, `ViewsConfig`.
2. **TS validator**: ajv standalone in `packages/spec-schema/src/*.gen.*` (generated via `pnpm gen`). Exposes `validateSpec`, `validateManifest`, `validateSpecFile`, `validateViews`.
3. **Go validator**: `santhosh-tekuri/jsonschema/v6` over embedded copy at `apps/cli/internal/schema/v1.json` (synced via `make sync-schema`). Exposes `ValidateSpec`, `ValidateManifest`, `ValidateSpecFile`, `ValidateViews`.

**Workflow for schema changes:**
```bash
# 1. Edit canonical schema
vim packages/spec-schema/schema/v1.json

# 2. Regenerate TS types + validators
pnpm --filter @specpin/spec-schema gen

# 3. Sync to Go CLI
cd apps/cli
make sync-schema

# 4. Verify no drift
make check-schema

# 5. Update fixtures (specs + views) so both validators agree
# Add/edit files in tests/fixtures/specs/{valid,invalid} and tests/fixtures/views/{valid,invalid}

# 6. Run full test suite
cd ../..
pnpm test
cd apps/cli
go test ./...
```

**CI enforcement:**
- JS job: `turbo run schema-validate` (cross-validate fixtures for specs + views through ajv).
- Go job: `make check-schema` (fail if embedded copy drifted).

**Never hand-edit:**
- `packages/spec-schema/src/*.gen.*` (TS generated)
- `apps/cli/internal/schema/v1.json` (Go embedded copy)

## Git Commit Standards

**Format**: Conventional Commits (enforced by review, not git hooks).

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`.

**Scope**: package or app name (`spec-schema`, `fingerprint-core`, `cli`, `extension`).

**Examples:**
```
feat(extension): add sidebar renderer
fix(cli): prevent path traversal in spec writes
docs: add codebase summary
chore(deps): bump wxt to 0.20
```

**Never commit:**
- Secrets, tokens, API keys, `.env` files.
- Personal data, credentials, database dumps.
- Large binaries (except essential assets).

## PR & CI Gates

**Before opening PR:**
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm schema-validate` (root)
2. `cd apps/cli && make check-schema && go vet ./... && go test ./... && make build`

**CI must pass:**
- Lint + format (`biome ci .`)
- All typechecks (tsc --noEmit per package)
- All tests (Vitest TS, Go stdlib testing)
- All builds (turbo build + make build CLI)
- Schema cross-validation (ajv + Go validator agree on fixtures)
- Schema drift check (embedded copy matches canonical)

**CI config**: `.github/workflows/ci.yml` (two jobs: JS, Go).

## Code Review Checklist

**For all changes:**
- [ ] Lint + typecheck + test pass locally before push.
- [ ] No `console.log` or debug statements left in.
- [ ] Error handling present (no silent failures).
- [ ] Public API changes documented (JSDoc or inline comments).

**For schema changes:**
- [ ] Canonical schema edited (`packages/spec-schema/schema/v1.json`).
- [ ] TS types regenerated (`pnpm --filter @specpin/spec-schema gen`).
- [ ] Go schema synced (`cd apps/cli && make sync-schema`).
- [ ] Fixtures updated to cover new fields (specs in `tests/fixtures/specs/`, views in `tests/fixtures/views/`).
- [ ] Both validators pass fixtures (`pnpm schema-validate` and `go test ./...`).

**For extension changes:**
- [ ] Shadow DOM isolation maintained (no host page style leaks).
- [ ] Message passing typed via `messaging.ts`.
- [ ] Config mutations rejected unless from extension page.
- [ ] Content script bundle size checked (target < 500 KB).

**For CLI changes:**
- [ ] Errors wrapped with context (`fmt.Errorf("%w", err)`).
- [ ] No global mutable state introduced.
- [ ] Path-traversal guard maintained on file writes.
- [ ] Token auth + CORS checks present on new endpoints.

## Security Standards

**Sidecar (apps/cli):**
- Bind 127.0.0.1 only (never 0.0.0.0).
- Token auth on ALL requests (no public endpoints).
- CORS restricted to extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`). Reject web origins.
- Path-traversal guard on writes (confined to `.specs/` directory).
- No external network access (localhost-only).

**Extension:**
- Shadow DOM for all injected UI (style isolation).
- Config mutations rejected unless from extension page (popup/options).
- No `eval()`, no inline scripts (CSP compliant).
- Framework-generated IDs escaped before DOM insertion.

**General:**
- No secrets in source code or config files.
- Input validation at all boundaries (HTTP body, user forms, file paths).
- Sensitive operations (write, delete) require explicit user action (no auto-save without confirmation).

## Performance Standards

**Extension content script:**
- Bundle size target: < 500 KB uncompressed (MVP: ~450 KB with ajv validator).
- Fingerprint match: < 50ms per element (MVP: < 10ms for exact anchors).
- Render latency: < 100ms after match.

**Sidecar:**
- Startup time: < 1s (auto-pick port, bind, start HTTP).
- SSE latency: < 200ms from file change to client notification.
- Spec write: atomic (temp + rename), < 100ms for typical spec (~2 KB JSON).

**Build times (full clean build):**
- TS workspace: < 30s (`pnpm build`).
- Go CLI: < 5s (`make build`).
- Extension: < 20s (`pnpm --filter @specpin/extension build`).

## Documentation Standards

**Inline comments:**
- JSDoc for public APIs (functions, classes, interfaces exported from `index.ts`).
- Inline comments for complex logic only (prefer self-documenting code).
- TODOs with issue number: `// TODO(#42): refactor this when X is done`.

**Markdown docs:**
- Keep under 800 lines per file (split into subdirectories if needed).
- Cross-reference related docs via relative links (`[run guide](./run-guide.md)`).
- ASCII punctuation only (no em dash, en dash, horizontal bar per CLAUDE.md writing style rule).
- Code blocks with language tags (```typescript, ```bash, ```go).

**API documentation:**
- `docs/schema-reference.md` for spec format (JSON Schema).
- JSDoc in source for TS APIs (exported from packages).
- Inline comments in Go for HTTP contract (server.go handlers).

## Dependency Management

**Node/pnpm:**
- `pnpm-lock.yaml` committed (lock reproducible builds).
- Workspace protocol for internal deps (`"workspace:*"`).
- `engines` field enforced (`node >= 20`).
- `onlyBuiltDependencies: ["esbuild"]` to skip unnecessary native builds.

**Go:**
- `go.sum` committed.
- Minimal deps: `cobra`, `gorilla/*`, `jsonschema`, `fsnotify` only.
- No indirect deps without justification.

**Upgrades:**
- Test before upgrading (especially breaking changes).
- Update lockfiles via `pnpm install` or `go get -u`.
- CI must pass before merging upgrade PR.

## Browser Compatibility

**Extension:**
- Chrome 120+ (MV3 required).
- Firefox 115+ (MV2 compat mode via WXT).
- Safari deferred to 1.1.

**Content script (fingerprint-core):**
- Pure DOM APIs (no framework coupling).
- ES2022 target (native support in Chrome 120+, Firefox 115+).
- No IE11 support, no legacy polyfills.

**Tested environments:**
- Chrome 120+ on Linux, macOS, Windows.
- Firefox 115+ on Linux, macOS, Windows.
- React 18+, Vue 3+, Angular 15+, Svelte 4+ (framework detection heuristics).

## Unresolved Conventions (Deferred)

- **Hybrid fingerprint scorer weights**: what signals, what coefficients? Deferred to 1.1. `MatchResult` interface stable, implementation can slot in.
- **AI-assisted capture prompt format**: no LLM integration in MVP, defer to 1.1.
- **Safari packaging requirements**: awaiting Apple MV3 parity clarity.

## References

- Biome config (lint + format): `biome.json`
- TypeScript config: `tsconfig.base.json`, `packages/*/tsconfig.json`
- Go build: `apps/cli/Makefile`
- CI workflow: `.github/workflows/ci.yml`
- Architecture: `docs/system-architecture.md`
- Codebase summary: `docs/codebase-summary.md`
