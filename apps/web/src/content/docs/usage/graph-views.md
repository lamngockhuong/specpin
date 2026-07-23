---
title: Graph Views
description: Author status-flow and screen-transition diagrams and browse them in a full-page graph view.
---

Two optional `.specs/` files render as diagrams in a dedicated full-page **graph view**: a **status-flow** graph (how an object's status moves between states) and a **screen-transition** graph (which screen navigates to which, and through what action). Both are authored by hand in `.specs/` alongside your specs.

:::note
Graph views are a **read-only diagram** over data you author in `.specs/flows.json` and `.specs/screens.json`. There is no in-extension editor for them yet - edit the JSON files directly (see [Spec format](/sidecar/spec-format/) for the general `.specs/` authoring model, and [`flows.json`/`screens.json` on GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md#flowsconfig-specsflowsjson) for the exact field-by-field format).
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

Click **Open graph view** in the popup or side panel. It opens in a new browser tab. If a connected project has both a status-flow and a screen-transition graph configured, a dataset picker appears above the canvas so you can switch between them; if a page serves more than one project, a project picker appears too.

## Browse the graph

- **Graph / Table toggle**: switch between the visual diagram and a plain sortable table of the same nodes and edges.
- **Category filter**: tabs group nodes and show a count for each (a status-flow graph groups by object type; a screen graph groups by the first path segment of each screen's `urlGlob`). Selecting a tab hides everything outside that category.
- **Search**: type to highlight matching node labels live. Search highlights - it does not hide anything (combine it with the category filter to narrow down first).
- **Focus**: click a node to dim everything except it and its directly connected nodes and edges. Click it again, or an empty area, to clear the focus.
- **Pan and zoom**: drag the canvas to pan; scroll to zoom.

These combine freely, so you can filter to one category, search within it, and focus a specific node all at once - useful for a graph with hundreds of nodes.

## Click-to-highlight

Clicking a node or edge that carries a `specId` jumps back to the tab the graph view was opened from: if that spec is currently matched there, its element scrolls into view and flashes, the same highlight used by a deep link or the keyboard cycle shortcut.

If the spec isn't matched on that tab (you're on the wrong page, or the element isn't there), a hint appears naming the screen or page it belongs to instead of doing nothing. Nodes and edges with no `specId` - a pure status like "Won", or a navigation with no single element that triggers it - render normally but have nothing to jump to.

:::tip
Give a state or transition a `specId` whenever a real UI element represents it (a status badge, a submit button) so the graph and the live page stay connected. Nodes that are purely conceptual (like a terminal status with no dedicated element) can safely leave `specId` unset.
:::
