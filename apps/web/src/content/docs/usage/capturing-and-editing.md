---
title: Capturing and Editing Specs
description: How to capture new specs and edit existing ones in place.
---

Specpin lets you author specs directly on the page, no leaving the browser.

## Manual capture

Enter capture mode, click an element, and fill the form.

1. Click **+ Capture spec** in the popup or side panel, or press `Alt+Shift+C`.
2. Hover over the page. A highlight frame appears around elements as you move.
3. Click the element you want to spec.
4. The capture form opens. Fill the fields (see below).
5. Click **Save spec**.

The spec writes to the chosen project and appears immediately on the element.

### Capture form fields

- **Language**: A row of tabs (one per locale, plus a **+** tab). Click a tab to author that language's title, description, and rules. Switch tabs to add a translation. The form preserves what you entered for each language.
- **Title**: A short label (required for the default language).
- **Description**: What the element does (required for the default language). Markdown supported.
- **Business rules**: One rule per line (optional). Markdown supported (inline marks only).
- **Tags**: Comma-separated (optional, e.g. `auth, critical`).
- **Status**: Lifecycle state — draft, approved, or deprecated (optional; leave unset for neutral).
- **Links**: Author-declared references to related tickets, docs, or PRs (optional). Each is a label plus an `http`/`https` URL.
- **Linked tests**: Repo-relative test paths that declare this spec (optional). These are *declared* links, not test results — Specpin checks the paths exist during `specpin validate`, but never runs them.
- **Display mode**: Use project default, tooltip, or sidebar.
- **Target project**: Which project to save into. With more than one writable project serving the page, pick from the dropdown. With exactly one, it is selected automatically. With none, capture is disabled with an explanation.
- **Target file**: The `.spec.json` file to write into (pre-filled, editable).

:::tip
The **+** tab lets you add a new language. Enter a BCP-47 locale code (e.g. `vi`, `ja`, `en-US`). Each locale gets its own tab. The default language (from the project's manifest) requires a title and description.
:::

## Markdown toolbar

The **Description** and **Business rules** fields have a small toolbar with Markdown insert buttons:

- **Description toolbar**: Bold, Italic, Link, Bullet list, Numbered list.
- **Business rules toolbar**: Bold, Italic, Link (each rule is one line, so block lists do not apply).

Click a button to insert Markdown around your selection. The **Link** button prompts for a URL.

## Multi-language authoring

Switch between language tabs to author a spec in multiple locales. The form stashes what you entered for each language as you switch, so nothing is lost.

The default language (from the project's manifest) must have a title and description. Other languages are optional. When a user views a spec in a language that has no text, it falls back to the default locale.

## Target project picker

With more than one writable project serving the page, the **Target project** dropdown lists them by name and kind (e.g. "CRM (local)" vs "My Sidecar (sidecar)"). Pick the one you want to save into.

With exactly one writable project, no picker shows (the lone project is used). With none, capture is disabled and the form explains that you need to create a local project or connect a sidecar first.

## Edit an existing spec

Click **Edit** on a spec card in the side panel, or click a tooltip badge then **Edit spec** in the pinned tooltip.

The same form opens, pre-filled with the spec's content for every authored language. Change any field and click **Save changes**. The spec keeps its `id` and provenance (`createdBy`, `createdAt`, `source`); only `updatedAt` is bumped.

Edit writes back through the owning project (sidecar or local) and live-updates the page.

## Mark reviewed

The edit form has a **Mark reviewed** action that stamps the spec's review date (`reviewedAt`) and a reviewer token (`reviewedBy`). Enter a **non-PII token** — a name or handle, not an email — because it is committed to Git and included in exports; the form warns you of this. The review date drives the **stale** indicator on rendered specs once it passes the project's staleness threshold.

## Re-link element (edit only)

When editing a spec, you can point it at a different element:

1. Click **Re-link element** in the edit form.
2. The form hides. Hover over the page and click the new element.
3. The form reopens with your edits intact and the new fingerprint applied. Click **Save changes** to apply.

## Right-click menu

When Specpin is on, the page right-click menu has a **Specpin** submenu:

- **Pin spec to this element**: Capture the element you right-clicked directly, skipping the hover-pick step.
- **Show spec here**: Frame the matched element and show its spec in a tooltip, regardless of the spec's display mode. Shows a brief notice when nothing here has a spec.
- **Capture spec (pick element)**: Enter hover-pick mode (same as the popup button).
- **Turn off Specpin**: Turn Specpin off for the page.

The submenu is hidden while Specpin is off. Turn it back on from the popup or press `Alt+Shift+S`.

## Export specs (local projects)

Local projects can be exported as a `.specs.zip` bundle:

1. In the popup or side panel, click **Export** (top-right). If several projects serve the page, a picker appears.
2. In the Options page, click **Export** on a local project's card.

The bundle contains `manifest.json` plus one `*.spec.json` per group. Unzip it into a repo's `.specs/` directory, or re-import the files through the multi-file picker in Options.

Sidecar projects also support **Export** (the bundle is assembled from the live cache).
