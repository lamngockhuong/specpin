# Spec-sheet Authoring (spec-first, manual)

> Tiếng Việt: [`vi/spec-sheet-authoring.md`](./vi/spec-sheet-authoring.md). English is the source of truth.

**Specshot** lets you author a spec **from a screenshot or design, before the UI exists** - useful
for a PM/designer documenting a flow ahead of implementation, or anyone annotating a reference
image. It is hosted **inside the browser extension** as its own page (`specshot.html`, backed by
the shared `@specpin/specshot-app` composition), and it works fully **offline**. See
`docs/specshot-integration.md` for the design record behind this feature and
`docs/schema-reference.md` for the `Spec`/`ShotConfig` shapes it produces.

## Open it

Load/install the Specpin extension, then click **Open spec sheet**:

- from the toolbar **popup**, or
- from the **side panel** header.

Either opens the `specshot.html` page in a new tab. There is no separate dev server to run.

## 1. Load a screenshot

Click **Open image** and pick a PNG/JPEG/WEBP/SVG file. For an SVG source, **Detect from SVG** can
auto-suggest boxes from the shapes in the file (best-effort - review and clean up the result).

## 2. Draw and number boxes

Switch to **Add box** (or press `A`) and drag on the image to draw a box; it is numbered
automatically. **Select** (the other tool) lets you click an existing box to edit or delete it
(`Delete`/`Backspace`), and `Esc` deselects. Choose **Reindex mode** - `Hierarchical` (`1`, `1.1`,
`1.2`, `2`, ...) or `Flat` (`1`, `2`, `3`, ...) - then click **Reindex** to renumber every box in
reading order.

## 3. Author a spec per box

Select a box, then in the spec form either:

- **New pending spec**: fill in a spec id, title, description, and optional business rules (one per
  line). Saving builds and validates a **pending spec** - no `fingerprint` - via
  `buildPendingSpec()`. A pending spec is exactly as valid as a normal one; it is just not yet
  linked to a live element (see "Pending vs. pinned vs. orphaned" in `docs/schema-reference.md`).
- **Existing spec**: pick a `specId` already known to a connected sidecar, to have this callout
  document a spec that already exists (pending or pinned) instead of authoring a new one. This
  path needs a sidecar connection (see below) - the list is empty offline.

## 4. Name the screen

Enter a **Screen id** (e.g. `checkout`) and a display name. If a sidecar is connected and that id
matches a `Screen` already in `screens.json`, the picker shows its known linked-spec count;
otherwise the shot still exports fine, just not grouped under a known screen yet.

## 5. Export

- **Shot JSON**: the raw shot data (numbered boxes + bboxes), independent of `Spec`.
- **Spec sheet HTML** / **Spec sheet MD**: the shareable artifact - the image with numbered
  callouts alongside the full spec (title/description/rules) for each number. Hand this to a
  reviewer or drop it in a PR/doc; no sidecar needed to produce or read it.

The toolbar also offers plain **PNG** / **JSON** / **SVG** / **Legend** exports of the annotated
image itself (from `specshot-core`'s general-purpose builders), separate from the spec-sheet
exporter above.

## Optional: connect a sidecar

Enter the sidecar's **URL** (default `http://127.0.0.1:4848`) and its **token**, then **Connect**.
Once connected:

- Saved pending specs are also persisted into `.specs/` via `saveSpec`.
- The shot artifact is persisted to `.specs/shots/<screenId>.shot.json` via `putShot`.
- **Existing spec** in the spec form and the **Screen id** datalist are populated from the sidecar.

Nothing above requires this connection - authoring and export both work with no sidecar running.
This mirrors `specpin serve`'s own token-auth model (see `docs/run-guide.md`); the token is only
ever sent to the URL you entered. Because this page is hosted at an extension origin
(`chrome-extension://...`), the sidecar's CORS policy accepts it; a separately-hosted web page
could never connect (the sidecar rejects all web origins).

## What happens next (bind-later, not yet shipped)

A pending spec authored here shows up read-only in the extension's popup/side panel **Unpinned**
section once the UI it describes ships and a sidecar serves the page. Actually linking it to a live
DOM element ("bind-later": pick the element, capture its fingerprint, promote the spec to pinned) is
Phase 2 of `docs/specshot-integration.md` and has **not been built yet** - there is currently no
in-extension action to add a fingerprint to an already-existing pending spec.
