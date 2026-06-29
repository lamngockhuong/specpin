---
title: Security and Privacy
description: How Specpin keeps your specs and browsing private through localhost-only operation and token authentication.
---

Specpin is designed local-first. Your specs never leave your machine, and the sidecar server is hardened to accept connections only from your browser extension.

## Local-First Architecture

All data flows through your local machine:

1. **Specs live in your repository** as `.specs/*.json` files. They are versioned with Git like any source code.
2. **The sidecar (`specpin serve`) binds to `127.0.0.1` only.** It listens on localhost, on an auto-picked port (or one you specify with `--port`). No external traffic can reach it.
3. **The browser extension fetches specs over localhost HTTP.** It connects to `http://127.0.0.1:<port>` using a bearer token.
4. **Writes go back to `.specs/` on disk.** When you capture or edit a spec, the extension sends it to the sidecar, which writes a pretty-printed JSON file atomically. The change appears in `git diff` immediately.

No Specpin component sends data to an external server. There is no cloud service, no telemetry, no analytics. Everything stays on your machine.

## Sidecar Security Model

The sidecar is hardened to prevent unauthorized access:

### Localhost Binding

The sidecar binds to `127.0.0.1`, not `0.0.0.0`. Only processes on your machine can reach it. The port is auto-picked from available high ports unless you override with `--port`.

### Bearer Token Authentication

Every request (except the health check) requires an `Authorization: Bearer <token>` header. The token is printed when you run `specpin serve`:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

Copy the token and paste it into the extension's connection settings. The extension stores it securely in its background service worker and sends it with every request. Without the correct token, all requests are rejected with `401 Unauthorized`.

:::caution
The token is printed in your terminal. If someone with physical or remote access to your machine sees the terminal output, they can connect to the sidecar while it is running. Treat the token like a password. The token changes every time you restart `specpin serve`.
:::

### CORS: Extension Origins Only

The sidecar accepts requests only from browser extension origins:

- `chrome-extension://*`
- `moz-extension://*`
- `safari-web-extension://*`

Web pages (even on `localhost`) are rejected. This prevents a malicious website from stealing your specs or writing fake specs into your repository, even if an attacker learns your token.

### Path Traversal Guard

All file writes are confined to the `.specs/` directory. The sidecar validates every file path to prevent path-traversal attacks (e.g., `../../etc/passwd`). It will reject any request that tries to write outside `.specs/`.

### Atomic, Pretty-Printed Writes

Spec writes are atomic: the sidecar writes to a temporary file, validates the JSON, then renames it into place. If the process crashes mid-write, your `.specs/` directory is never left in a corrupt state. All JSON is pretty-printed so `git diff` remains readable.

## Extension Security

The browser extension is built as a Manifest V3 extension (Chrome) and Manifest V2 (Firefox) with security best practices:

- **Tokens stay in the background service worker.** The extension's Options page never echoes tokens into the DOM. Connection status queries cannot leak tokens.
- **Content scripts are sandboxed.** The extension's content script (which runs on web pages) cannot mutate connections or read tokens. Only privileged messages from the popup, side panel, or options page can change connection settings.
- **Writes are origin-gated.** When you capture a spec, the extension checks that the target project's `domains` cover the current page's origin. A sidecar connection serving `localhost:3000` will not accept captures from `example.com`.

## Local Projects (Manual Specs)

The extension supports **local projects**: specs stored in the browser's extension storage (`browser.storage.local`) instead of a sidecar. Local projects are origin-bounded: specs for `localhost:3000` are isolated from specs for `example.com`. Local specs can be exported as a `.specs.zip` bundle and committed to a repository, or re-imported into another machine.

Local projects are private to your browser profile and never synced to the cloud unless you explicitly export and share the `.specs.zip` file.

## Multi-Project Trust Model

You can connect the extension to multiple sidecar instances (e.g., one per project). Each connection has its own URL and token. Tokens are stored separately and never shared across projects. A compromised token for one project does not affect the others.

## What Data Is Stored Where

| Data | Location | Shared? |
|------|----------|---------|
| Specs (sidecar projects) | `.specs/*.json` in your repo | Via Git (you control) |
| Specs (local projects) | `browser.storage.local` | No (browser profile only) |
| Connection URLs and tokens | Extension background (in-memory + `browser.storage.local`) | No |
| UI preferences (theme, language) | `browser.storage.local` | No |
| Personal visibility overrides | `browser.storage.sync` | Across your signed-in browsers (via browser sync) |

## Common Questions

**Is my data sent anywhere?**  
No. All spec data flows through your local machine only. The sidecar binds to `127.0.0.1`, and the extension connects to it over localhost. There is no external server.

**Can a website read my specs?**  
No. The sidecar rejects requests from web origins (via CORS). Only the browser extension can fetch specs.

**What happens if someone sees my terminal with the token?**  
They can connect to the sidecar while it is running and read or write specs in that project. The token changes every time you restart `specpin serve`. Do not leave the terminal visible in a screen share or unlocked machine.

**Are local projects synced to the cloud?**  
No. Local projects are stored in `browser.storage.local`, which is private to your browser profile. They are not synced unless you export them as a `.specs.zip` and share the file manually.

**Can I use Specpin on a remote server?**  
Not directly. The sidecar binds to `127.0.0.1` only. If you need to serve specs from a remote machine, you would need to set up an SSH tunnel or a reverse proxy with your own authentication layer. This is not officially supported.
