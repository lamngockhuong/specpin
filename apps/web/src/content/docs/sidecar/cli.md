---
title: Install and run the CLI
description: Build and run the specpin CLI sidecar to serve your specs to the browser extension.
---

The `specpin` CLI is a Go sidecar that serves your `.specs/` directory over a secure, token-authenticated localhost HTTP API. The extension connects to it to load specs and watch for live changes.

## Install

Today, you build the CLI from source. Go 1.26 is required.

```bash
cd apps/cli
make build
```

This produces `bin/specpin`. You can add the binary to your PATH or invoke it directly.

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

The sidecar binds `127.0.0.1` only (never `0.0.0.0`) for security. Requests must include `Authorization: Bearer <token>` in the header. CORS accepts only extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) and rejects web origins. Writes are confined to `.specs/` (path-traversal guarded), atomic, and pretty-printed for clean Git diffs.

The bearer token is regenerated each time you run `serve`. If the extension loses connection, run `serve` again and update the token in the extension's connection settings.

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

Specs never leave your machine. The sidecar only binds localhost, and the extension never sends specs to any remote server.

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
