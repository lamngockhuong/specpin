---
title: Viewing Specs
description: How to view, search, and filter specs on a page.
---

Once a project is connected, specs appear on matched elements.

## Turn Specpin on/off

Click the toggle at the top of the popup, or press `Alt+Shift+S`. When Specpin is off, specs disappear from the page and the popup shows a paused panel (**Specpin is off**) that tells you how many specs are hidden on this page; turn it back on from the same toggle. When no project serves the page at all, the popup instead shows a **+ New project** prompt to get started. The setting persists across sessions.

## Display modes

Specs render in one of three modes:

- **Tooltip**: A small badge on each element. Hover to peek at the spec. Click the badge to pin the tooltip open (with **Edit spec** and **Open in side panel** actions).
- **Sidebar**: A persistent panel listing all specs on the page. Appears on the right side of the page. Click the **x** button to dismiss it (reopens with a small Specpin pill in the bottom-right corner).
- **Modal**: A draggable panel showing all specs. Opens centered, drag the header to move it. Click the **x** button to dismiss.

Switch modes with the **Display mode** dropdown in the popup or side panel, or press `Alt+Shift+M` to cycle through them.

Each spec can override the default with its own `preferredDisplayMode`. The dropdown shows **Per-spec mode** when no mode is forced.

## Cycle through matched specs

Press `Alt+Shift+N` to move between the specs matched on the current page: each press scrolls to and briefly flashes the next spec's element, wrapping back to the first after the last. It respects your reduced-motion setting.

## Side panel (Chrome and Firefox)

The **side panel** is a docked surface that stays open while you browse. It shows the same controls as the popup, plus each spec's full description and business rules inline. The search box also filters by description in the side panel.

- **Chrome**: Click **Open as side panel** from the popup, or set **Toolbar icon -> Open the side panel** in Options to make the toolbar icon open it directly.
- **Firefox**: Open it from **View -> Sidebar -> Specpin**. The toolbar icon always opens the popup on Firefox.

The side panel auto-refreshes as you switch tabs or navigate.

## Search specs

The search box in the popup and side panel filters specs live by title, file, and tags. In the side panel, it also searches description text. No results show a "No specs match your search" message.

## Share a spec (deep link)

Each side-panel spec card and each pinned tooltip has a **Copy link** action. It copies a URL of the form `<page-url>#specpin=<spec-id>`. Opening that link scrolls to and flashes the spec's element and opens the side panel with its card highlighted - handy for pointing a teammate at one spec in context.

If the element renders late, Specpin retries briefly before giving up. If the spec exists but its element is gone from the page, the side-panel card still opens and a short "not on this page" message appears. Any fragment your app already uses in the URL is preserved.

## What changed since last visit

The popup and side panel show a **"N changed since last visit"** digest: a count plus the titles of specs added or edited since you last looked, per project. Click **Mark all seen** to clear it and set the new baseline.

Detection compares a content hash of each spec's title, description, and business rules (across all languages), stored locally in your browser - no network, no telemetry. Switching the spec language never counts as a change. The first time a project appears, its specs are seeded silently, so nothing shows up as "new".

## Source badges

Each spec row shows a small badge marking its source:

- **sidecar**: From a connected sidecar.
- **manual**: From a local project or a manual import.

Hover the badge to see a tooltip with more detail.

## Provenance block

When a spec carries provenance fields, rendered specs show a provenance block:

- **Status badge**: the spec's lifecycle state (draft, approved, or deprecated), when set.
- **Links**: author-declared references to tickets, docs, or PRs. Each opens in a new tab.
- **Linked tests**: the `verifiedBy` paths that declare the spec, shown as a list. These are *linked*, not verified - Specpin does not run them or claim they pass.
- **Reviewed**: a "reviewed {relative time}" line from the last **Mark reviewed** action. Past the project's staleness threshold, a **stale** indicator appears, prompting a re-review.

Provenance is author-asserted: it reflects what the spec's author committed, and the real check is the Git-diff review of `.specs/`, not anything at runtime.

## Spec content language

Spec text (title, description, business rules) can be localized. The **Language** dropdown (labeled **Spec language** in the popup header) sets the active locale. The choice persists across sessions.

When a spec has no text for the chosen locale, it falls back to the project's `defaultLocale`, then to any present locale.

The **Language** dropdown lists the union of `settings.locales` from all connected projects.

:::note
This controls spec content language, not the extension's UI language. To change the UI language, see [Settings](/usage/settings/).
:::

## Facet filters

The popup and side panel offer filters by **Tags**, **Files**, and **This page** (URL pattern). Unchecking a facet hides all matching specs immediately.

A personal override (force-show or force-hide) syncs across machines via `chrome.storage.sync`. The side panel also offers a per-spec eye toggle for finer control. Click **Reset** to clear all personal overrides.

## Specs that need review

When a spec's fingerprint cannot be matched exactly, it appears with an amber border and a **Needs review** tag. The badge turns amber (instead of the default blue). This means the element may have changed, and you should verify the spec still describes the right element.

When no exact match exists, Specpin can still fall back to a weighted **scored** match. A confident scored match renders normally but carries a distinct **Scored match** badge showing its confidence and the signal that matched it ("why matched"); a borderline one also gets the amber **Needs review** treatment. Below the confidence threshold nothing renders, rather than guess.

## Markdown rendering

Spec descriptions and business rules support a safe Markdown subset:

- **Inline marks**: bold (`**bold**`), italic (`_italic_`), links (`[text](url)`).
- **Lists**: bullet lists (`- item`) and numbered lists (`1. item`).

Markdown renders across all display modes (tooltip, sidebar, modal, side panel).

## Multi-project pages

When more than one project serves a page, the popup lists each matching project above the spec list. Each spec row shows a small project label. Renderers caption each spec with its project name.

## Export specs

The popup and side panel show an **Export** button (top-right) when a project serves the page. Click it to download a `.specs.zip` of that project's specs. If several projects serve the page, a picker appears to choose which one to export.

Local projects also show **Export** per batch in the Options page.
