---
title: Graph Views
description: Author status-flow and screen-transition diagrams and browse them in a full-page graph view.
---

Two optional `.specs/` files render as diagrams in a dedicated full-page **graph view**: a **status-flow** graph (how an object's status moves between states) and a **screen-transition** graph (which screen navigates to which, and through what action). Both are authored by hand in `.specs/` alongside your specs.

:::note
Graph views render data from `.specs/flows.json` and `.specs/screens.json`. Author them directly as JSON (see [Spec format](/sidecar/spec-format/) for the general `.specs/` authoring model, and [`flows.json`/`screens.json` on GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md#flowsconfig-specsflowsjson) for the exact field-by-field format) - or edit nodes and transitions directly in the graph view itself, with no JSON hand-editing at all; see [Edit flows/screens in the browser](#edit-flowsscreens-in-the-browser) below. `screens.json` transitions can also be populated by turning on auto-capture and approving what it observes - see [Auto-capture screen transitions](#auto-capture-screen-transitions).
:::

## Author a status-flow graph

Create `.specs/flows.json` to describe an object's lifecycle (e.g. how a "Deal" moves through your sales pipeline):

```json
{
  "version": "1.0",
  "flows": [
    {
      "id": "deal-status",
      "object": { "en": "Deal" },
      "states": [
        { "id": "draft", "label": { "en": "Draft" }, "kind": "initial" },
        { "id": "negotiation", "label": { "en": "Negotiation" } },
        { "id": "won", "label": { "en": "Won" }, "kind": "terminal", "specId": "deal-stage" },
        { "id": "lost", "label": { "en": "Lost" }, "kind": "terminal", "specId": "deal-stage" }
      ],
      "transitions": [
        {
          "id": "start-negotiation",
          "from": "draft",
          "to": "negotiation",
          "trigger": { "en": "Start negotiation" },
          "specId": "deal-submit"
        }
      ]
    }
  ]
}
```

A file can hold several independent flows (one per object type). Each state's `kind` (`initial` / `normal` / `terminal`) shapes how it renders; a state or transition's optional `specId` links it back to a pinned spec, so clicking it in the graph can jump to the live element (see [Click-to-highlight](#click-to-highlight) below).

## Author a screen-transition graph

Create `.specs/screens.json` to describe your app's navigation:

```json
{
  "version": "1.0",
  "screens": [
    { "id": "login", "name": { "en": "Login" }, "urlGlob": "/login" },
    { "id": "dashboard", "name": { "en": "Dashboard" }, "urlGlob": "/" }
  ],
  "transitions": [
    {
      "id": "login-to-dashboard",
      "from": "login",
      "to": "dashboard",
      "trigger": { "en": "Sign in" },
      "specId": "login-submit-btn"
    }
  ]
}
```

Each screen's `urlGlob` identifies it on the live UI, reusing the same glob syntax as a spec's page scoping (`*` matches one path segment, `**` matches across segments).

## Open the graph view

Click **Open graph view** from the header's **⋯ More actions** menu in the popup or side panel. It opens in a new browser tab. If a page serves more than one project, a project picker appears above the canvas; a status-flow / Screens dataset picker is always shown once a project is selected, regardless of whether both datasets have content yet - so an empty dataset stays reachable (e.g. the Screens dataset for auto-capture review, or the status-flow dataset to author your first flow). It defaults to whichever dataset is non-empty for convenience. Your project/dataset choice is remembered across reloads (and reopening the graph tab), so a refresh returns you to the same view instead of resetting to the first project.

The view opens without waiting on a server: it paints from what needs no network first - Manual-import projects and any sidecar already loaded - so a configured-but-not-running sidecar cannot hold the panel blank while its requests time out. Sidecars still being reached show **Reaching the connected projects...** on an otherwise-empty canvas, and their projects join the picker as they answer. A project you switched **off** on the Options page is skipped entirely: it is not contacted and does not appear in the picker.

## Browse the graph

- **Graph / Table toggle**: switch between the visual diagram and a plain sortable table of the same nodes and edges.
- **On-graph toolbar** (floating at the canvas's top-left): the controls that act on the diagram itself - a **Horizontal** / **Vertical** layout-direction toggle (left-to-right or top-to-bottom, whichever reads better) and zoom buttons (**in** / **out** / **fit to view**).
- **Category filter**: tabs group nodes and show a count for each (a status-flow graph groups by object type; a screen graph groups by the first path segment of each screen's `urlGlob`). Selecting a tab hides everything outside that category.
- **Search**: type to highlight matching node labels live. Search highlights - it does not hide anything (combine it with the category filter to narrow down first).
- **Focus**: click a node to dim everything except it and its directly connected nodes and edges. Click it again, or an empty area, to clear the focus.
- **Pan and zoom**: drag the canvas to pan; scroll to zoom (or use the on-graph toolbar's zoom buttons).
- **Collapse controls**: the caret button at the header's right edge folds the whole top control stack away - the controls row (view toggle, category tabs, search), the recording banner, and (in edit mode) the edit toolbar - to give the diagram their full height; click again to restore them. While collapsed the recording alarm and its Turn off / Save actions are hidden until you expand again.

These combine freely, so you can filter to one category, search within it, and focus a specific node all at once - useful for a graph with hundreds of nodes.

## Click-to-highlight

Clicking a node or edge that carries a `specId` jumps back to the tab the graph view was opened from: if that spec is currently matched there, its element scrolls into view and flashes, the same highlight used by a deep link or the keyboard cycle shortcut.

If the spec isn't matched on that tab (you're on the wrong page, or the element isn't there), a hint appears naming the screen or page it belongs to instead of doing nothing. Nodes and edges with no `specId` - a pure status like "Won", or a navigation with no single element that triggers it - render normally but have nothing to jump to.

:::tip
Give a state or transition a `specId` whenever a real UI element represents it (a status badge, a submit button) so the graph and the live page stay connected. Nodes that are purely conceptual (like a terminal status with no dedicated element) can safely leave `specId` unset.
:::

## Auto-capture screen transitions

Instead of hand-writing every entry in `screens.json`, you can turn on an opt-in recorder that watches your own navigation and proposes new screen transitions for you to approve.

:::caution
Off by default. Read what's captured before turning it on.
:::

**Enable it.** Auto-capture is **per project**, not device-wide, so a stabilized project need not keep recording. Turn it on for a specific project from its row on the extension's Options page (each project row has a **Record** switch beside its enable/disable switch), or from the graph view while reviewing that project (the recording banner's **Turn on** action). A project records **only on the pages it serves** - navigation on any other site is ignored and never stored. The Options page's **Support** pane has an **FAQ** entry explaining the auto-capture privacy contract; the graph view shows a per-project recording banner with **Turn on**/**Turn off** and **Clear all captured** (for the selected project) actions.

**What's captured.** Only a generalized screen path per page (e.g. `/orders/**`, never `/orders/1938`) and the navigation between two such screens. Never captured: query strings, hash fragments, or page content. Path segments that look like ids are generalized to `**` before storage - review each transition before you Approve it. Nothing reaches `.specs/` at capture time - every observed transition lands in a local, per-project draft buffer (bounded, `storage.local`, never uploaded) and stays a proposal.

**Review and approve.** With recording on, browse the site, then open the graph view's **Screens** dataset: newly-observed screens/transitions render as dashed, translucent "ghost" nodes/edges among the committed ones. Click a ghost edge to **Approve** (merges it into `screens.json` with `"source": "auto-captured"`, never overwriting an existing manual/imported entry with the same id) or **Discard** (drops it, no write either way). The banner also tells you when recording is on but nothing's captured yet, and when a project's draft buffer is full.

**Ignore noisy routes.** Menu, sidebar, and utility navigation (e.g. `/settings`, `/help`) can flood the review with ghost edges you never want in the flow. A ghost edge's review panel has an **Ignore route** action: it adds the destination screen's URL glob to that project's ignore-list and drops every draft edge already on that route, so the recorder stops re-capturing it. Manage the list from the project's row on the Options page - an **Ignored routes** editor appears under a recording project, where you add a glob (same `/settings/**` syntax as page-scope globs) or remove one to record that route again. A transition is dropped when **either** endpoint matches a glob, so an ignored screen leaves the flow entirely.

:::note
Full privacy chain: opt-in, default **off** -> generalized URL shape only (query/hash dropped, id-like path segments generalized to `**`) -> local per-device draft buffer, never auto-written -> requires your explicit Approve before anything reaches `.specs/`. Nothing captured ever leaves your machine.
:::

## Edit flows/screens in the browser

The graph view isn't only a diagram to look at - turn on **Edit mode** to add, edit, and delete nodes and transitions directly on the canvas, with no JSON hand-editing at all.

**Turn it on.** Click **Edit mode** in the graph view's control bar. A dedicated edit bar opens below the controls with the toolbar (**Add node**, **Add edge**, **Delete selected**, **Undo**, **Save**), a how-to hint, and a live status line. Each button enables only when its precondition is met - **Add edge** waits for two selected nodes, **Delete selected** for exactly one node or edge, and **Undo**/**Save** for an unsaved change - so a greyed-out button tells you what the action still needs. Clicking a node or edge now selects it for editing instead of navigating or click-to-highlighting. Auto-captured **ghost** (pending) transitions stay on the Screens diagram in edit mode too - they don't vanish when you toggle Edit on - and clicking one still opens its **Approve / Discard** panel rather than the edit form, so a recording stays reviewable while you edit.

**Add a node.** Click **Add node** and fill in the side form: a localized name/label (add a row per locale), a `urlGlob` (screens) or `kind` (flows' states: initial/normal/terminal), and an optional linked spec picked from the project's known specs. **Create** adds it to the draft. On the status-flow dataset, a new node belongs to whichever flow is currently active - use the flow controls to create one first if the project has none yet.

**Edit a node or edge.** Click an existing one to open the same side form, pre-filled. Every valid field change applies to the in-memory draft right away; **Save** is still what persists the draft to `.specs/`. A transition that came from code-import (flows dataset only) renders read-only here - change it by re-running the import instead. An auto-captured navigation edge (Screens dataset) is directly editable: editing any of its fields reclassifies it to manual on Save, so auto-capture stops managing it afterwards.

**Editing across multiple flows (status-flow only).** A `flows.json` can hold several independent flows, all drawn on one canvas, but only one is *active* for editing at a time - the rest render read-only. When two or more flows are present, a **flow picker** appears in the edit bar: pick which flow to edit from it, or just click any node or edge of another flow and editing switches to it automatically. If the current flow has unsaved changes, switching asks you to save or discard first.

**Add an edge.** Click two nodes in order (from, then to) to arm them, then **Add edge** to open a form for the trigger label plus optional guard, role, and linked spec.

**Delete.** Select exactly one node or edge, then **Delete selected** - or press the **Delete** key, which does the same thing (ignored while typing in a form field or while a dialog is open). Either path opens a confirmation dialog first; confirming a node also removes every edge connected to it, and the dialog says so. On the status-flow dataset, a node still referenced by an imported edge refuses to delete outright - resolve that through code-import first (a manually-added edge cascades away with the node). On the Screens dataset, deleting an auto-captured edge, or a screen it points at, is allowed directly - the edge reclassifies to manual on Save rather than blocking the delete. Deleting a screen that a specshot spec sheet still references is allowed here regardless; that gets checked at Save instead (next).

**Undo.** **Undo** reverts the single most recent change - one step, not a full history. Use it right after a slip, before making another edit.

**Save, and the orphaned-shot check.** **Save** persists the whole draft: validated and merged the same provenance-preserving way as the auto-capture Approve flow above - your edits never clobber an entry from another source, and vice versa. If this session removed a screen that a spec sheet still references, Save asks you to confirm first, naming how many would be orphaned (or a general caution when it can't check) - Cancel to reconsider, or continue to save anyway.

**Leaving with unsaved edits.** Turning Edit mode off, switching project, switching the active flow, or switching the flows/screens dataset while a draft has unsaved changes asks you to save or discard first; a clean draft never prompts. Closing or reloading the tab with unsaved edits triggers the browser's own leave-page warning too.

:::note
The editor writes only `.specs/flows.json` and `.specs/screens.json`, through the same read-merge-validate-write path every other writer here uses - no new schema, no new write surface.
:::
