# MarkDoc JSON Schema (contract dùng chung)

> Bản tiếng Việt của `docs/mark-doc-schema.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Đây là contract duy nhất dùng chung giữa skill **`number-ui-image`** (bên producer)
và editor **specshot** (bên consumer/editor). Cả hai phía tự enforce các rule này một
cách độc lập và phải giữ tương thích byte-by-byte:

Cả hai "bản sinh đôi" giờ đều nằm trong repo này, nên có thể diff chúng với nhau:

- Bản enforce trong skill:
  `plugins/specpin/skills/number-ui-image/scripts/annotate-image-bboxes.py`
- Bản enforce trong specpin: `packages/specshot-core/src/model/mark-doc.ts`

## Shape

```ts
type ItemNo = string  // "1" | "1.1" | "6.10"
interface Position { startX: number; startY: number; endX: number; endY: number } // pixel trên ảnh gốc
interface MarkItem { itemNo: ItemNo; position: Position; label?: string }          // label = chỉ dùng trong app, optional
type MarkDoc = MarkItem[]
```

## Rule (giống hệt nhau ở cả hai phía)

1. `itemNo` khớp `^[1-9]\d*(\.[1-9]\d*){0,2}$` — phân cấp, **tối đa 3 tầng**,
   không có số 0 đứng đầu (`0`, `01`, `1.0` đều không hợp lệ).
2. Tọa độ `position` là số nằm trong **không gian pixel của ảnh raster gốc**
   (đúng `width`×`height` mà ảnh được đánh số theo).
3. `startX <= endX` và `startY <= endY`.
4. Tọa độ được lưu dưới dạng **số nguyên**, làm tròn **half-to-even** (banker's
   rounding) để hai phía thống nhất với các giá trị `.5` — python `int(round(v))`,
   JS `roundCoord` trong `packages/specshot-core/src/model/mark-doc-validate.ts`.
5. Mọi `itemNo` đều **duy nhất** trong toàn document.
6. **Input** có thể là một mảng trần **hoặc** một object `{ "items": [...] }`.
   **Output** luôn là một mảng trần.
7. `label` là phần mở rộng của app mà skill bỏ qua; nó được lược bỏ khi rỗng.

## Ví dụ

```json
[
  { "itemNo": "1",    "position": { "startX": 0,   "startY": 0,  "endX": 1280, "endY": 56 } },
  { "itemNo": "1.1",  "position": { "startX": 20,  "startY": 12, "endX": 140,  "endY": 42 }, "label": "Logo" },
  { "itemNo": "6.10", "position": { "startX": 278, "startY": 793, "endX": 748, "endY": 840 } }
]
```

## Legend output

App có thể export một legend markdown suy ra từ một MarkDoc:

```
- 1. (chưa mô tả)
- 1.1. Logo
- 6.10. (chưa mô tả)
```

Các dòng được sắp theo `itemNo` theo thứ tự số (`6.10` sau `6.9`); label rỗng thì
mặc định về `(chưa mô tả)`.

## Đảm bảo round-trip

`import → edit → export → re-import` cho ra một document deep-equal, được kiểm bởi
suite `serializeMarkDoc + round-trip` trong
`packages/specshot-core/test/model/mark-doc.test.ts`. Fixture thật từ skill
(`packages/specshot-core/test/fixtures/test-ui-item-bboxes.json`) được chạy qua
`packages/specshot-core/test/model/numbering.test.ts`.
