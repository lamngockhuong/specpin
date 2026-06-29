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

The demo is a small multi-screen Acme CRM (login, dashboard, customers list and detail, settings, new-deal) and ships `examples/demo-react-app/.specs/` with seeded specs across every screen. Log in with any values to reach the authed screens; navigate via the top nav bar.

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

Open the extension Options page (**Connected projects**), paste the URL and token from step 4 into the add form, optionally name it, click **Test & add project**. The project appears in the list with its status, project name, spec count, and domains. Each connection has an enable/disable toggle; a disabled project serves no page (its specs disappear everywhere) and its SSE watch stops, but it stays listed so it can be re-enabled. Add more projects the same way; **Edit**, **Remove**, and **Reconnect** act per row. **Edit** opens an inline form to change a project's URL, label, or token (leave the token blank to keep the current one) and re-tests the connection on save.

A project whose manifest pins no `domains` is inactive by default (its specs would otherwise show on every site). The row shows a warning and an **Apply to all sites** checkbox; tick it only if you intend that project's specs to appear everywhere.

## 7. See specs render

Visit the demo app (`http://localhost:3000`). Matched specs appear as tooltips on their elements (the badge turns amber when a match needs review). Edit a `.spec.json` on disk and the page live-updates via SSE.

The popup lists the specs for the current page and toggles Specpin on/off. The top-right header holds a settings gear (opens the Options page), a **+ New project** button (create a local project or connect a sidecar inline), and, when a project serves the page, an **Export** button (download one project's specs as a `.specs.zip`; if several serve the page, it opens a small picker to choose which one). Export covers both local projects (from their stored bundle) and connected sidecar projects (from their live cache; sidecar exports derive group names from file names since the cache flattens groups). The primary controls (**+ Capture spec** and the display-mode select) sit directly above the list so they stay visible without scrolling, with the spec **Language** picker just above them. Each spec row shows a small source badge (`sidecar` or `manual`) marking which source it came from. A search box above the list filters specs live by title, file, and tags. When more than one project serves the page, the popup lists each matching project and renderers caption each spec with its project. Turning Specpin off for the page collapses the list to an off notice and hides the controls that only act on it (search, language, capture, mode, filters); the status, project list, and settings gear stay.

### Side panel (docked)

The same controls are also available as a **side panel** that stays open while you browse. Unlike the popup it shows each spec's description and business rules inline, and it refreshes automatically as you switch tabs or navigate. The search box also filters by description in the side panel. Open it from the popup's **Open as side panel** link (Chrome) or Firefox's native sidebar toggle (**View -> Sidebar -> Specpin**). To make the toolbar icon open the side panel instead of the popup, set **Toolbar icon -> Open the side panel** on the Options page (Chrome only; on Firefox the toolbar icon always opens the popup).

## 8. Switch language

Spec content (title, description, business rules) is localized. The popup's **Language** dropdown sets the active locale and re-renders all display modes; the side panel header mirrors it. The choice persists across sessions. A spec with no text for the chosen locale falls back to the project's `defaultLocale`, then to any present locale. The dropdown offers the union of `settings.locales` across the connected projects.

## 9. Filter specs by tag, file, or page URL

The popup and side panel offer facet-based filters: Tags, Files, and This page (URL pattern). Unchecking a facet hides all matching specs immediately. A personal override (force-show or force-hide) syncs across machines via `chrome.storage.sync`. The side panel also offers a per-spec eye toggle for finer control. **Reset** clears all personal overrides.

Team admins can set project-wide defaults in the Options page (**Team visibility** per connection): add facet keys (one per line, e.g. `tag:draft`, `file:login.spec.json`, `url:/admin/**`) to hide them for everyone. Team defaults are written to `.specs/views.json` (Git-committed) via the sidecar. Personal overrides win over team defaults: a personal force-show of `spec:<id>` is a hard rescue (reveals that spec even if its tag or file is team-hidden). The `url:` page gate wins over everything (hides specs on pages that do not match the glob). Empty state = all visible.

## 10. Capture a new spec (with translations)

Click **+ Capture spec** in the popup (or press `Alt+Shift+C`), click an element, then fill the form. The form has a row of **language tabs** (one per locale, plus a **+** tab to add one): click a tab to author that language's title/description/rules, then switch tabs to add a translation - switching tabs keeps what you already entered. The default language requires a title and description. The description and business-rules fields have a small **Markdown toolbar** (description: bold / italic / link / bullet / numbered; rules: bold / italic / link); each button inserts Markdown into the textarea around your selection. The **Save to** picker lists every writable project serving the page, labelled by kind (`sidecar` or `local`); pick one (a lone target is selected automatically, and capture is disabled with an explanation when no project serves the page). On save the spec is validated and written: a sidecar target writes the chosen `.spec.json` (pretty-printed) so it shows up in `git diff`; a local target writes it into `browser.storage.local` (origin-bounded, never a sidecar). Captured specs carry `meta.source: "manual"`. The authored Markdown renders as formatted text in every display mode (see [schema-reference](./schema-reference.md#formatting-markdown-subset) for the supported subset).

### Right-click menu

When Specpin is on, the page right-click menu has a **Specpin** submenu with four actions: **Pin spec to this element** (capture the element you right-clicked directly, skipping the hover-pick step), **Show spec here** (frame the matched element and pin a tooltip with its spec content, regardless of the spec's configured display mode; shows a brief notice when nothing here has a spec), **Capture spec (pick element)** (the same hover-pick mode as the popup button), and **Turn off Specpin**. The submenu is hidden while Specpin is off; turn it back on from the popup or `Alt+Shift+S`. The labels follow the Options page UI language.

## 11. Edit an existing spec

Open a spec for editing from either surface: click a tooltip badge to pin it and hit **Edit spec**, or click **Edit** on a spec card in the side panel. The same form opens pre-filled with the spec's content for every authored language; change the title, description, business rules, tags, or display mode and click **Save changes**. The spec keeps its `id` and provenance (`createdBy`/`createdAt`/`source`); only `updatedAt` is bumped. The change writes back through the owning sidecar and live-updates the page via SSE, the same as editing the `.spec.json` on disk.

To point a spec at a different element, click **Re-link element** in the edit form, then click the new element on the page; the form reopens with your edits intact and the new fingerprint applied on save. Local (Manual) specs are now editable the same way; the edit writes back to `browser.storage.local` instead of a sidecar. (Side panel Edit drives the in-page form, so keep the panel docked next to the page it describes.)

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

Specs render as a **tooltip** (hover peek), a **sidebar** (persistent list), or a **modal** (a draggable, non-blocking panel listing every spec on the page). The modal opens centered but you can drag it by its header to anywhere on screen, and the page behind stays interactive (no dimming overlay) so you can keep it open while you work. Switch with the popup's mode dropdown or cycle with `Alt+Shift+M`. Per-spec `preferredDisplayMode` and the manifest `defaultDisplayMode` still apply when no mode is forced.

You can dismiss the sidebar (its **x** button) or the modal (its **x** button only - `Esc` and clicks outside no longer close it). A dismissed surface collapses to a small **Specpin** pill in the page's bottom-right corner showing the matched-spec count; click it to reopen. Drag the pill to move it anywhere on the page, and the new position is remembered for next time (clamped back into view if the window is smaller). The dismissed state survives re-renders and in-page navigation, and clears whenever you explicitly pick a mode (the dropdown or `Alt+Shift+M`).

## Use without a sidecar (Manual import)

To view specs without running `specpin serve`, open the extension Options page and load them under **Manual specs**. There are two ways to import:

**From files (no JSON assembly).** Click the file picker, select `manifest.json` plus one or more `*.spec.json` files from your `.specs/` directory, then **Load from files**. The extension assembles and validates them in-page.

**From a pasted bundle.** Paste a single JSON object of this shape, then **Load pasted bundle**:

```json
{ "manifest": { …manifest.json… }, "files": { "login.spec.json": { …spec file… } } }
```

To produce that bundle from a repo's `.specs/` without hand-assembly, use the CLI:

```bash
specpin bundle --dir .specs            # print bundle JSON to stdout (copy/paste or pipe)
specpin bundle --dir .specs --out bundle.json   # write it to a file instead
```

`bundle` only reads and assembles; it does not validate (run `specpin validate` for schema checks, or rely on the in-page validation on import). Either path validates against the schema before anything is stored.

**Each import appends a batch.** Loading a bundle (paste or files) adds it as a new batch rather than replacing the previous one, so several imports coexist. If a new import duplicates an earlier one (same project name) it is still loaded, with a non-blocking note naming the prior batch; a cross-batch spec-id overlap on the same site is flagged too (only the first matching batch renders/edits each id). The loaded batches are listed below the buttons, one card per import, with the batch's pinned sites (its manifest `domains`, or "all sites" when it pins none) shown inline. Each batch has **Export** (download its `.specs.zip`), **Rename** (change the project name and pinned sites), and **Remove**; **Clear all manual specs** empties the whole list. Manual specs persist across browser restarts and merge into a page's specs alongside any connected projects whose `domains` match the page (manual specs use their own manifest `domains`; repeated spec ids across batches render once).

### Local authoring loop (no sidecar)

The Manual source is a full local authoring path, not just a read-only viewer:

1. **Create** a local project from the popup or side panel: **+ New project** -> *Local project*, give it a name and (optionally) the sites it applies to. With no sites and no **Apply to all sites**, the project serves no page (so it has no writable target yet) - set one or the other to capture into it.
2. **Capture / edit** specs into it exactly like a sidecar project (capture picks it in the **Save to** picker; edit works in place). Writes go to `browser.storage.local`, origin-bounded to the project's sites, and are schema-validated before they are stored.
3. **Export** the project (popup/panel **Export**, or per-batch **Export** in Options) to a `<project>.specs.zip` containing `manifest.json` + one `*.spec.json` per group. Unzip it into a repo's `.specs/`, or re-import the files through the multi-file picker - the round-trip preserves group names and spec content, and `specpin serve` reads the result.

Created-in-extension projects count against the same 50-batch cap as imports and show a **Local** provenance label in Options.

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
