# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not as a public GitHub issue.

Use GitHub Security Advisories:
<https://github.com/lamngockhuong/specpin/security/advisories/new>

Include, if possible:

- affected component (sidecar / extension / package) and version,
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any suggested mitigation.

We aim to acknowledge reports within a few days and will coordinate a fix and
disclosure timeline with you.

## Supported versions

Specpin is pre-1.0 and ships from `main`. Security fixes target the latest
released versions of each component:

| Component | Path | Latest |
|-----------|------|--------|
| Extension | `apps/extension` | `0.0.13` |
| Sidecar (CLI) | `apps/cli` | `0.0.8` |
| Spec schema | `packages/spec-schema` | `0.0.5` |

Older versions are not patched separately; please upgrade to the latest release.

## Security model

Specpin runs a local Go sidecar that reads and writes specs in the consumer
repo's `.specs/` directory, and a browser extension that connects to it. The
design keeps the attack surface local:

- **Localhost only.** The sidecar binds `127.0.0.1` on an auto-picked port
  (unless `--port` is given). It is not reachable from the network.
- **Bearer token.** Every request requires `Authorization: Bearer <token>`;
  the token is printed on `serve` and shared with the extension out of band.
- **Origin allowlist.** CORS accepts only extension origins
  (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) and
  rejects web-page origins.
- **Confined writes.** Writes are restricted to `.specs/` with a
  path-traversal guard, are atomic, and are pretty-printed for clean diffs.

If you find a way to bypass any of these boundaries, that is a security issue
worth reporting.
