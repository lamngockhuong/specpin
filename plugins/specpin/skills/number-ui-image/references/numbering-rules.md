# Numbering Rules

How to turn what you see into `itemNo` values and bounding boxes.

## What counts as one item

Number a component when it is a distinct, meaningful unit a person would point at:

- Interactive controls: button, link, input, dropdown, slider, toggle, checkbox, tab.
- Content blocks: heading, paragraph/description, breadcrumb, badge, stat/value display, note.
- Containers: navbar, sidebar, card, section, button-group — number the container AND its
  meaningful children (children nest under it, see below).

Do NOT number:

- Pure decoration (dividers, background shapes, spacing) with no informational role.
- Every character of text separately — a label + its control is usually one item, or a
  label→input pair where the input is the item.

## Reading order

Walk the screen top→bottom, then left→right within the same band. A left sidebar is enumerated
before the main content to its right only if it starts higher; otherwise follow visual flow.
Assign numbers in that traversal order so the result reads naturally.

## Hierarchy (default) vs `--flat`

- **Default (hierarchical):** when a container visibly encloses children, give the container an
  integer (`6`) and its children `6.1, 6.2, …`. Nest a third level (`6.2.1`) ONLY when a child
  clearly contains its own sub-elements. **Max depth 3.** If the design seems to need `1.1.1.1`,
  stop nesting and keep it at depth 3 — or ask the user.
- **`--flat`:** ignore containment; number every chosen item `1, 2, 3, …` in reading order.

Only create nesting when containment is **visually explicit**. Do not infer structure that the
pixels do not show.

## Bounding boxes

- Coordinates are in the original raster image's pixel space (the `width`×`height` you recorded).
- `position` = `{ startX, startY, endX, endY }` with `startX <= endX` and `startY <= endY`.
- Draw the box tight around the item's visible extent, with a few px of breathing room.
- A container box may overlap its children — that is expected. Keep child boxes inside, or nearly
  inside, the parent extent.
- Every `itemNo` must be unique.

## Accuracy expectations

You are estimating pixels by eye — boxes will be approximate. Bias toward:

- Getting the **count and reading order** right first (that is what the numbers communicate).
- Correct **edges for interactive controls** (buttons/inputs) over pixel-perfect content boxes.
- After drawing, re-open the annotated image and fix any box that lands on the wrong element or
  whose label is clipped at a screen edge.
