# Specpin System Architecture

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
   - background SW: SidecarClient + spec cache + SSE relay
   - content script: matchElement(fingerprint) -> render (tooltip / sidebar)
   - popup + options: connection config, on/off, capture
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

## Security model (sidecar)

- Binds `127.0.0.1` only; the port is auto-picked unless `--port` is given.
- Every request requires `Authorization: Bearer <token>` (printed on `serve`).
- CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); web origins are rejected.
- Writes are confined to `.specs/` (path-traversal guard), atomic, and pretty-printed for clean Git diffs.

## Design references

UI mockups for the extension surfaces (popup, options, sidebar, capture form)
and their shared color/font tokens live in `apps/extension/designs/`. See
`docs/design-system.md` for the token workflow.

## Deferred (post-MVP)

FileSystem Access + Manual import sources; overlay/modal/inline-badge renderers; hybrid weighted fingerprint scoring; `specpin generate` (AI); Safari packaging.
