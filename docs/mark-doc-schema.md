# MarkDoc JSON Schema (shared contract)

The single contract shared between the **`number-ui-image`** skill (producer)
and the **specshot** editor (consumer/editor). Both sides enforce these rules
independently and must stay byte-compatible:

- Enforcing twin in the skill: `scripts/annotate-image-bboxes.py` (in the
  `number-ui-image` skill directory)
- Enforcing twin in specpin: `packages/specshot-core/src/model/mark-doc.ts`

## Shape

```ts
type ItemNo = string  // "1" | "1.1" | "6.10"
interface Position { startX: number; startY: number; endX: number; endY: number } // original image px
interface MarkItem { itemNo: ItemNo; position: Position; label?: string }          // label = app-only, optional
type MarkDoc = MarkItem[]
```

## Rules (identical on both sides)

1. `itemNo` matches `^[1-9]\d*(\.[1-9]\d*){0,2}$` — hierarchical, **max depth 3**,
   no leading zeros (`0`, `01`, `1.0` are invalid).
2. `position` coordinates are numbers in the **original raster image's pixel
   space** (the `width`×`height` the image was numbered against).
3. `startX <= endX` and `startY <= endY`.
4. Coordinates are stored as **integers**, rounded **half-to-even** (banker's
   rounding) so both sides agree on exact `.5` values — python `int(round(v))`,
   JS `roundCoord` in `packages/specshot-core/src/model/mark-doc-validate.ts`.
5. Every `itemNo` is **unique** across the document.
6. **Input** may be a bare array **or** an object `{ "items": [...] }`.
   **Output** is always a bare array.
7. `label` is an app extension the skill ignores; it is omitted when empty.

## Example

```json
[
  { "itemNo": "1",    "position": { "startX": 0,   "startY": 0,  "endX": 1280, "endY": 56 } },
  { "itemNo": "1.1",  "position": { "startX": 20,  "startY": 12, "endX": 140,  "endY": 42 }, "label": "Logo" },
  { "itemNo": "6.10", "position": { "startX": 278, "startY": 793, "endX": 748, "endY": 840 } }
]
```

## Legend output

The app can export a markdown legend derived from a MarkDoc:

```
- 1. (chưa mô tả)
- 1.1. Logo
- 6.10. (chưa mô tả)
```

Rows are ordered by `itemNo` numerically (`6.10` after `6.9`); empty labels fall
back to `(chưa mô tả)`.

## Round-trip guarantee

`import → edit → export → re-import` yields a deep-equal document, verified by
the `serializeMarkDoc + round-trip` suite in
`packages/specshot-core/test/model/mark-doc.test.ts`. The real skill fixture
(`packages/specshot-core/test/fixtures/test-ui-item-bboxes.json`) is exercised by
`packages/specshot-core/test/model/numbering.test.ts`.
