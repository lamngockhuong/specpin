# Run Guide

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

Open the extension Options page, paste the URL and token from step 4, click **Test connection & save**. A green message confirms the sidecar is reachable.

## 7. See specs render

Visit the demo app (`http://localhost:3000`). Matched specs appear as tooltips on their elements (the badge turns amber when a match needs review). Edit a `.spec.json` on disk and the page live-updates via SSE.

The popup lists the specs for the current page, toggles Specpin on/off, switches display mode, and offers Reload / Reconnect.

## 8. Capture a new spec

Click **+ Capture spec** in the popup (or press `Alt+Shift+C`), click an element, fill the form, and save. The spec is validated against the schema, written to the chosen `.spec.json` (pretty-printed), and shows up in `git diff` for review. Captured specs carry `meta.source: "manual"`.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | toggle Specpin on/off |
| `Alt+Shift+M` | cycle display mode |
| `Alt+Shift+C` | toggle capture mode (`Esc` cancels) |
