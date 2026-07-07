---
title: Settings
description: How to customize Specpin's appearance and behavior.
---

Open the Options page from the popup or side panel (click the settings gear in the top-right corner).

## Appearance

These settings control how Specpin's own interface looks. They apply to every Specpin surface (popup, side panel, options, and the in-page tooltip/sidebar/modal).

### Theme

Choose how Specpin displays:

- **System default**: Follow your operating system's light/dark preference.
- **Light**: Always use the light theme.
- **Dark**: Always use the dark theme.

The theme changes immediately across all open Specpin surfaces.

### Badge numbering

Off by default. When on, each on-page tooltip badge shows a reading-order number instead of the "S" mark: the top-left-most badge is `1`, and the largest number equals how many specs the screen carries. It is a quick way to count and locate the specs on a page.

The number is a position, not an identifier: adding or removing a spec renumbers the ones after it (like line numbers). It applies to the on-page tooltip badges only, and updates immediately across open tabs when you toggle it.

### Badge color

Pick the color of the on-page spec badge to match a site's palette or make a screenshot cleaner. The default is Specpin's brand teal; **Reset** returns to it. The glyph ("S" or the number) automatically switches between dark and light so it stays readable on whatever color you choose.

The color is global (one choice for all sites) and updates immediately across open tabs. It applies to the normal spec badge only: the yellow "needs review" badge keeps its warning color, and coverage markers are unchanged.

### Language

Choose the language for Specpin's UI:

- **System default**: Use your browser's UI language (falls back to English if not available).
- **English**: Force English UI.
- **Tiếng Việt**: Force Vietnamese UI.
- **日本語**: Force Japanese UI.

This setting is independent from the spec content language (the **Language** dropdown in the popup and side panel). Changing the UI language does not change which language specs display in.

## Toolbar icon (Chrome only)

On Chrome, you can choose what happens when you click the Specpin toolbar icon:

- **Open the popup**: Default behavior.
- **Open the side panel**: Click the icon to open the side panel directly.

:::note
On Firefox, the toolbar icon always opens the popup. Open the side panel from **View -> Sidebar -> Specpin** instead.
:::

## Support & Feedback

The Options page has links to the project's GitHub:

- **Report an Issue**: Opens the GitHub Issues page.
- **Ask a Question**: Opens the GitHub Discussions page.

Use these to report bugs, request features, or ask for help.

## Keyboard shortcuts

These shortcuts work on any page when Specpin is loaded:

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | Toggle Specpin on/off |
| `Alt+Shift+M` | Cycle display mode (tooltip -> sidebar -> modal) |
| `Alt+Shift+C` | Enter capture mode (`Esc` cancels) |
| `Alt+Shift+U` | Toggle coverage markers on undocumented elements |
| `Alt+Shift+N` | Cycle focus through matched specs (flash each, wrap around) |
| `Alt+Shift+G` | Start / stop the default guided tour |
| `Alt+Shift+?` | Open the keyboard cheat-sheet |

Not sure of a shortcut? Press `Alt+Shift+?` on any page for a read-only cheat-sheet, or open the same list under **Options -> Shortcuts**. Shortcuts are always active. You cannot rebind them from the Options page (use your browser's extension shortcut settings if you need to change them).

## Per-project settings

Each connected project in the Options page has its own row with these controls:

- **Enable/Disable toggle**: Turn the project on or off without removing it.
- **Edit**: Change the URL, label, or token (sidecar) or the name and domains (local).
- **Reconnect**: Test the sidecar connection again (sidecar only).
- **Export**: Download a `.specs.zip` of the project's specs (local and sidecar).
- **Rename**: Change the project name and domains (local only).
- **Remove**: Delete the connection.

See [Connecting Projects](/usage/connecting-projects/) for details.

## Manual specs (no sidecar)

The Options page's **Spec** section has a **Manual** tab where you can import specs without running `specpin serve`. Load specs from files (pick a whole `.specs/` folder: `manifest.json`, one or more `*.spec.json`, and any of `guides.json` / `views.json` / `required.json`) or paste a bundle JSON. Imported `guides.json` renders as team guides and `views.json` hides its facets, just like a sidecar; `required.json` is accepted and stored but currently has no in-extension effect (it is a CLI-only coverage checklist). You can also pick an exported `<project>.specs.zip` or a folder zipped with any tool: both uncompressed (STORE) and compressed (DEFLATE) zips re-import directly; a corrupt archive reports a clear error.

Each import appends a batch. Loaded batches appear below the buttons, one card per import, with **Export**, **Rename**, and **Remove** actions. Click **Clear all manual specs** to empty the list.

See the [Run Guide](/guide/getting-started/) for the bundle JSON shape and the `specpin bundle` command.
