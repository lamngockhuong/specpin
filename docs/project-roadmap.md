# Project Roadmap

> Tiếng Việt: [`vi/project-roadmap.md`](./vi/project-roadmap.md). English is the source of truth.

Specpin development follows a phased approach: deliver demoable MVP first, defer polish and advanced features to 1.1+.

## Phase 1 MVP (Completed 2026-06-25)

Status: **DONE**. All 8 phases implemented, tested, and code-reviewed. CI green. Independent review identified 7 issues (1 High, 4 Medium, 2 Low), all High/Medium resolved before completion.

### Delivered Features

**Core Infrastructure:**
- Monorepo scaffold (pnpm 10.33, Turborepo 2.3, Node >= 20, Go 1.26)
- JSON Schema v1 (SSOT) with generated TS types and ajv validators
- Go sidecar embeds synced copy of schema, validates with `santhosh-tekuri/jsonschema/v6`
- CI cross-validates fixtures through both validators, fails on schema drift

**Fingerprinting (exact match only):**
- Framework-agnostic `captureFingerprint(element)` captures: test-id anchors, aria, non-generated id, cssSelector, xpath, domPath, text, attrs, labels, position, framework hint
- `matchElement(fingerprint)` tries exact anchors first (confidence 1.0), then unique cssSelector (0.7), else flags `needsReview`
- `data-spec-id` attribute guarantees exact match (recommended for critical elements)
- Pure DOM APIs, no framework coupling, 90%+ test coverage

**Go Sidecar CLI:**
- `specpin init` scaffolds `.specs/manifest.json`
- `specpin serve` binds 127.0.0.1, auto-picks free port, prints token, exposes CRUD + SSE
- Security: token auth on all requests, CORS restricted to extension origins (`chrome-extension://`, `moz-extension://`), path-traversal guard on writes, no web origin access
- Atomic writes (temp + rename), pretty-printed JSON (2-space indent) for clean Git diffs
- Fsnotify watcher triggers SSE broadcasts on `.specs/` changes

**Browser Extension (WXT MV3):**
- Chrome 120+ (MV3) and Firefox 115+ (MV2 compat) builds
- Background SW: `SidecarClient` lifecycle, SSE relay to content scripts
- Content script: fetch specs, match fingerprints, render via pluggable `SpecRenderer` interface
- Two renderers: tooltip (hover peek) and sidebar (persistent panel listing all specs)
- Manual capture mode: click element, fill form (title, description, rules, tags), save to `.specs/`
- Keyboard shortcut: Ctrl+Shift+C toggles capture mode
- Shadow DOM isolation for all injected UI (no style leaks)

**Demo + Docs:**
- React 19 + Vite demo app with seeded `.specs/` (manifest + 2 spec files)
- `docs/system-architecture.md` (55 lines), `run-guide.md` (88 lines), `schema-reference.md` (64 lines), `design-system.md` (79 lines)
- CI workflow (JS + Go jobs): lint, typecheck, test, build, schema-validate, schema-drift-check
- License: Apache-2.0

### Phase Breakdown (8 phases, dependency graph)

1. **Monorepo Scaffold** (P1, 0.5d) - pnpm workspace, Turborepo, Biome (lint + format), Vitest, tsconfig.base.json
2. **Spec Schema** (P1, 0.5d, depends on 1) - `packages/spec-schema`: v1.json + generated types + ajv validators
3. **Fingerprint Core** (P1, 1.5d, depends on 1,2) - `packages/fingerprint-core`: capture + match (exact anchors + cssSelector fallback)
4. **Go Sidecar CLI** (P1, 2d, depends on 2) - `apps/cli`: init + serve (CRUD, SSE, token auth, CORS, schema validation)
5. **API Client** (P2, 1d, depends on 2,4) - `packages/api-client`: typed `SidecarClient` + SSE helper with exponential backoff
6. **Extension Read-Only** (P2, 2d, depends on 3,5) - `apps/extension`: background SW + content script + popup + tooltip renderer (first demoable milestone)
7. **Renderers and Capture** (P1, 2d, depends on 6) - sidebar renderer + capture mode + keyboard shortcuts + manual spec authoring
8. **Demo App Docs CI** (P2, 1d, depends on 6,7) - `examples/demo-react-app` + docs + CI (lint, test, build, schema cross-validation)

**Dependency flow:**
- P1 (scaffold) -> P2 (schema) -> P3 (fingerprint)
- P2 -> P4 (CLI), P2 -> P5 (API client), P4 -> P5
- P3 + P5 -> P6 (extension read-only, first demo)
- P6 -> P7 (capture + sidebar)
- P6 -> P8 (demo + docs + CI)

### Code Review Findings (all High/Medium resolved)

Independent review (`plans/reports/from-code-reviewer-to-orchestrator-specpin-mvp-review-report.md`):
- **0 Critical**
- **1 High** - H1: origin-match too loose (spec leak to look-alike subdomains). Fixed: host-exact or label-boundary subdomain only, regression test added.
- **4 Medium** - M1: capture crash on framework-generated ids (fixed: escaped + guarded label lookup). M2: SaveSpec could overwrite manifest.json (fixed: `.spec.json` suffix required). M3: SSE backoff reset on flaky connect (fixed: reset only after 5s stable). M4: config mutation from content script (fixed: rejected unless from extension page).
- **4 Low** - L2 (watch doc), L3 (suppress pointerdown/mousedown in capture) fixed. L1 (xpath id escape, stored-only), L4 (`:nth-of-type` keyed off compound) accepted as low-risk.

### Metrics

- **LOC**: ~4,820 source (83 TS files + 17 Go files), ~61,500 generated (ajv validators)
- **Test coverage**: fingerprint-core 90%+, other packages unit-tested (Vitest + Go stdlib testing)
- **Build times**: TS workspace < 30s, Go CLI < 5s, extension < 20s
- **Bundle size**: extension content script ~450 KB uncompressed (ajv validator included, under 500 KB target)
- **Performance**: fingerprint match < 10ms (exact anchors), render latency < 100ms

## Phase 1.1 (In progress)

Goal: robustness, flexibility, polish. No timeline committed.

**Lean first slice shipped (2026-06-26)** on branch `feat/spec-validate-cli-and-ci` (plan: `plans/260626-1415-specpin-phase-1-1/`):
- `specpin validate`: offline schema check of `.specs/` (exit 0 valid / 1 invalid / 2 cannot-run), symlink guard in the store, manifest-drift warning.
- CI spec-lint: in-repo step over the demo specs + a reusable composite action that builds the validator from a pinned ref (not the caller's PR).
- Manual spec source: render specs with no sidecar by pasting a validated `{ manifest, files }` bundle in Options; read-only, size-capped, prototype-pollution-guarded; controller now selects sidecar -> manual by availability.
- Modal renderer: centered focus-trapped dialog listing page specs (third display mode), AbortController teardown.

Deferred from this slice pending a real corpus / usage feedback: the hybrid weighted scorer (needs a before/after DOM corpus to tune), the FileSystem Access source, the overlay + inline-badge renderers, and the VSCode authoring extension.

### Planned Features

**Hybrid Weighted Fingerprint Scoring:**
- Multi-signal weighted matcher: when exact anchors fail, score cssSelector + xpath + domPath + text + labels + position + attrs with tuned coefficients
- Confidence threshold (0.0-1.0): above threshold -> render, below -> flag `needsReview`
- Collect real before/after DOM fixtures during dogfooding (corpus for tuning weights)
- `MatchResult` interface already stable, scorer slots in without breaking callers

**Additional Spec Sources:**
- FileSystem Access API source (browser prompt for `.specs/` directory access, no sidecar needed)
- Manual CSV/JSON import source (paste or upload existing specs)
- Source registry already pluggable (`SpecSource` interface), sidecar is first implementation

**Additional Renderers:**
- Overlay (fullscreen modal with backdrop, for detailed editing)
- Modal (centered dialog, for focused review)
- Inline badge (visual marker next to element, click to expand)
- Renderer registry already pluggable (`SpecRenderer` interface), tooltip + sidebar are first implementations

**Safari Support:**
- Package extension for Safari (awaiting Apple MV3 parity clarity as of 2026-06)
- WXT claims Safari support, needs testing + packaging workflow

**AI-Assisted Capture (`specpin generate`):**
- LLM integration for spec authoring: screenshot element, infer title/description/rules from context
- Model choice, prompt design, local vs cloud, key management - all unresolved
- Stub command already exists (`apps/cli/cmd/generate.go`), prints "deferred to 1.1"

**Performance Optimization:**
- Move pre-POST spec validation from content script to background SW (drops ajv ~100 KB from content bundle, defers parse cost to SW thread)
- Lazy-load renderers (code-split tooltip/sidebar/overlay, load on first use)

**UX Polish:**
- Bundle web fonts (Inter, JetBrains Mono) as `@font-face` assets; the shipped UI design system currently references them via fallback stacks (`system-ui` / `ui-monospace`) so the branded typography is not guaranteed off-system
- Capture mode visual improvements (highlight quality, form styling)
- Sidebar search/filter specs
- Keyboard shortcut customization UI
- Extension options page (advanced settings, theme toggle)

**Developer Experience:**
- VSCode extension for `.spec.json` authoring (schema autocomplete, validation, preview)
- GitHub Action for spec linting in PRs (validate all `.specs/*.json` against schema)
- CLI command `specpin validate` (offline schema check without serve)

## Future Exploration (Beyond 1.1, no commitment)

**Multi-repo spec aggregation:**
- Aggregate specs from multiple repos (microservices, monorepos with separate .specs/)
- Sidecar serves union of specs, extension fetches from multiple sidecar instances

**Spec analytics:**
- Track which specs are viewed, how often, by whom (local only, no telemetry)
- Identify stale specs (not viewed in N months, flag for review)

**Collaboration features:**
- Comments on specs (PR-style review flow)
- Approval workflow (spec requires sign-off before merge)
- Conflict resolution (two devs edit same spec, merge UI)

**Integration with external tools:**
- Jira/Linear issue link in spec metadata (click to open ticket)
- Notion/Confluence sync (two-way, specs mirror external docs)
- Slack notifications on spec changes (team channel, opt-in)

**Mobile support:**
- React Native / Flutter devtools plugin (attach specs to mobile UI elements)
- QR code scan to load spec viewer on device

**Spec versioning:**
- Track spec history (who changed what, when, why)
- Diff view between versions (like Git blame for specs)
- Rollback to previous version

**Spec templates:**
- Pre-fill common spec patterns (form validation, API error handling, auth flows)
- Team-specific templates (company-wide acceptance criteria format)

## Non-Goals (explicitly out of scope)

- **Code generation from specs** - Specpin is a knowledge layer, not a code generator. It attaches docs to existing UIs, does not produce app code.
- **SaaS backend** - local-first, Git-native, no vendor lock-in. Sidecar runs on localhost only.
- **Real-time multi-user collaboration** - no CRDT, no WebSocket sync beyond SSE reload. Collaboration via Git PRs.
- **Mobile app support** (phase 1.1) - browser extension only, mobile deferred to future exploration.
- **Hosted/cloud sidecar** - localhost-only in MVP and 1.1, cloud deployment deferred to future exploration.
- **Telemetry or usage tracking** - no analytics, no phone-home, no data collection (local analytics in future exploration, opt-in only).

## Versioning Strategy

**Current**: v0.0.0 (pre-release, internal dogfooding).

**Pre-1.0 (planned):**
- v0.1.0: Phase 1 MVP release (first public)
- v0.2.0: Phase 1.1 features (hybrid scorer, FileSystem source, Safari)
- v0.3.0+: additional 1.1 features, polish, bugfixes

**1.0 criteria (not yet defined):**
- Hybrid fingerprint scorer validated in production
- Safari support confirmed
- 6+ months dogfooding with no Critical/High bugs
- Documentation complete (user guide, API reference, migration guides)
- Stable schema v1 (no breaking changes for 1.x series)

**Post-1.0:**
- Semantic versioning: MAJOR.MINOR.PATCH
- Breaking changes (schema format, API contracts) -> MAJOR bump
- New features (renderers, sources, AI assist) -> MINOR bump
- Bugfixes, performance, security -> PATCH bump

## Release Cadence (not yet committed)

Planned after public release:
- **Minor releases**: every 2-3 months (new features, non-breaking)
- **Patch releases**: as needed (hotfixes, security, critical bugs)
- **Major releases**: 12-18 months (breaking changes, schema v2+)

## Dependencies & Risks

**Schema stability:**
- Risk: breaking changes to v1.json format invalidate existing `.specs/` repos
- Mitigation: schema v1 locked after 1.0, all 1.x releases compatible. v2 only with major version bump and migration guide.

**Fingerprint brittleness:**
- Risk: refactors break matches, specs become orphaned
- Mitigation: hybrid weighted scorer in 1.1, `data-spec-id` attribute recommended for critical elements, `needsReview` flag surfaces ambiguous matches.

**Extension API changes:**
- Risk: Chrome/Firefox manifest v3/v2 API shifts break extension
- Mitigation: WXT abstracts cross-browser differences, track Chrome/Firefox release notes, test on beta channels.

**Go/TS schema drift:**
- Risk: ajv and Go validator diverge, accept different specs
- Mitigation: CI `make check-schema` + cross-validate fixtures through both, fail on disagreement.

**Sidecar port conflicts:**
- Risk: auto-picked port collides with other localhost services
- Mitigation: auto-pick free port (bind `:0`, read assigned), retry on failure, `--port` override available.

**Bundle size bloat:**
- Risk: content script exceeds browser extension size limits
- Mitigation: current 450 KB under 500 KB target, 1.1 optimization moves ajv to SW (saves ~100 KB).

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-25 | Trimmed MVP scope (defer FS/Manual sources, modal/overlay/badge, hybrid scorer, Safari, AI) | Deliver demoable end-to-end faster, validate core value prop before polish |
| 2026-06-25 | CLI language: Go (not Node) | Single static binary, no runtime deps, better fit for localhost server than Bun/Deno |
| 2026-06-25 | Fingerprint: exact anchors + cssSelector now, weighted scorer deferred | MVP sufficient for demo, hybrid scorer needs real-world corpus for tuning |
| 2026-06-25 | Extension build: WXT | Cross-browser abstraction (Chrome MV3 + Firefox MV2), hot-reload, modern DX |
| 2026-06-25 | Test runner: Vitest (not node:test or Jest) | Vite-native, pairs with WXT, strong jsdom story for fingerprint-core |
| 2026-06-25 | Sidecar port: auto-pick free port (not fixed default) | Avoids first-run port conflicts, extension already reads pasted URL |
| 2026-06-25 | Capture mode: manual-only (no AI assist in MVP) | Keeps all LLM work out of MVP, no model dep or key management |
| 2026-06-25 | License: Apache-2.0 | Decided during Phase 1 completion (was deferred gate in plan) |

## References

- Plan: `plans/260625-1504-specpin-phase1-mvp/plan.md`
- Phase files: `plans/260625-1504-specpin-phase1-mvp/phase-*.md` (8 files)
- Code review: `plans/reports/from-code-reviewer-to-orchestrator-specpin-mvp-review-report.md`
- Architecture: `docs/system-architecture.md`
- Run guide: `docs/run-guide.md`
- Schema: `docs/schema-reference.md`
- Design system: `docs/design-system.md`
- Journal: `docs/journals/260625-specpin-phase1-mvp.md`
- Codebase summary: `docs/codebase-summary.md`
- Code standards: `docs/code-standards.md`
- PDR: `docs/project-overview-pdr.md`
