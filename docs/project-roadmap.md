# Project Roadmap

> Tiếng Việt: [`vi/project-roadmap.md`](./vi/project-roadmap.md). English is the source of truth.

Specpin is released and under active development. This roadmap records what has shipped and what is planned or under consideration next.

## Initial release (2026-06-25)

Status: **DONE**. The first end-to-end build: implemented, tested, and code-reviewed. CI green. Independent review identified 7 issues (1 High, 4 Medium, 2 Low), all High/Medium resolved before completion.

### Delivered Features

**Core Infrastructure:**
- Monorepo scaffold (pnpm 11.9, Turborepo 2.10, Node >= 22, Go 1.26)
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

Independent review findings:
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

## Since the initial release

Goal: robustness, flexibility, polish. No timeline committed.

**Website shipped (2026-06-29)**: public marketing landing + a fresh end-user documentation set (EN + VI + JA), built as an Astro Starlight app in `apps/web`, targeting `specpin.ohnice.app` via GitHub Pages. The repo `docs/` set stays developer/contributor docs and is unrelated to the website's end-user content.

**First follow-up shipped (2026-06-26)** on branch `feat/spec-validate-cli-and-ci`:
- `specpin validate`: offline schema check of `.specs/` (exit 0 valid / 1 invalid / 2 cannot-run), symlink guard in the store, manifest-drift warning.
- CI spec-lint: in-repo step over the demo specs + a reusable composite action that builds the validator from a pinned ref (not the caller's PR).
- Manual spec source: render specs with no sidecar by pasting a validated `{ manifest, files }` bundle in Options; read-only, size-capped, prototype-pollution-guarded; controller now selects sidecar -> manual by availability.
- Modal renderer: centered focus-trapped dialog listing page specs (third display mode), AbortController teardown.

**Second slice shipped (2026-06-26)** on branch `feat/i18n-specs-multi-project`:
- Multi-language specs: `title`/`description`/`businessRules` are object-only `LocalizedString` (locale-keyed; flat strings rejected by both validators). Runtime language toggle in the popup (mirrored in the sidebar) with `defaultLocale` -> first-present fallback; translations authored per locale in the capture form. `description` values are now non-empty.
- Multi-project display: one extension connects to many sidecars at once via a `SidecarRegistry`; specs route to each page by the project's `domains`, tagged by project. Empty-`domains` projects need an explicit `applyToAllSites` opt-in (no silent every-site match). Per-connection token isolation, error isolation, jittered reconnect, and a general SW-wake watch re-establish (also fixes the latent single-connection case). Options page is now a connection manager (add/remove/reconnect, per-tab popup view, project labels on specs).

**Side panel surface shipped (2026-06-27)** on branch `feat/extension-sidepanel-surface`:
- Side panel (`entrypoints/sidepanel/`) as a persistent docked alternative to the popup: wider full-height layout, spec description + business rules shown inline, auto-refresh on tab activation / URL change / `SPECS_CHANGED`. Popup and side panel share one `fetchSurfaceState()` helper. WXT maps the single entrypoint to Chrome `side_panel` + Firefox `sidebar_action`. A stored `defaultSurface` preference (Options) chooses the toolbar-click surface on Chrome; Firefox keeps the popup on the toolbar button and opens the sidebar from its native toggle.

**Spec visibility toggle + tooltip UX shipped (2026-06-27)** on branch `feat/spec-visibility-toggle`:
- Tooltip renderer enhancements: full-width fix (`min(360px, 90vw)`); click badge to pin tip open (one at a time, close button); "Open in side panel" action highlights matching side-panel card (best-effort auto-open on Chrome, Firefox degrades to highlight-only). New messages `OPEN_SPEC_IN_PANEL` (content to background) and `HIGHLIGHT_SPEC` (background to side panel).
- Unified facet model for spec visibility: each spec gets facet keys `tag:<t>`, `file:<file>`, `spec:<id>`; `url:<glob>` is a page-level gate. One predicate `isVisible(spec, url, state)` in `apps/extension/src/shared/visibility.ts` decides rendering. Path glob matcher: `*` = one segment, `**` = across segments.
- Two-layer sync cascade: `effectiveDisabled = (teamHidden union personalForceHide) minus personalForceShow`. Team default from `.specs/views.json` (Git-committed, shared, authored via Options page, written via sidecar `PUT /views`). Personal override in `chrome.storage.sync` (cross-machine, personal wins). `spec:<id>` force-show is a hard per-spec rescue (wins over tag/file hide); `url:` page gate wins over everything. Empty state = all visible (backward compatible).
- Filter UI: facet checklists (Tags / Files / This page) in popup + side panel; per-spec eye toggle in side panel; Reset clears personal overrides. Team authoring on Options page (per connection, line-based facet-key editor).
- Schema: new `ViewsConfig` entity in `packages/spec-schema/schema/v1.json` = `{ version: string, hidden: string[] }`. Generated TS type + `validateViews` validator; Go `ValidateViews`; cross-validated fixtures at `tests/fixtures/views/{valid,invalid}` on both ajv and Go sides.
- Sidecar: new `GET /views` (returns `.specs/views.json` or empty default `{version:"1.0",hidden:[]}` when absent) and `PUT /views` (schema-validated, atomic, pretty-printed, .specs/-confined). Existing `.specs/` watcher already fires SSE on `views.json` write.
- api-client: `SidecarClient.getViews()` / `putViews()`, exported `ViewsConfig` type.
- New privileged messages: `SET_PERSONAL_VISIBILITY`, `SAVE_TEAM_VIEWS` (added to `PRIVILEGED_MESSAGE_TYPES`). `OPEN_SPEC_IN_PANEL` is non-privileged (read-only, from content script).

Planned, pending a real corpus / usage feedback: the hybrid weighted scorer (needs a before/after DOM corpus to tune), the FileSystem Access source, the overlay + inline-badge renderers, and the VSCode authoring extension.

**User-selectable theme shipped (2026-06-28)** on branch `feat/extension-theme-and-i18n`:
- Theme preference (System / Light / Dark) via Options page. Previously dark existed only behind `@media (prefers-color-scheme: dark)` (auto, no toggle). Now the user can force a theme. Generator emits four selector blocks in `tokens.gen.css`: `:root` (shared + light), `:root[data-theme="dark"]` (forced dark), `:root[data-theme="light"]` (forced light), and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="dark"]) { ... } }` (system default, applies only when no override). `tokens.ts` `scopeTokensToShadow()` rewrites all four forms to `:host(...)` for Shadow DOM renderers. `src/shared/theme.ts` exports `Theme`, `applyTheme(el, theme)`, `applyStoredTheme()`, `watchThemeChanges()`. `config.ts` gained `getTheme`/`setTheme` (storage.local key `specpin:theme`, default `system`). Live propagation: `SET_THEME` message + `broadcastToTabs()` helper; Options broadcasts to all tabs, pages react via `storage.onChanged`. `theme` is threaded into `renderSession` and each renderer applies it to its shadow host. Forced themes may flash the System default for one frame on load (async storage read, accepted).

**UI-chrome i18n (EN + VI + JA) shipped (2026-06-28)** on same branch `feat/extension-theme-and-i18n`:
- Custom runtime `t(key, params)` in `apps/extension/src/i18n/` (`index.ts` exports `t`, `initI18n`, `plural`, `hydrateI18n`, `watchUiLocaleChanges`; `locales.ts` defines `SUPPORTED=["en","vi","ja"]`, `UiLocale`, `resolveUiLocale`; `messages/en.ts` is source of truth with 258 keys; `messages/vi.ts` and `messages/ja.ts` are typed against `keyof Messages` for compile-time parity). This is a NEW, INDEPENDENT axis from the existing spec-content locale (`getLocale`/`setLocale`, `localize-spec.ts pickLocale`), which is unchanged. UI-chrome language = the extension's own buttons/labels/banners; spec-content locale = the language of the spec text from `.specs/`. Resolution precedence: stored `specpin:uiLocale` -> browser UI language -> "en". `config.ts` gained `getUiLocale`/`setUiLocale`. Static HTML is localized via `data-i18n` / `data-i18n-placeholder` / `data-i18n-aria` / `data-i18n-title` / `data-i18n-html` attributes hydrated by `hydrateI18n`. Options page has a Language control (System default / English / Tiếng Việt / 日本語). Change broadcasts `SET_UI_LOCALE` to tabs and re-renders in place via `renderAll()`; open popup/side panel re-render via `watchUiLocaleChanges` (storage.onChanged). Out of scope: localizing manifest name/description, RTL, locale-aware number/date formatting, languages beyond EN+VI+JA. Background SW error strings remain English (not an i18n surface).

**Hosted changelog shipped (2026-07-02)**:
- The website serves a `/changelog` page (`apps/web/src/pages/changelog.astro`, rendered via `StarlightPage` + `marked`) that reads `apps/extension/CHANGELOG.md` at build time, so an extension release surfaces on the site after the next deploy. `web-deploy.yml` adds `apps/extension/CHANGELOG.md` to its `paths:` filter so a release redeploys the site.
- The extension links to it: a "What's New" link in the Options Support & Feedback card (`options.changelog`, EN/VI/JA), plus an auto-open in a new tab on a significant update. The open decision lives in `apps/extension/src/shared/whats-new.ts` (`shouldOpenChangelog`): pre-1.0 any forward version bump opens (release-please emits `0.0.x` patches for real features); 1.0+ opens only on a minor/major bump. Wired via a dedicated `runtime.onInstalled` listener (separate from the idempotent `initWorker`) that reads `previousVersion` and stores `specpin:lastVersion`. First install never opens.
- Source scope: extension changelog only (the CLI + spec-schema changelogs are not on the page). No localized `/vi/` or `/ja/` changelog variants (the changelog body is English, generated from conventional commits).

**Reader-navigation features shipped (2026-07-02)** on branch `feat/reader-discovery-navigation`:
- Deep-link shareable specs: each spec gains a "Copy link" action (side-panel card + tooltip pin) that copies `<pageUrl>#specpin=<specId>`. Visiting that URL scrolls to + flashes the element and opens the side panel with the spec card highlighted. Graceful fallback: unknown id is a no-op; orphaned spec (exists but element is gone) opens the card + shows "element isn't on this page" toast. Same-page app fragments are preserved.
- Keyboard cycle navigation: `Alt+Shift+N` cycles focus through matched-and-visible specs on the page, flashing each element and wrapping around. Reduced-motion honored. Joins existing chords `Alt+Shift+S/M/C/G`.
- What-changed digest: popup + side panel show "N changed since last visit" plus a list of new/edited spec titles, with a "Mark all seen" button. Digest computed from per-project content-hash snapshot in `storage.local` (title + description + business rules across all locales). First-ever visit or newly-connected project seeds silently (no "everything new" noise).

### Planned Features

**Hybrid Weighted Fingerprint Scoring:**
- Multi-signal weighted matcher: when exact anchors fail, score cssSelector + xpath + domPath + text + labels + position + attrs with tuned coefficients
- Confidence threshold (0.0-1.0): above threshold -> render, below -> flag `needsReview`
- Collect real before/after DOM fixtures during dogfooding (corpus for tuning weights)
- `MatchResult` interface already stable, scorer slots in without breaking callers

**Additional Spec Sources:**
- Manual import source - **delivered** (read-only `{ manifest, files }` bundle in Options)
- FileSystem Access API source (browser prompt for `.specs/` directory access, no sidecar needed) - planned
- Source registry already pluggable (`SpecSource` interface)

**Additional Renderers:**
- Modal (centered dialog, for focused review) - **delivered**
- Overlay (fullscreen modal with backdrop) and inline badge (marker next to element) - planned
- Renderer registry already pluggable (`SpecRenderer` interface): tooltip + sidebar + modal implemented

**Safari Support:**
- Package extension for Safari (awaiting Apple MV3 parity clarity as of 2026-06)
- WXT claims Safari support, needs testing + packaging workflow

**AI-Assisted Authoring:**
- Shipped (host-agent path): a portable skill bundled in `@specpin/cli` (`apps/cli/skill/`, reachable via unpkg) teaches a coding agent (Claude Code, Cursor, etc.) to author schema-valid specs and drive the CLI. The host agent is the author; no LLM is added to the CLI. See `docs/ai-authoring.md`. `apps/cli/cmd/generate.go` now points users at this skill.
- Planned (CLI-side LLM `specpin generate`): a built-in generator that screenshots an element and infers title/description/rules. Model choice, prompt design, local vs cloud, and key management remain unresolved; the command stays a stub.

**Performance Optimization:**
- Move pre-POST spec validation from content script to background SW (drops ajv ~100 KB from content bundle, defers parse cost to SW thread)
- Lazy-load renderers (code-split tooltip/sidebar/overlay, load on first use)

**UX Polish:**
- Bundle web fonts (Inter, JetBrains Mono) as `@font-face` assets; the shipped UI design system currently references them via fallback stacks (`system-ui` / `ui-monospace`) so the branded typography is not guaranteed off-system
- Capture mode visual improvements (highlight quality, form styling)
- Keyboard shortcut customization UI
- Extension options page advanced settings

**Developer Experience:**
- VSCode extension for `.spec.json` authoring (schema autocomplete, validation, preview)
- GitHub Action for spec linting in PRs (validate all `.specs/*.json` against schema)
- CLI command `specpin validate` (offline schema check without serve)

## Future Exploration (no commitment)

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
- **Mobile app support** - browser extension only; mobile is future exploration.
- **Hosted/cloud sidecar** - localhost by default (remote is opt-in over an HTTPS reverse proxy); a managed cloud offering is future exploration.
- **Telemetry or usage tracking** - no analytics, no phone-home, no data collection (local analytics in future exploration, opt-in only).

## Versioning Strategy

**Current**: v0.0.0 (pre-release, internal dogfooding).

**Pre-1.0 (planned):**
- v0.1.0: first public release
- v0.2.0: planned features (hybrid scorer, FileSystem source, Safari)
- v0.3.0+: additional features, polish, bugfixes

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
- Mitigation: planned hybrid weighted scorer, `data-spec-id` attribute recommended for critical elements, `needsReview` flag surfaces ambiguous matches.

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
- Mitigation: current 450 KB under 500 KB target, a planned optimization moves ajv to SW (saves ~100 KB).

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-25 | Trimmed the initial release scope (defer FS/Manual sources, modal/overlay/badge, hybrid scorer, Safari, AI) | Deliver demoable end-to-end faster, validate core value prop before polish |
| 2026-06-25 | CLI language: Go (not Node) | Single static binary, no runtime deps, better fit for localhost server than Bun/Deno |
| 2026-06-25 | Fingerprint: exact anchors + cssSelector now, weighted scorer deferred | Initial release sufficient for demo, hybrid scorer needs real-world corpus for tuning |
| 2026-06-25 | Extension build: WXT | Cross-browser abstraction (Chrome MV3 + Firefox MV2), hot-reload, modern DX |
| 2026-06-25 | Test runner: Vitest (not node:test or Jest) | Vite-native, pairs with WXT, strong jsdom story for fingerprint-core |
| 2026-06-25 | Sidecar port: auto-pick free port (not fixed default) | Avoids first-run port conflicts, extension already reads pasted URL |
| 2026-06-25 | Capture mode: manual-only (no AI assist at launch) | Keeps all LLM work out of the initial release, no model dep or key management |
| 2026-06-25 | License: Apache-2.0 | Decided at the initial release (was a deferred gate in the plan) |
| 2026-06-26 | Localized spec content is object-only (`LocalizedString`), flat strings invalid | Pre-release, no external corpus and no compat promise; the schema is revised in place (still `v1.json`, no `v2.json` fork, no manifest version bump). One resolver reads all localized fields |
| 2026-06-26 | Empty-`domains` project needs explicit `applyToAllSites` opt-in | A silent every-site wildcard would leak a project's specs onto unrelated/attacker pages; the user opts in per connection |
| 2026-06-26 | SW-suspend watch loss fixed generally (shared `reestablish()` for 1 and N connections) | Same path serves the single-connection case too, fixing a latent MV3 bug rather than only the new multi-connection one |

## References

- Architecture: `docs/system-architecture.md`
- Run guide: `docs/run-guide.md`
- Schema: `docs/schema-reference.md`
- Design system: `docs/design-system.md`
- Codebase summary: `docs/codebase-summary.md`
- Code standards: `docs/code-standards.md`
- PDR: `docs/project-overview-pdr.md`
