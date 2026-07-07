---
title: Capturing and Editing Specs
description: How to capture new specs and edit existing ones in place.
---

Specpin lets you author specs directly on the page, no leaving the browser.

## Manual capture

Enter capture mode, click an element, and fill the form.

1. Click **+ Capture spec** in the popup or side panel, or press `Alt+Shift+C`.
2. Hover over the page. A highlight frame appears around elements as you move. A small on-screen HUD at the bottom-center shows an instruction prompt.
3. Click the element you want to spec.
4. The capture form opens. Fill the fields (see below).
5. Click **Save spec**. The form closes via the **X** icon in the modal header (top-right) or by pressing **Escape**. Clicking outside the modal no longer closes it.

The spec writes to the chosen project and appears immediately on the element.

### Capture form fields

- **Language**: A row of tabs (one per locale, plus a **+** tab). Click a tab to author that language's title, description, and rules. Switch tabs to add a translation. The form preserves what you entered for each language.
- **Title**: A short label (required for the default language). Opens pre-filled from the element itself (its aria-label, visible text, placeholder, name attribute, or a nearby label, in that order) so you start from a sensible default; fully editable, and left blank when the element exposes none of those.
- **Description**: What the element does (required for the default language). Markdown supported.
- **Business rules**: One rule per line (optional). Markdown supported (inline marks only).
- **Tags**: Comma-separated (optional, e.g. `auth, critical`).
- **Status**: Lifecycle state: draft, approved, or deprecated (optional; leave unset for neutral).
- **Links**: Author-declared references to related tickets, docs, or PRs (optional). Each is a label plus an `http`/`https` URL.
- **Linked tests**: Repo-relative test paths that declare this spec (optional). These are *declared* links, not test results. Specpin checks the paths exist during `specpin validate`, but never runs them.
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

Open a spec card's **⋯** (more actions) menu in the side panel and choose **Edit**, or click a tooltip badge then **Edit spec** in the pinned tooltip.

The same form opens, pre-filled with the spec's content for every authored language. Change any field and click **Save changes**. The spec keeps its `id` and provenance (`createdBy`, `createdAt`, `source`); only `updatedAt` is bumped.

Edit writes back through the owning project (sidecar or local) and live-updates the page.

## Mark reviewed

The edit form has a **Mark reviewed** action that stamps the spec's review date (`reviewedAt`) and a reviewer token (`reviewedBy`). Enter a **non-PII token** (a name or handle, not an email) because it is committed to Git and included in exports; the form warns you of this. The review date drives the **stale** indicator on rendered specs once it passes the project's staleness threshold.

## Re-link element (edit only)

When editing a spec, you can point it at a different element:

1. Click **Re-link element** in the edit form.
2. The form hides. The element picker HUD appears at the bottom-center. Hover over the page and click the new element.
3. The form reopens with your edits intact and the new fingerprint applied. Click **Save changes** to apply.

## Right-click menu

When Specpin is on, the page right-click menu has a **Specpin** submenu:

- **Pin spec to this element**: Capture the element you right-clicked directly, skipping the hover-pick step.
- **Show spec here**: Frame the matched element and show its spec in a tooltip, regardless of the spec's display mode. Shows a brief notice when nothing here has a spec.
- **Capture spec (pick element)**: Enter hover-pick mode (same as the popup button).
- **Turn off Specpin**: Turn Specpin off for the page.

The submenu is hidden while Specpin is off. Turn it back on from the popup or press `Alt+Shift+S`.

## Bulk capture

Capture multiple specs at once in a coordinated workflow.

### Starting bulk capture

1. Click **Bulk capture** in the popup or side panel (next to the "+ Capture spec" button).
2. Or, from coverage mode (see "Coverage mode" in [Viewing Specs](/usage/viewing-specs/)), click **"Capture all gaps (N)"** to pre-load undocumented elements.

### Multi-select picker

1. Elements appear with hover highlights as you move the cursor. An on-screen HUD at the bottom-center shows a live count ("N selected") and **Done** / **Cancel** buttons.
2. Click elements to toggle them into/out of the selection. Each selected element gets a persistent green outline.
3. The **Done** button is disabled until at least one element is selected. Press **Enter** or click **Done** to confirm and proceed to the form. Press **Esc** or click **Cancel** to cancel and return to the page.

### Bulk capture form

After selecting elements, the capture form opens with:

1. **Shared fields** at the top: tags, business rules, status, and (if multiple projects serve the page) a project picker; otherwise a target file.
2. A **per-element list** below: one row per selected element.
   - **Title** (auto-derived from visible text → aria-label → title attr → placeholder → humanized tag/role, editable inline).
   - A remove button (×) to drop that row.
   - Rows with duplicate titles are flagged so you can disambiguate them.
3. Shared fields are applied to all specs. Each row's description is pre-filled from its title (bulk capture collects titles, not separate descriptions). The bulk form closes via the **X** icon in the modal header or **Escape**. Clicking outside the modal no longer closes it.

### Saving bulk captures

Click **Save specs** to write all rows as separate specs to one shared `.spec.json` file (organized by page/route).

If a write fails mid-batch, the form stays open and marks which rows succeeded and which to retry. Succeeded rows are kept in the file; you can fix the issues and re-submit the remaining rows.

## Templates

Both single-element capture and bulk capture forms have a **"Start from template"** dropdown.

Pre-built templates include:

- **Form validation**: Pre-fills tags, business rules, and status optimized for form validation specs.
- **API error handling**: Pre-fills for error-handling specs.
- **Auth flow**: Pre-fills for authentication-related specs.

Selecting a template pre-fills **empty fields only**. It never overwrites text you've already entered. There's no confirm dialog. Templates are fixed in the UI and localized to your extension's UI language.

## Duplicate to element (clone)

When viewing a spec you can edit (tooltip badge or side-panel card), a **Duplicate to element** action appears. On the side-panel card it lives in the **⋯** (more actions) menu as **Clone**.

1. Click **Duplicate to element**.
2. The element picker appears (with the on-screen HUD to guide you). Click the new element on the page.
3. The capture form opens, pre-filled with the source spec's content: title, description, business rules, and tags.
4. The cloned spec gets:
   - A **fresh fingerprint** (matched to the new element).
   - A new `id` (re-derived from the title on save).
   - **Provenance reset**: status becomes `draft`, and review metadata (`verifiedBy`, `reviewedAt`, `reviewedBy`) is dropped.

This ensures an approved source spec never silently clone into "approved" on a new element: the cloned spec always starts as draft and requires re-review.

## Export specs (local projects)

Local projects can be exported as a `.specs.zip` bundle:

1. In the popup or side panel, click **Export** (top-right). If several projects serve the page, a picker appears.
2. In the Options page, click **Export** on a local project's card.

The bundle contains `manifest.json` plus one `*.spec.json` per group, and any `.specs/` config files that hold content: `guides.json`, `views.json`, and (local projects only) `required.json`. Empty config files are omitted. Unzip it into a repo's `.specs/` directory, or re-import the files through the multi-file picker in Options - the round-trip keeps guides and views, not just specs.

Sidecar projects also support **Export** (the bundle is assembled from the live cache).
