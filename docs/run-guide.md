# Run Guide

> Tiếng Việt: [`vi/run-guide.md`](./vi/run-guide.md). English is the source of truth.

Specpin attaches living business specs to a running UI; it is **not** a code generator. This guide runs the full loop end to end: init the sidecar, serve, load the extension, connect, see specs render, and capture a new one.

## Prerequisites

- Node >= 20, pnpm 10
- Go 1.26 (for the sidecar)
- Chrome or Firefox

## 1. Build the workspace

```bash
pnpm install
pnpm build
```

## 2. Build the sidecar

```bash
cd apps/cli
make build        # syncs the embedded schema, produces bin/specpin
```

## 3. Run the demo app (optional, for a ready-made target)

```bash
pnpm --filter @specpin/demo-react-app dev   # http://localhost:3000
```

The demo already ships `examples/demo-react-app/.specs/` with seeded specs.

## 4. Start the sidecar in a repo with a `.specs/` directory

In a fresh project, scaffold first:

```bash
specpin init --project "My App" --domains localhost:3000
```

Then serve (run from the directory that contains `.specs/`, e.g. the demo app):

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

It prints a connect URL and token:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

The port is auto-picked; pass `--port 5173` to pin one.

## 5. Load the extension

```bash
pnpm --filter @specpin/extension build            # chrome-mv3 in .output/
pnpm --filter @specpin/extension build:firefox    # firefox-mv2 in .output/
```

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `apps/extension/.output/chrome-mv3`.
- Firefox: `about:debugging` -> This Firefox -> Load Temporary Add-on -> any file in `apps/extension/.output/firefox-mv2`.

## 6. Connect

Open the extension Options page (**Connected projects**), paste the URL and token from step 4 into the add form, optionally name it, click **Test & add project**. The project appears in the list with its status, project name, spec count, and domains. Add more projects the same way; **Remove** and **Reconnect** act per row.

A project whose manifest pins no `domains` is inactive by default (its specs would otherwise show on every site). The row shows a warning and an **Apply to all sites** checkbox; tick it only if you intend that project's specs to appear everywhere.

## 7. See specs render

Visit the demo app (`http://localhost:3000`). Matched specs appear as tooltips on their elements (the badge turns amber when a match needs review). Edit a `.spec.json` on disk and the page live-updates via SSE.

The popup lists the specs for the current page, toggles Specpin on/off, switches display mode, picks the spec language, and offers Reload / Reconnect. When more than one project serves the page, the popup lists each matching project and renderers caption each spec with its project.

## 8. Switch language

Spec content (title, description, business rules) is localized. The popup's **Language** dropdown sets the active locale and re-renders all display modes; the sidebar header mirrors it. The choice persists across sessions. A spec with no text for the chosen locale falls back to the project's `defaultLocale`, then to any present locale. The dropdown offers the union of `settings.locales` across the connected projects.

## 9. Capture a new spec (with translations)

Click **+ Capture spec** in the popup (or press `Alt+Shift+C`), click an element, then fill the form. Pick a **Language**, enter the title/description/rules for it, then choose another language (or **+ Add language**) to add a translation - switching languages keeps what you already entered. The default language requires a title and description. If more than one project serves the page, pick the **Target project**. On save the spec is validated, written to the chosen `.spec.json` (pretty-printed), and shows up in `git diff`. Captured specs carry `meta.source: "manual"`.

## Connect several projects at once

One extension can serve many projects. Run a sidecar per project on its own port (each prints its own token), and add each in Options:

```bash
# project A
cd /path/to/project-a && /path/to/bin/specpin serve --port 51001
# project B (another terminal)
cd /path/to/project-b && /path/to/bin/specpin serve --port 51002
```

To demo this against the single demo app, run two sidecars over two `.specs/` directories on different ports; each page shows only the specs of the project(s) whose `domains` match its origin.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | toggle Specpin on/off |
| `Alt+Shift+M` | cycle display mode |
| `Alt+Shift+C` | toggle capture mode (`Esc` cancels) |

## Display modes

Specs render as a **tooltip** (hover peek), a **sidebar** (persistent list), or a **modal** (centered dialog listing every spec on the page). Switch with the popup's mode dropdown or cycle with `Alt+Shift+M`. Per-spec `preferredDisplayMode` and the manifest `defaultDisplayMode` still apply when no mode is forced.

## Use without a sidecar (Manual import)

To view specs without running `specpin serve`, open the extension Options page and paste a bundle into **Manual specs**:

```json
{ "manifest": { …manifest.json… }, "files": { "login.spec.json": { …spec file… } } }
```

Click **Load manual specs**. The bundle is validated against the schema in-page before anything is stored. Manual specs are read-only (capture still needs a sidecar) and persist until you click **Clear manual specs**. They are merged into a page's specs alongside any connected projects whose `domains` match the page (manual specs use their own manifest `domains`).

## Validate specs offline

`specpin validate` checks `manifest.json` and every `*.spec.json` against the schema without serving anything:

```bash
specpin validate --dir .specs
```

Exit codes: `0` all valid, `1` invalid specs found (fix the spec), `2` could not run (directory or manifest missing). It also warns when `manifest.specFiles` and the on-disk `*.spec.json` files disagree; pass `--strict-manifest` to make that drift fail instead of warn.

## Lint specs in CI

Use the reusable action to fail PRs that introduce invalid specs. No Node toolchain needed; the validator is built from a pinned Specpin ref (never the calling repo's PR), so a malicious PR cannot alter validation:

```yaml
# .github/workflows/spec-lint.yml in your repo
on: [pull_request]
jobs:
  spec-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: lamngockhuong/specpin/.github/actions/spec-lint@v0.1.0  # pin to a release tag
        with:
          dir: .specs
```

Pin `@<tag>` (not `@main`) for supply-chain safety once a release is tagged.
