---
title: Getting Started
description: Connect to a project and see your first spec render in the browser.
---

This guide walks you through connecting to a project and seeing your first spec render on a web page. Two quickest paths: try the bundled demo or connect to your own project.

## Option A: Try the demo app

The demo app ships with seeded specs so you can see Specpin in action immediately.

### 1. Build the Go sidecar

From the Specpin repository root:

```bash
cd apps/cli
make build
```

This produces `apps/cli/bin/specpin`.

### 2. Start the demo app

```bash
pnpm --filter @specpin/demo-react-app dev
```

The demo runs at `http://localhost:3000`. It is a small multi-screen Acme CRM (login, dashboard, customers list and detail, settings, new-deal). Log in with any values to reach the authenticated screens.

### 3. Serve the demo's `.specs/` directory

From the demo app directory:

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

The sidecar prints:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

### 4. Turn Specpin on

Click the Specpin extension icon in your toolbar. Toggle the **Show specs on this page** switch to ON.

### 5. Connect to the sidecar

In the extension popup, click the **Connection settings** gear (top-right), then click **Add a project**.

Paste the URL and token printed in step 3, optionally add a label (e.g., "Demo App"), and click **Test & add project**. The connection appears in the list with its status, spec count, and domains.

### 6. See specs render

Navigate back to `http://localhost:3000`. Matched specs appear on their elements. Hover over an element to see its tooltip (default display mode).

Edit a `.spec.json` file on disk and the page live-updates via SSE.

## Option B: Connect to your own project

### 1. Initialize a `.specs/` directory in your project

From your project root:

```bash
specpin init --project "My App" --domains localhost:3000
```

This creates `.specs/manifest.json`.

### 2. Serve your specs

```bash
specpin serve
```

The sidecar prints a URL and token.

### 3. Connect in the extension

Follow steps 4-6 from Option A, pasting your own sidecar URL and token.

## What you can do next

- **Capture a new spec**: Click **+ Capture spec** in the popup (or press `Alt+Shift+C`), click an element, fill the form, and save. The spec appears on that element immediately.
- **Switch display modes**: Use the dropdown in the popup or press `Alt+Shift+M` to cycle between tooltip, sidebar, and modal.
- **Search specs**: Use the search box in the popup or side panel to filter by title, file, tags, or description.
- **Edit a spec**: Click a tooltip badge to pin it, then click **Edit spec**. The form opens pre-filled; change anything and save.
- **Open the side panel**: Click **Open as side panel** in the popup (Chrome) or use Firefox's native sidebar toggle (**View -> Sidebar -> Specpin**). The panel shows each spec's full description and business rules inline.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | Toggle Specpin on/off |
| `Alt+Shift+M` | Cycle display mode |
| `Alt+Shift+C` | Toggle capture mode (`Esc` cancels) |

## Next steps

- [Learn how to connect multiple projects](/usage/connecting-projects/)
- [Explore viewing and filtering specs](/usage/viewing-specs/)
- [Capture and edit specs in-browser](/usage/capturing-and-editing/)
