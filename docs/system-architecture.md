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
   - popup + options: connection manager, locale toggle, on/off, capture
```

Data flows one schema, two validators: the published JSON Schema (`packages/spec-schema/schema/v1.json`) is the single source of truth. The TS side validates with ajv; the Go sidecar embeds the same file and validates with `santhosh-tekuri/jsonschema/v6`. CI cross-validates a shared fixture corpus through both and fails on drift.

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

The background holds a `SidecarRegistry`: a map of independent sidecar connections, each with its own URL, bearer token, spec cache, and SSE watch, plus the page-owned Manual-import source. For any page, `specsForOrigin(origin)` aggregates the specs of every connection whose project `domains` cover that origin, tagging each spec with its connection id + project name (ids are never deduped across projects, since two projects may share a spec id).

- **Origin gate (the confidentiality boundary).** Only origin-matching connections contribute specs. A connection whose manifest pins no `domains` does **not** silently match every site: it matches only when the user explicitly opts in (`applyToAllSites`); otherwise it is inactive. The SSE "something changed" broadcast pings all tabs and is best-effort only - it is not the boundary; the content script re-queries `specsForOrigin`, which is.
- **Per-connection isolation.** A failing connection (unreachable sidecar, bad manifest) records its error and contributes zero specs; it never aborts aggregation for the others.
- **Service-worker lifecycle.** MV3 suspends the worker and kills SSE streams. A shared `reestablish()` rebuilds all connections from storage and restarts their watches; it runs at module eval and on `onStartup` / `onInstalled` / a keepalive alarm, so watches recover for one or many connections. Reconnect backoff is jittered per connection to avoid a thundering herd.

## Localization

Spec business content (`title`, `description`, `businessRules`) is stored as locale-keyed objects (`LocalizedString`); see `docs/schema-reference.md`. A single `resolveLocalized(value, locale, defaultLocale)` resolver (prototype-pollution safe) is the only reader; renderers never touch the raw object. A viewer picks a language in the popup (mirrored in the sidebar); the choice persists and re-renders all display modes, falling back to `defaultLocale` then the first present value. Translations are authored in the capture/edit form per locale.

## Security model (sidecar)

- Binds `127.0.0.1` only; the port is auto-picked unless `--port` is given.
- Every request requires `Authorization: Bearer <token>` (printed on `serve`).
- CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); web origins are rejected.
- Writes are confined to `.specs/` (path-traversal guard), atomic, and pretty-printed for clean Git diffs.
- **Multi-token trust model.** With N connections the extension stores N localhost bearer tokens. Tokens stay in background/extension storage: they are never echoed into the Options DOM, never included in `ConnectionStatus` (so an unprivileged status query cannot read them), and connection-mutating messages are privileged (rejected from a web-page content script). Capture writes are routed only to a connection whose `domains` cover the page origin.

## Design references

UI mockups for the extension surfaces (popup, options, sidebar, capture form)
and their shared color/font tokens live in `apps/extension/designs/`. See
`docs/design-system.md` for the token workflow.

## Deferred (post-MVP)

FileSystem Access source; overlay + inline-badge renderers; hybrid weighted fingerprint scoring; `specpin generate` (AI); Safari packaging. (Delivered since the MVP: Manual import source, modal renderer, multi-language specs, and multi-project connections.)
