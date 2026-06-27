# Specpin System Architecture

> Tiếng Việt: [`vi/system-architecture.md`](./vi/system-architecture.md). English is the source of truth.

Specpin pins business specifications onto the elements of a running web UI. It is **not** a spec-driven code generator: it does not produce application code from specs. It is a Git-native knowledge layer that attaches living documentation to interfaces you already have.

## Components

```
.specs/ (consumer repo)
   |  read/write JSON
   v
specpin serve  ── Go sidecar ──  localhost HTTP + SSE (token-authenticated, 127.0.0.1 only)
   ^
   |  fetch() from the background service worker
   v
browser extension (WXT, MV3)
   - background SW: SidecarRegistry (N connections) + per-connection cache + SSE relay
   - content script: matchElement(fingerprint) -> render (tooltip / sidebar / modal)
   - popup + side panel + options: connection manager, locale toggle, on/off, capture
```

The extension exposes two equivalent control surfaces backed by the same background messaging: the **popup** (ephemeral dropdown) and a **side panel** (`entrypoints/sidepanel/`, a persistent docked page that shows spec description + business rules inline and auto-refreshes on tab/navigation changes and `SPECS_CHANGED`). Both fetch through one shared `fetchSurfaceState()` helper. WXT maps the single `sidepanel` entrypoint to Chrome `side_panel` and Firefox `sidebar_action`. A stored `defaultSurface` preference decides whether a toolbar click opens the popup or the side panel; the background applies it on Chrome via `chrome.action.setPopup` + `sidePanel.setPanelBehavior` (Firefox keeps the popup on the toolbar button and opens the sidebar from its native toggle).

Data flows one schema, two validators: the published JSON Schema (`packages/spec-schema/schema/v1.json`) is the single source of truth. The TS side validates with ajv; the Go sidecar embeds the same file and validates with `santhosh-tekuri/jsonschema/v6`. CI cross-validates a shared fixture corpus through both and fails on drift. This applies to all schema entities: `Spec`, `SpecManifest`, `SpecFile`, and `ViewsConfig`.

## Packages

| Path | Role |
|------|------|
| `packages/spec-schema` | JSON Schema v1 (SSOT) + generated TS types + ajv validators |
| `packages/fingerprint-core` | framework-agnostic `captureFingerprint` + `matchElement` (pure DOM) |
| `packages/api-client` | typed `SidecarClient` over the sidecar HTTP contract + SSE helper |
| `apps/cli` | Go sidecar: `init` + `serve` (CRUD, SSE, health), hardened localhost |
| `apps/extension` | WXT MV3 extension (Chrome + Firefox) |
| `examples/demo-react-app` | demo UI + seeded `.specs/` |

## Element fingerprinting

A fingerprint captures multiple signals per element (test-id anchors, aria, non-generated id, optimized cssSelector, xpath, domPath, text, whitelisted attributes, nearby labels, position, framework hint). Matching (MVP) tries exact anchors first (confidence 1.0), then a unique cssSelector (0.7), otherwise flags `needsReview`. A `data-spec-id` attribute on important elements makes matching trivially exact.

The matcher's signature and `MatchResult` shape are stable so the deferred hybrid weighted scorer can slot in without breaking callers.

## Multi-project registry

The background holds a `SidecarRegistry`: a map of independent sidecar connections, each with its own URL, bearer token, spec cache, and SSE watch, plus the page-owned Manual-import source (a list of removable batches, each its own validated bundle, not a single slot). For any page, `specsForOrigin(origin)` aggregates the specs of every connection whose project `domains` cover that origin, tagging each spec with its connection id + project name (ids are never deduped across projects, since two projects may share a spec id), then adds every manual batch whose `domains` cover the origin (repeated spec ids deduped across batches, first wins).

- **Origin gate (the confidentiality boundary).** Only origin-matching connections contribute specs. A connection whose manifest pins no `domains` does **not** silently match every site: it matches only when the user explicitly opts in (`applyToAllSites`); otherwise it is inactive. A disabled connection (optional `Connection.enabled` flag, undefined = enabled) serves no page; the enable/disable toggle is gated centrally at `SidecarConnection.matchesOrigin` (same boundary as origin/domain matching) and is distinct from the global on/off switch (which toggles all sources at once). The SSE "something changed" broadcast pings all tabs and is best-effort only - it is not the boundary; the content script re-queries `specsForOrigin`, which is.
- **Per-connection isolation.** A failing connection (unreachable sidecar, bad manifest) records its error and contributes zero specs; it never aborts aggregation for the others.
- **Service-worker lifecycle.** MV3 suspends the worker and kills SSE streams. A shared `reestablish()` rebuilds all connections from storage and restarts their watches; it runs at module eval and on `onStartup` / `onInstalled` / a keepalive alarm, so watches recover for one or many connections. Reconnect backoff is jittered per connection to avoid a thundering herd.

## Localization

Spec business content (`title`, `description`, `businessRules`) is stored as locale-keyed objects (`LocalizedString`); see `docs/schema-reference.md`. A single `resolveLocalized(value, locale, defaultLocale)` resolver (prototype-pollution safe) is the only reader; renderers never touch the raw object. A viewer picks a language in the popup (mirrored in the sidebar); the choice persists and re-renders all display modes, falling back to `defaultLocale` then the first present value. Translations are authored in the capture/edit form per locale.

## Spec Visibility Filtering

A unified facet model controls which specs render. Each spec has facet keys: `tag:<t>` (one per tag), `file:<file>`, `spec:<id>`. Page-level gate: `url:<glob>` (matches the current page path using `*` for one segment, `**` for across segments). One predicate `isVisible(spec, url, state)` in `apps/extension/src/shared/visibility.ts` decides rendering.

Two-layer sync cascade: `effectiveDisabled = (teamHidden union personalForceHide) minus personalForceShow`.

- **Team default** from `.specs/views.json` (Git-committed, shared). Authored via the extension Options page (per connection), written to `.specs/views.json` via sidecar `PUT /views` (schema-validated). When absent, sidecar returns the empty default `{ version: "1.0", hidden: [] }` via `GET /views` (all specs visible).
- **Personal override** in `chrome.storage.sync` (per browser profile, cross-machine). A personal force-show of `spec:<id>` is a hard per-spec rescue (wins over a tag/file hide). Tag/file/url force-show only un-hides its own key. The `url:` page gate wins over everything.

Empty state everywhere = all visible (backward compatible). Filter UI: facet checklists (Tags / Files / This page) in popup + side panel; per-spec eye toggle in side panel; Reset clears personal overrides.

## Security model (sidecar)

- Binds `127.0.0.1` only; the port is auto-picked unless `--port` is given.
- Every request requires `Authorization: Bearer <token>` (printed on `serve`).
- CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); web origins are rejected.
- Writes are confined to `.specs/` (path-traversal guard), atomic, and pretty-printed for clean Git diffs.
- **Multi-token trust model.** With N connections the extension stores N localhost bearer tokens. Tokens stay in background/extension storage: they are never echoed into the Options DOM, never included in `ConnectionStatus` (so an unprivileged status query cannot read them), and connection-mutating messages are privileged (rejected from a web-page content script). Capture writes are routed only to a connection whose `domains` cover the page origin.
- **Endpoints**: `GET /ping`, `GET /manifest`, `GET /specs`, `GET /specs/:id`, `POST /specs`, `PUT /specs/:id`, `DELETE /specs/:id`, `GET /views`, `PUT /views`, `GET /events` (SSE). All except `/ping` require bearer auth; `PUT /views` validates the payload against the `ViewsConfig` schema on both TS and Go sides.

## Design references

UI mockups for the extension surfaces (popup, options, sidebar, capture form)
and their shared color/font tokens live in `apps/extension/designs/`. See
`docs/design-system.md` for the token workflow.

## Deferred (post-MVP)

FileSystem Access source; overlay + inline-badge renderers; hybrid weighted fingerprint scoring; `specpin generate` (AI); Safari packaging. (Delivered since the MVP: Manual import source, modal renderer, multi-language specs, and multi-project connections.)
