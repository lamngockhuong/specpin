<p align="center">
  <img src="apps/extension/designs/specpin-icon.png" alt="Specpin" width="96" height="96" />
</p>

# Specpin

**Specpin pins business specifications (rules, descriptions, acceptance criteria) directly onto the elements of a running web UI. It is NOT a spec-driven code generator** (unrelated to GitHub Spec Kit / OpenSpec): it does not generate application code from specs. It is a knowledge layer that attaches living, Git-versioned documentation onto interfaces you already have. The interface already knows where everything is; Specpin gives it a memory.

Specs live as JSON inside the consumer repo's `.specs/` directory, are linked to elements through resilient fingerprints, and render in-browser through pluggable display modes (tooltip, sidebar, modal). Spec content is multi-language (locale-keyed), and one extension can connect to several projects at once, routing specs to each page by origin. Everything is local-first and Git-native: versioned, reviewable via PR, and diffable.

## How it fits together

```
.specs/ (in your repo)  -->  specpin serve (Go sidecar, localhost HTTP + SSE)  -->  browser extension (match + render)
```

1. `specpin init` scaffolds `.specs/manifest.json` in your repo.
2. `specpin serve` exposes `.specs/` over a token-authenticated localhost HTTP API with live-reload (SSE).
3. The browser extension connects to the sidecar, matches each spec's fingerprint against the live DOM, and renders the spec on its element.

## Monorepo layout

```
specpin/
├── apps/
│   ├── extension/            # WXT MV3 cross-browser extension (Chrome + Firefox)
│   └── cli/                  # Go sidecar binary: init + serve
├── packages/
│   ├── spec-schema/          # JSON Schema v1 (SSOT) + generated TS types + validators
│   ├── fingerprint-core/     # framework-agnostic capture + match (DOM only)
│   └── api-client/           # typed TS client over the sidecar HTTP contract
├── examples/
│   └── demo-react-app/       # sample app + seeded .specs/ for trying Specpin
└── docs/                     # architecture, run guide, schema reference
```

## Toolchain

- Node >= 20, pnpm 10, Turborepo
- Go 1.26 (sidecar CLI)
- Vitest (all TS packages)

## Workspace scripts

```bash
pnpm install        # install workspace deps
pnpm build          # turbo run build across packages
pnpm test           # turbo run test (vitest per package)
pnpm lint           # biome check . (lint + format + import organize)
pnpm typecheck      # tsc --noEmit per package
```

## Documentation

> Tiếng Việt: bản dịch các tài liệu nằm trong [`docs/vi/`](./docs/vi/). English is the source of truth.

- `docs/project-overview-pdr.md` - product overview, problem statement, goals, PDR
- `docs/codebase-summary.md` - per-package summary, key files, responsibilities
- `docs/code-standards.md` - TS/Go conventions, tooling config, schema management
- `docs/project-roadmap.md` - Phase 1 MVP completion + 1.1 planned features
- `docs/system-architecture.md` - components, packages, fingerprinting, security model
- `docs/run-guide.md` - the full end-to-end loop (init → serve → load extension → connect → render → capture)
- `docs/schema-reference.md` - the v1 spec format
- `docs/design-system.md` - extension UI mockups + shared color/font token workflow

## Contributing

See `.github/CONTRIBUTING.md`. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm schema-validate`, plus `make check-schema && go test ./...` in `apps/cli`, before opening a PR.

## License

[Apache-2.0](./LICENSE).

## Status

Phase 1 MVP shipped, plus 1.1 slices: a Go sidecar serves `.specs/`, and the WXT extension matches fingerprints and renders specs (tooltip + sidebar + modal) with manual capture. Specs are multi-language with an in-browser language toggle and per-locale authoring; the extension connects to multiple projects at once, routed by origin. Also delivered: offline `specpin validate`, CI spec-lint, a read-only Manual import source, user-selectable theme (System / Light / Dark), and UI-chrome i18n (EN + VI, independent from spec-content language). Still deferred: the FileSystem Access source, hybrid fingerprint scoring, the overlay + inline-badge renderers, Safari packaging, and `specpin generate` (AI).
