---
title: How It Works
description: Understand Specpin's three-tier architecture and how specs stay linked to UI elements through refactors.
---

Specpin attaches business specifications to live UI elements through a three-tier system: a Git-versioned specs repository, a local sidecar server, and a browser extension that matches and renders specs.

## The Three-Tier Flow

```
.specs/ (in your repo) -> specpin serve (Go sidecar) -> browser extension
```

1. **Your specs live in `.specs/`** as JSON files in your project repository. They are versioned with Git, reviewable via pull requests, and diffable like any other code.

2. **`specpin serve` exposes them locally** over HTTP (localhost only, token-authenticated, live-reload via Server-Sent Events). The sidecar is a small Go binary that binds to `127.0.0.1` on an auto-picked port. Nothing leaves your machine.

3. **The browser extension connects** to the sidecar, fetches your specs, matches each one to a DOM element on the page, and renders it (as a tooltip, sidebar, or modal). When you edit a spec file on disk, the page refreshes automatically.

## How Specs Stay Linked to Elements

Each spec stores a **fingerprint** with multiple signals about its target element:

- `data-spec-id` attribute (if present, matching is exact)
- `data-testid` and other test-id patterns
- ARIA attributes (role, label, describedby)
- Non-generated `id` attribute
- Optimized CSS selector
- XPath
- Text content
- Position in the page
- Framework-specific hints

When you open a page, the extension walks the DOM and tries to match each spec's fingerprint. It checks exact anchors first (`data-spec-id`, stable test-id, aria), then falls back to a unique CSS selector. If no high-confidence match is found, the spec is flagged **Needs review** so you can confirm or re-link it manually.

This multi-signal approach means specs survive refactors. If you rename a CSS class but keep the `data-testid`, the spec still finds its element. If you change both but the aria-label stays the same, matching still works.

### Adding a `data-spec-id` Attribute

For critical elements (buttons, inputs, navigation items), add a `data-spec-id` attribute in your source code:

```html
<button data-spec-id="submit-order">Submit Order</button>
```

The extension will match this spec exactly, no matter what else changes. This is the most reliable anchor.

## What Happens When a Match Needs Review

If the extension cannot confidently match a spec, it marks it **Needs review**. This happens when:

- The element was removed or heavily refactored.
- Multiple elements now match the fingerprint (ambiguous).
- Only weak signals (position, partial text) remain.

You will see the spec in the extension's spec list with a yellow badge. Click **Edit spec**, then **Re-link element**, and click the correct element on the page. The extension captures a fresh fingerprint and saves it back to your `.specs/` directory. The spec is now matched again.

## Local-First, Private

All spec data flows through your local machine only. The sidecar binds to `127.0.0.1` and requires a bearer token (printed when you run `specpin serve`). The extension fetches specs over localhost HTTP, and writes go back to your `.specs/` directory as pretty-printed JSON files. No external service sees your specs or your page. See [Security and Privacy](/concepts/security-and-privacy/) for full details.
