# Specpin System Architecture

> Tiếng Việt: [`vi/system-architecture.md`](./vi/system-architecture.md). English is the source of truth.

Specpin pins business specifications onto the elements of a running web UI. It is **not** a spec-driven code generator: it does not produce application code from specs. It is a Git-native knowledge layer that attaches living documentation to interfaces you already have.

## Components

```
.specs/ (consumer repo)
   |  read/write JSON
   v
specpin serve  ── Go sidecar ──  HTTP + SSE (token-authenticated; 127.0.0.1 by default, opt-in remote over an HTTPS reverse proxy)
   ^
   |  fetch() from the background service worker
   v
browser extension (WXT, MV3)
   - background SW: SidecarRegistry (N connections) + per-connection cache + SSE relay
   - content script: matchElement(fingerprint) -> render (tooltip / sidebar / modal)
   - popup + side panel + options: connection manager, locale toggle, on/off, capture
```

The extension exposes two equivalent control surfaces backed by the same background messaging: the **popup** (ephemeral dropdown) and a **side panel** (`entrypoints/sidepanel/`, a persistent docked page that shows spec description + business rules inline and auto-refreshes on tab/navigation changes and `SPECS_CHANGED`). Both fetch through one shared `fetchSurfaceState()` helper. WXT maps the single `sidepanel` entrypoint to Chrome `side_panel` and Firefox `sidebar_action`. A stored `defaultSurface` preference decides whether a toolbar click opens the popup or the side panel; the background applies it on Chrome via `chrome.action.setPopup` + `sidePanel.setPanelBehavior` (Firefox keeps the popup on the toolbar button and opens the sidebar from its native toggle).

Data flows one schema, two validators: the JSON Schema (`packages/spec-schema/schema/v1.json`) is the single source of truth. The TS side validates with ajv; the Go sidecar embeds the same file and validates with `santhosh-tekuri/jsonschema/v6`. CI cross-validates a shared fixture corpus through both and fails on drift. This applies to all schema entities: `Spec`, `SpecManifest`, `SpecFile`, `ViewsConfig`, and `GuidesConfig`. Beyond being the validation SSOT, the schema is also a public contract: it is served at `https://specpin.ohnice.app/schema/v1.json` (the `$id`, copied into the `apps/web` build) and published to npm as `@specpin/spec-schema` (types + ajv validators + raw schema), so consumers get editor autocomplete and programmatic validation.

User-selectable theme: the extension UI supports System / Light / Dark modes. Previously dark existed only behind `@media (prefers-color-scheme: dark)`. Now the user can force a theme via the Options page. The generator emits four `:root...` selector blocks in `tokens.gen.css` (shared + light, forced dark, forced light, system default media query), and `tokens.ts` rewrites all forms to `:host(...)` for Shadow DOM renderers. The choice persists in `specpin:theme`; "System" means `data-theme` is absent. Forced themes may flash the system default for one frame on load (accepted).

UI-chrome i18n: a custom runtime `t(key, params)` in `apps/extension/src/i18n/` localizes the extension's own buttons, labels, and banners (NOT the spec-content language, which is a separate toggle). English, Vietnamese, and Japanese are supported (`SUPPORTED=["en","vi","ja"]`). Resolution: stored `specpin:uiLocale` -> browser UI language -> "en". The Options page has a Language control (System default / English / Tiếng Việt / 日本語). Change broadcasts `SET_UI_LOCALE` to tabs; open popup/side panel re-render via `watchUiLocaleChanges` (storage.onChanged). Static HTML is hydrated via `data-i18n*` attributes. This is independent from the existing spec-content locale (`getLocale`/`setLocale`, `localize-spec.ts pickLocale`). Manifest name/description, RTL, locale-aware number/date formatting, and languages beyond EN+VI+JA are out of scope.

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

A fingerprint captures multiple signals per element (test-id anchors, aria, non-generated id, optimized cssSelector, xpath, domPath, text, whitelisted attributes, nearby labels, position, framework hint). Matching tries exact anchors first (confidence 1.0), then a unique cssSelector (0.7); if those fail it runs a **hybrid weighted scorer** (`strategy:"scored"`) over the ambiguous selector hits or a bounded candidate pool from the live DOM, matching the best only when it clears a high threshold and beats the runner-up by a margin. The scorer is conservative by design (false-positive-averse): it never overrides an exact/css hit, abstains without an identifying content signal, and marks mid-confidence matches `needsReview`; below the mid tier it flags `needsReview` with no element. Weights and thresholds live in one table in `packages/fingerprint-core/src/score.ts`. A `data-spec-id` attribute on important elements makes matching trivially exact.

Before matching, the render loop applies the fingerprint's optional `pageUrl` path glob (auto-filled at capture, editable): a spec renders only on routes its glob covers, so a spec pinned on one screen never resolves onto another screen whose layout produces a colliding selector. A spec with no `pageUrl` matches on any page (backward compatible). The same scope gates the popup / side-panel "this page" list (`GET_MATCHED_IDS`), keeping the list in step with what renders.

The matcher's signature and `MatchResult` shape are stable across tiers; the scored tier only adds `strategy:"scored"` and an optional per-signal `signals` breakdown (the "why matched" hint), so existing callers are unaffected.

### Matching drift corpus (local, opt-in)

To tune the scorer against real drift, the extension can collect a local training corpus (`storage.local`, default **OFF**, capped ring-buffer, exportable + clearable from Options, never uploaded). Two sources: **supervised** — a re-pin records the `(old → new)` fingerprint pair (ground truth); and **passive** — when a spec goes orphaned or mid-scored at match time, it snapshots the candidate fingerprints the scorer weighed (a tentative `chosenByScorer` label, never treated as truth). Fingerprints only — no HTML — with `textContent` redacted (emails + long digit runs) at write time. Lives in `apps/extension/src/shared/drift-corpus.ts`.

## Multi-project registry

The background holds a `SidecarRegistry`: a map of independent sidecar connections, each with its own URL, bearer token, spec cache, and SSE watch, plus the page-owned local (Manual) source (a list of removable batches, each its own validated bundle, not a single slot). For any page, `specsForOrigin(origin)` aggregates the specs of every connection whose project `domains` cover that origin, tagging each spec with its connection id + project name (ids are never deduped across projects, since two projects may share a spec id), then adds every local batch whose `domains` cover the origin (each tagged with its per-batch `manual:<batchId>` id so an edit routes back to that exact batch; repeated spec ids deduped across batches, first wins).

The local source is **writable**, not just a read-only import slot. Batches can be created in the extension (`CREATE_LOCAL_PROJECT`), captured into, and edited (`SAVE_SPEC`/`UPDATE_SPEC` branch on `isLocalConnectionId` and write `storage.local` instead of a sidecar). A local write is origin-bounded exactly like a sidecar write (RT-SA7): the background verifies the target batch serves the page origin under the same `applyToAllSites` opt-in gate (`statusServesOrigin`, shared by the capture picker `GET_WRITE_TARGETS` and the write guard), and re-validates the spec with `validateSpec` before persisting (the in-page form's validation is client-side only). Storage stays the single writer: all local mutations run through the background `mutate()` chain over pure state mutators (`createLocalBatch`/`upsertLocalSpec`/`renameLocalBatch`). A batch's on-disk `.specs/` shape (`manifest.json` + one `*.spec.json` per group) round-trips out via a dependency-free STORE zip export (`GET_EXPORT_BUNDLES` -> `bundleToFiles` + `zipStore`), so a local project can be committed into a repo's `.specs/` or re-imported.

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

## Guide mode (onboarding tours)

A **guide** is a manually-launched, ordered walkthrough over specs already pinned to the current page: it spotlights each step's element and shows that spec's localized content in an anchored popover with Prev/Next/Skip/Done. It is **not** a `DisplayMode` (renderers show every matched spec at once; a guide is sequential over a page-filtered, ordered subset). The `GuideController` (`content/guide.ts`) is a separate page-level controller, launched on demand, that **suspends** the active render session while running and restores it on exit; a module-level `guideActive` flag gates `rerender()` so a background `SPECS_CHANGED` / theme / mode / locale event cannot rebuild a session over the live tour. It owns its own Shadow-DOM spotlight overlay (it ports the rect-tracking technique from `highlight.ts` rather than calling the auto-fading singleton). A mid-tour spec change hard-stops the guide; SPA navigation tears it down. Launch is manual only: a "Start guide" entry in popup + side panel, plus `Alt+Shift+G` for the default tour.

Guides live in two scopes that share one `GuideDef` shape:

- **Team** - committed `.specs/guides.json`, served by the sidecar (mirrors `views.json`), OR stored inline on a local (Manual) project. Read per connection (in the same `reload()` group as specs + views, so a guides-only change refreshes via SSE).
- **Personal** - private to the user in `chrome.storage.sync`, keyed by a canonical origin (a per-user trust boundary). The background derives the read origin from the trusted sender for a content script and only trusts a payload origin from a privileged extension page, so a content script can never read another origin's personal guides.

The background aggregates both into one origin-tagged list (`GET_GUIDES_FOR_ORIGIN`); mutations (`SAVE_TEAM_GUIDE` routing sidecar vs local, `SAVE_PERSONAL_GUIDE`, `DELETE_GUIDE`) are privileged, re-read live state before write, and broadcast the existing `SPECS_CHANGED`. An empty-`steps` guide falls back to all matched specs in default order. Curation (name, description, ordered step include/reorder, Save-to picker over sidecar/local/personal targets) lives in `shared/guide-editor.ts`; the launch list in `shared/guide-section.ts`; Options manages a connection's team guides (list + delete).

## Security model (sidecar)

- Binds `127.0.0.1` by default; the port is auto-picked unless `--port` is given. `--host <addr>` can bind a non-loopback address for remote use, but that exposes the raw plaintext, token-only port directly (the reverse proxy is not in the path) and prints a warning, so firewall it. Remote clients must reach the sidecar over **HTTPS via a reverse proxy** (the extension blocks plaintext remote as mixed content); the Go binary terminates no TLS itself. See `docs/run-guide.md` → "Serve on a remote machine".
- Every request requires `Authorization: Bearer <token>` (printed on `serve`). The token is random per run unless pinned with `--token`/`SPECPIN_TOKEN`. **The token is the sole authorization boundary for non-browser network clients**: CORS constrains only browser origins, so a no-`Origin` client (e.g. `curl`) is gated by the token alone.
- CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); web origins are rejected. The preflight allows `Authorization`, `Content-Type`, and `If-Match`, and exposes `ETag` so a cross-origin (remote) client can read it.
- Writes are confined to `.specs/` (path-traversal guard), atomic, and pretty-printed for clean Git diffs. A `sync.Mutex` serializes every read-modify-write so concurrent multi-writer requests cannot drop an append; spec writes additionally support optimistic concurrency: `GET /specs` returns a bundle `ETag`, and a `POST`/`PUT`/`DELETE` whose `If-Match` no longer matches is rejected with `409` (the extension reloads and re-prompts) instead of clobbering a newer state. Views/guides get the mutex but not the ETag check (the extension re-reads them before each write).
- `/events` emits a periodic SSE heartbeat (~20s) so an idle-timeout reverse proxy keeps the change stream open.
- **Multi-token trust model.** With N connections the extension stores N localhost bearer tokens. Tokens stay in background/extension storage: they are never echoed into the Options DOM, never included in `ConnectionStatus` (so an unprivileged status query cannot read them), and connection-mutating messages are privileged (rejected from a web-page content script). Capture writes are routed only to a connection whose `domains` cover the page origin.
- **Endpoints**: `GET /ping`, `GET /manifest`, `GET /specs`, `GET /specs/:id`, `POST /specs`, `PUT /specs/:id`, `DELETE /specs/:id`, `GET /views`, `PUT /views`, `GET /guides`, `PUT /guides`, `GET /events` (SSE). All except `/ping` require bearer auth; `PUT /views` and `PUT /guides` validate the payload against the `ViewsConfig` / `GuidesConfig` schema on both TS and Go sides.

## Design references

UI mockups for the extension surfaces (popup, options, sidebar, capture form)
and their shared color/font tokens live in `apps/extension/designs/`. See
`docs/design-system.md` for the token workflow.

## Deferred (post-MVP)

FileSystem Access source; overlay + inline-badge renderers; hybrid weighted fingerprint scoring; `specpin generate` (AI); Safari packaging. (Delivered since the MVP: Manual import source, a writable local-authoring path - in-extension create, capture, edit, and group-zip export - modal renderer, multi-language specs, and multi-project connections.)
