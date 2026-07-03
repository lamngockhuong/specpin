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

### Language

Choose the language for Specpin's UI:

- **System default**: Use your browser's UI language (falls back to English if not available).
- **English**: Force English UI.
- **Tiếng Việt**: Force Vietnamese UI.

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
| `Alt+Shift+N` | Cycle focus through matched specs (flash each, wrap around) |
| `Alt+Shift+G` | Start / stop the default guided tour |

Shortcuts are always active. You cannot customize them from the Options page (use your browser's extension shortcut settings if you need to change them).

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

The Options page has a **Manual specs (no sidecar)** section where you can import specs without running `specpin serve`. Load specs from files (pick `manifest.json` + one or more `*.spec.json`) or paste a bundle JSON.

Each import appends a batch. Loaded batches appear below the buttons, one card per import, with **Export**, **Rename**, and **Remove** actions. Click **Clear all manual specs** to empty the list.

See the [Run Guide](/guide/getting-started/) for the bundle JSON shape and the `specpin bundle` command.
