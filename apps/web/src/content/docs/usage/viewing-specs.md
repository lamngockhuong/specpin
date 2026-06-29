---
title: Viewing Specs
description: How to view, search, and filter specs on a page.
---

Once a project is connected, specs appear on matched elements.

## Turn Specpin on/off

Click the toggle at the top of the popup, or press `Alt+Shift+S`. When Specpin is off, specs disappear from the page. The setting persists across sessions.

## Display modes

Specs render in one of three modes:

- **Tooltip**: A small badge on each element. Hover to peek at the spec. Click the badge to pin the tooltip open (with **Edit spec** and **Open in side panel** actions).
- **Sidebar**: A persistent panel listing all specs on the page. Appears on the right side of the page. Click the **x** button to dismiss it (reopens with a small Specpin pill in the bottom-right corner).
- **Modal**: A draggable panel showing all specs. Opens centered, drag the header to move it. Click the **x** button to dismiss.

Switch modes with the **Display mode** dropdown in the popup or side panel, or press `Alt+Shift+M` to cycle through them.

Each spec can override the default with its own `preferredDisplayMode`. The dropdown shows **Per-spec mode** when no mode is forced.

## Side panel (Chrome and Firefox)

The **side panel** is a docked surface that stays open while you browse. It shows the same controls as the popup, plus each spec's full description and business rules inline. The search box also filters by description in the side panel.

- **Chrome**: Click **Open as side panel** from the popup, or set **Toolbar icon -> Open the side panel** in Options to make the toolbar icon open it directly.
- **Firefox**: Open it from **View -> Sidebar -> Specpin**. The toolbar icon always opens the popup on Firefox.

The side panel auto-refreshes as you switch tabs or navigate.

## Search specs

The search box in the popup and side panel filters specs live by title, file, and tags. In the side panel, it also searches description text. No results show a "No specs match your search" message.

## Source badges

Each spec row shows a small badge marking its source:

- **sidecar**: From a connected sidecar.
- **manual**: From a local project or a manual import.

Hover the badge to see a tooltip with more detail.

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
