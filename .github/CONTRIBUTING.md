# Contributing to Specpin

Thanks for your interest. Specpin is a Git-native knowledge layer that pins business specs to UI elements. It is **not** a code generator: keep that distinction in mind when proposing features and docs.

## Setup

```bash
pnpm install
pnpm build
```

Go sidecar:

```bash
cd apps/cli && make build
```

## Pre-commit hook

`pnpm install` auto-installs a lefthook pre-commit hook that runs Biome (with autofix + re-stage) and typecheck on your staged changes, so red commits are caught locally. Bypass a single commit with `git commit --no-verify`.

## Before opening a PR

Run the same gates CI runs. The JS gate is one command:

```bash
pnpm check                    # lint + typecheck + test + schema-validate (ajv cross-validator)
```

The Go sidecar has its own toolchain. Run it too, or use the combined script:

```bash
pnpm check:all                # pnpm check, then the apps/cli Go gate below

# equivalent Go steps:
cd apps/cli
make check-schema             # embedded schema must match packages/spec-schema
go vet ./... && go test ./...
```

## Conventions

- TypeScript + Go. Match existing local patterns; keep files focused (~200 lines).
- Conventional commits (`feat:`, `fix:`, `docs:`, ...). No AI attribution in commit messages.
- The JSON Schema is the single source of truth. Never hand-edit `*.gen.ts` or the embedded `apps/cli/internal/schema/v1.json`; change `packages/spec-schema/schema/v1.json` and regenerate (`pnpm --filter @specpin/spec-schema gen`, `make sync-schema`).
- New behavior needs tests. `fingerprint-core` carries the highest coverage bar.

## Project layout

See `docs/system-architecture.md` for the package map and `docs/run-guide.md` for the end-to-end loop.
