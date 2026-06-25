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

## Before opening a PR

Run the same gates CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm schema-validate          # ajv cross-validator

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
