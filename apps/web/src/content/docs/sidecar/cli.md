---
title: Install and run the CLI
description: Build and run the specpin CLI sidecar to serve your specs to the browser extension.
---

The `specpin` CLI is a Go sidecar that serves your `.specs/` directory over a secure, token-authenticated localhost HTTP API. The extension connects to it to load specs and watch for live changes.

## Install

Install the CLI from npm. It downloads the prebuilt binary matching your OS and CPU:

```bash
npm install -g @specpin/cli    # or: pnpm add -g @specpin/cli
specpin --version

# or run without installing:
npx @specpin/cli serve
```

Prefer a raw binary? Grab `specpin-<os>-<arch>` from the [latest CLI release](https://github.com/lamngockhuong/specpin/releases?q=cli), or build from source (Go 1.26 required):

```bash
cd apps/cli
make build      # -> bin/specpin
```

## Initialize a project

In your application repository (not the Specpin monorepo), scaffold a `.specs/` directory:

```bash
specpin init --project "My App" --domains localhost:3000
```

This creates `.specs/manifest.json` with your project name and the domains where your UI runs. The `domains` field controls which sites this project's specs will show on. An empty `domains` array means the specs can appear on any site (be cautious with this).

You can edit `manifest.json` by hand afterward. See [Spec format](/sidecar/spec-format/) for details.

## Serve specs

Run the sidecar from the directory that contains `.specs/`:

```bash
specpin serve
```

It prints output like this:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c1f8e9b3a...
```

Copy the URL and token. You will paste them into the extension's connection settings. See [Connecting projects](/usage/connecting-projects/) for the next step.

The port is auto-picked unless you pass `--port`:

```bash
specpin serve --port 5173
```

By default the sidecar binds `127.0.0.1` only. Requests must include `Authorization: Bearer <token>` in the header. CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) and rejects web origins. Writes are confined to `.specs/` (path-traversal guarded), serialized, and pretty-printed for clean Git diffs.

The bearer token is regenerated each time you run `serve`. Pass `--token <secret>` (or set the `SPECPIN_TOKEN` environment variable) to pin a stable token so a restart does not disconnect every client:

```bash
specpin serve --port 5173 --token "$(openssl rand -hex 24)"
```

If the extension loses connection after a restart with a random token, run `serve` again and update the token in the extension's connection settings.

## Serve on a remote machine

By default Specpin is a single-user localhost tool. To share one `.specs/` with a team, run the sidecar on a shared host and connect the extension to it over **HTTPS**. The Go binary speaks plain HTTP only; **TLS is terminated by a reverse proxy** in front of it. Remote *requires* HTTPS: the extension's requests run from a secure context, so a plaintext `http://` remote is blocked as mixed content.

Recommended: keep the sidecar on loopback and run the proxy (Caddy, nginx, Cloudflare Tunnel) on the **same host**, pinning the port and token:

```bash
specpin serve --port 51234 --token "$(openssl rand -hex 24)"
```

```
# Caddy
specs.example.com {
  reverse_proxy 127.0.0.1:51234
}
```

`--host <addr>` binds a non-loopback address for the advanced "proxy on another host" case. This does **not** put a proxy in the path, it exposes the raw, **plaintext, token-only** port directly, so firewall it and always pin `--port`. The serve command prints a blunt warning whenever it binds off-loopback.

### No domain? Serve over IP

Internal servers with only an IP (no domain) can't use Caddy's *automatic* HTTPS, but the extension still accepts `https://<ip>`, a certificate's SAN can be a bare IP, so no domain is needed. Two paths, both work in every browser:

- **HTTPS via an internal CA.** Give Caddy the bare IP as its site address with `tls internal` (`192.168.1.50 { tls internal; reverse_proxy 127.0.0.1:51234 }`), or mint an IP-SAN cert with `mkcert 192.168.1.50` / openssl for nginx. Distribute the **root CA** to your team's browsers once, then connect to `https://192.168.1.50`. Works for private LAN and public IPs alike.
- **SSH tunnel to localhost.** `ssh -N -L 9123:127.0.0.1:51234 user@192.168.1.50`, keep the sidecar on loopback, and connect to `http://localhost:9123`, no cert needed, since `localhost` is always exempt.

Plain `http://<ip>` is **not** an option: the browser blocks plaintext remote (a private LAN IP works only on Chrome 142+ via Local Network Access, which can't prompt from the extension's service worker, and Firefox has no equivalent). See the run guide's "No domain? Serve over IP" section for full recipes.

:::caution
The bearer token is the only authorization boundary for non-browser network clients (CORS only constrains browsers). Treat it like a password and distribute it out-of-band. The non-loopback raw port is plaintext: never expose it to the internet without the HTTPS proxy in front.
:::

See the run guide's "Serve on a remote machine" section for working Caddy + nginx examples (SSE buffering, CORS preflight) and the full threat model.

## Live reload

The sidecar watches `.specs/` for changes via Server-Sent Events (SSE). When you edit a `.spec.json` file on disk and save, the extension receives the update and re-renders the page immediately. No browser refresh needed.

## Validate specs offline

To check your specs without serving them:

```bash
specpin validate --dir .specs
```

Exit codes:
- `0` all valid
- `1` invalid specs found (fix the spec)
- `2` could not run (directory or manifest missing)

By default, `validate` warns if `manifest.specFiles` and the on-disk `*.spec.json` files disagree. Pass `--strict-manifest` to make that drift fail instead of warn.

:::tip
Use `specpin validate` in CI to catch invalid specs before they merge. See the [reusable GitHub Action](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint) for an example.
:::

## The `.specs/` folder

Your specs live in `.specs/` at the root of your project repo:

```
.specs/
├── manifest.json          # index + project config
├── views.json             # team visibility defaults (optional)
└── login.spec.json        # a group of specs
└── dashboard.spec.json
```

- `manifest.json` (required) indexes your spec files and holds project settings like `domains`, `defaultLocale`, and `defaultDisplayMode`.
- Each `*.spec.json` file is a **SpecFile**: a named group of specs (e.g. `login.spec.json` holds all specs for the login screen).
- `views.json` (optional) defines team-level visibility rules (which specs are hidden by default for everyone on the team).

All files are JSON, versioned in Git, and reviewable via PR.

## Git-native workflow

Because specs are JSON files committed to your repo, they follow the same review process as your code:

1. Edit or capture a spec.
2. The sidecar writes the change to `.specs/<file>.spec.json` (pretty-printed).
3. `git diff` shows exactly what changed.
4. Commit, push, and open a PR.
5. Teammates review the spec changes alongside code changes.

By default specs never leave your machine: the sidecar binds localhost and there is no cloud service or telemetry. If you opt into a remote sidecar, specs are sent only to that sidecar, a server **you** run and control, never to any Specpin-operated service.

## Multiple projects

You can run multiple sidecars for different projects on different ports:

```bash
# Terminal 1 (project A)
cd /path/to/project-a
specpin serve --port 51001

# Terminal 2 (project B)
cd /path/to/project-b
specpin serve --port 51002
```

Add each connection in the extension's Options page. The extension routes specs to the correct page based on each project's `domains` field. One extension can serve many projects at once.
