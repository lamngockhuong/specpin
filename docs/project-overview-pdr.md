# Specpin Project Overview & PDR

> Tiếng Việt: [`vi/project-overview-pdr.md`](./vi/project-overview-pdr.md). English is the source of truth.

## Problem

Engineering teams lose context between what code does (implementation) and why it does it (business rules, acceptance criteria, edge cases). Specs scatter across Jira, Confluence, Notion, Slack threads, or get buried in stale PRs. Developers reverse-engineer intent from code, support staff escalate instead of checking the spec, and product changes orphan old decisions with no audit trail.

Existing solutions either generate code from specs (tight coupling, brittle) or document code after it ships (staleness, drift). Neither keeps business knowledge attached to the running interface itself.

## What Specpin Is (and Is NOT)

Specpin pins business specifications (rules, descriptions, acceptance criteria) directly onto elements of a running web UI. It is **NOT a spec-driven code generator** (unrelated to GitHub Spec Kit / OpenSpec). It does not produce application code from specs. It is a knowledge layer that attaches living, Git-versioned documentation to interfaces you already have. The interface already knows where everything is; Specpin gives it a memory.

Specs live as JSON inside the consumer repo's `.specs/` directory, are linked to elements through resilient fingerprints, and render in-browser through pluggable display modes (tooltip, sidebar, overlay, modal). Everything is local-first and Git-native: versioned, reviewable via PR, and diffable.

## Target Users

- **Frontend developers** checking business rules while implementing a form or debugging validation logic.
- **QA engineers** verifying acceptance criteria directly on the running UI without hunting through tickets.
- **Product managers** reviewing shipped features against original intent, writing new specs inline with the interface.
- **Support teams** understanding edge-case behavior without escalating to engineering.
- **New team members** learning domain rules by exploring the live UI with attached context.

## Goals

1. **Zero-drift spec layer**: specs live in the same repo as code, version together, review together via PR.
2. **Interface-first authoring**: capture specs by clicking the target element in the running UI, not by guessing CSS selectors or writing abstract docs.
3. **Pluggable rendering**: tooltip (peek), sidebar (focused read), overlay/modal (full-screen edit), inline badge (visual marker). Ships with tooltip + sidebar in MVP.
4. **Resilient matching**: fingerprints survive refactors. Exact anchors (test-id, aria, data-spec-id) match first; hybrid weighted scoring falls back when layout changes.
5. **Local-first, Git-native**: no SaaS backend, no auth wall, no vendor lock-in. Sidecar runs on localhost, specs diff cleanly in Git.

## Key Features (MVP - Phase 1)

- **Go sidecar CLI**: `specpin init` scaffolds `.specs/manifest.json`, `specpin serve` exposes the spec store over token-authenticated localhost HTTP + SSE for live-reload.
- **Browser extension (WXT, MV3)**: Chrome + Firefox support. Background SW connects to sidecar, content script matches fingerprints and renders specs.
- **Two renderers**: tooltip (hover to peek) and sidebar (persistent read/write panel).
- **Manual capture mode**: click an element, fill form (title, description, rules), save to `.specs/`.
- **Exact-match fingerprinting**: tries test-id anchors, aria, non-generated id, unique cssSelector, xpath. Flags `needsReview` when ambiguous. `data-spec-id` attribute guarantees exact match.
- **JSON Schema v1**: single source of truth for spec format. Validated client-side (ajv) and server-side (Go jsonschema). CI cross-validates both.
- **Demo app**: React 19 + Vite example with seeded `.specs/` for instant tryout.

## Non-Goals (Deferred to 1.1+)

- AI-assisted capture (`specpin generate`) - no LLM dependency in MVP.
- FileSystem Access API source adapter - sidecar-only for MVP.
- Hybrid weighted fingerprint scoring - exact anchors sufficient for MVP.
- Safari packaging - Chrome + Firefox only in MVP.
- Overlay, modal, inline-badge renderers - tooltip + sidebar sufficient for MVP.
- Manual CSV/JSON import source - write via extension only.

## Scope Boundaries

**In scope:**
- Local development workflow (serve + extension on localhost).
- Git-based collaboration (PR reviews of spec changes).
- Read + write specs via extension on any web page the sidecar serves.
- Keyboard shortcuts for capture mode (Ctrl+Shift+C toggle).

**Out of scope:**
- Multi-user real-time collaboration (no CRDT, no WebSocket sync beyond SSE reload).
- Hosted/cloud sidecar (localhost-only in MVP).
- Spec analytics, usage tracking, or telemetry.
- Integration with external tools (Jira, Linear, Notion) - pure Git workflow.
- Mobile app support (browser extension only).

## Success Criteria

**Phase 1 MVP (achieved):**
- [ ] End-to-end demoable: serve demo app, load extension, see seeded specs render (tooltip + sidebar).
- [ ] Capture new spec via manual form, save to `.specs/`, verify write + SSE reload.
- [ ] Schema validated both client (ajv) and server (Go), CI cross-validates fixtures.
- [ ] Extension builds for Chrome (MV3) + Firefox (MV2).
- [ ] Sidecar security: 127.0.0.1 bind, token auth, CORS restricted to extension origins, path-traversal guard, no web origin access.
- [ ] CI green: lint, typecheck, test (TS + Go), build (workspace + sidecar), schema drift check.

**Phase 1.1 (planned):**
- FileSystem + Manual sources for importing existing specs.
- Hybrid weighted fingerprint scoring for robustness under refactors.
- Overlay/modal/inline-badge renderers.
- Safari packaging.
- `specpin generate` (AI-assisted spec authoring).

## Architecture Summary

Three-tier local-first flow:

```
.specs/ (consumer repo, Git-versioned JSON)
   |
   v
specpin serve (Go sidecar, localhost HTTP+SSE, token-auth, 127.0.0.1 only)
   |
   v
browser extension (WXT MV3, Chrome+Firefox)
   - background SW: SidecarClient + spec cache + SSE relay
   - content script: matchElement(fingerprint) -> render(tooltip|sidebar)
   - popup/options: connection config, on/off toggle, capture trigger
```

One schema, two validators: `packages/spec-schema/schema/v1.json` is the SSOT. TS side validates with ajv. Go sidecar embeds a copy at `apps/cli/internal/schema/v1.json`, synced via `make sync-schema`, validated with `santhosh-tekuri/jsonschema/v6`. CI cross-validates both against a shared fixture corpus and fails on drift.

## Non-Functional Requirements

- **Performance**: extension content script bundle < 500 KB uncompressed (MVP: ~450 KB with ajv). Fingerprint match < 50ms per element (MVP: < 10ms for exact anchors). Render latency < 100ms after match.
- **Security**: sidecar binds 127.0.0.1 only, auto-picks free port, requires Bearer token on every request, CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`), rejects web origins, path-traversal guard on writes, no external network access.
- **Compatibility**: Node >= 20, pnpm 10, Go 1.26, Chrome 120+ (MV3), Firefox 115+ (MV2 compat). Fingerprinting pure DOM (no framework coupling).
- **Maintainability**: TypeScript strict mode + noUncheckedIndexedAccess. Biome (lint + format). Generated files (`*.gen.*`) never hand-edited. Monorepo Turborepo orchestration. Vitest for all TS packages, Go stdlib testing for CLI.
- **Licensing**: Apache-2.0 (decided Phase 1 completion).

## Risks & Mitigations

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| Go/TS schema drift (two validators) | Critical | CI `make check-schema` + cross-validate fixtures through both | Implemented |
| Fingerprint brittleness on refactors | High | Exact anchors (test-id, aria, data-spec-id) preferred; hybrid scorer deferred but interface stable | Deferred (1.1) |
| Extension content-script bundle bloat | Medium | Ajv validator (~100 KB) in content script; consider moving validation to SW in 1.1 | Accepted (MVP) |
| Port conflicts on multi-project devs | Low | Auto-pick free port unless --port override | Implemented |
| Cross-origin spec leak to look-alike subdomains | High | Host-exact or label-boundary subdomain match only; regression test | Fixed (Phase 1) |

## Unresolved Questions

1. **Hybrid fingerprint scorer design**: what signals, what weights, what confidence threshold triggers `needsReview`? Deferred to 1.1; placeholder interface exists (`MatchResult` shape stable).
2. **FileSystem Access API permissions UX**: how to prompt user for `.specs/` directory access without breaking capture flow? Deferred to 1.1.
3. **Safari packaging timeline**: MV3 parity unclear as of 2026-06. Await Apple clarity.
4. **AI-assisted capture (`specpin generate`)**: what model, what prompt shape, local vs cloud, key management? Deferred to 1.1; no decision sealed.

## References

- Plan: `plans/260625-1504-specpin-phase1-mvp/plan.md`
- Architecture: `docs/system-architecture.md`
- Run guide: `docs/run-guide.md`
- Schema: `docs/schema-reference.md`
- Design system: `docs/design-system.md`
- Phase 1 journal: `docs/journals/260625-specpin-phase1-mvp.md`
