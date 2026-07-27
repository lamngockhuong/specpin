# Kế hoạch tích hợp specshot → specpin

> Bản tiếng Việt của `docs/specshot-integration.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

> **Trạng thái:** **Phase 1 ĐÃ SHIP** (2026-07-24, `main`) — manual authoring + shot artifact +
> pending (unpinned) spec đã hoạt động. Xem "Phase 1 — ghi chú triển khai" bên dưới để biết chính
> xác những gì đã ship; phần còn lại của tài liệu này là bản ghi thiết kế gốc (giữ lại để hiểu bối
> cảnh *vì sao*), với các câu hỏi mở đã được giải quyết ghi chú ngay tại chỗ. Phase 2-4 vẫn còn ở
> mức thiết kế.
> **Cập nhật (2026-07-24):** host đã đổi sang page `specshot.html` chạy ngay trong extension;
> `apps/spec-sheet` đã bị gỡ; composition nằm ở `@specpin/specshot-app`. Lý do: CORS policy của
> sidecar chấp nhận origin của extension nhưng từ chối origin web, nên một web app độc lập không bao
> giờ persist được vào `.specs/`. Phần còn lại của tài liệu này (gồm "Hướng đã chốt" và các ghi chú
> Phase 1 bên dưới) mô tả thiết kế `apps/spec-sheet` gốc và được giữ lại để làm bối cảnh lịch sử -
> đọc `docs/spec-sheet-authoring.md` và `docs/system-architecture.md` để biết shape hiện tại đã ship.
> **Ngày quyết định:** 2026-07-23 (chỉnh lại trong cùng ngày).
> Phân tích trade-off đầy đủ (VI): `plans/reports/brainstorm-260723-2021-marknumber-specpin-integration.md`
> (được cứu lại từ repo độc lập trước khi nó bị khai tử; `plans/` bị git ignore nên file này chỉ có
> ở local. Bản ghi quyết định: `docs/journals/260723-integration-decision-specshot-into-specpin.md`.)
> **Cập nhật (2026-07-25):** repo `mark-number`/specshot độc lập đã **khai tử** — specpin là nơi duy
> nhất còn maintain phần code này (`packages/specshot-core`, `packages/specshot-react`,
> `packages/specshot-app`). Các bản ghi riêng có của nó đã được cứu về đây; bản thân thư mục đó đang
> chờ xóa. Contract MarkDoc dùng chung nằm ở `docs/mark-doc-schema.md`.

## Mục tiêu

Gộp **specshot** (một editor chú thích screenshot độc lập) vào specpin để **tăng adoption**, biến
specpin thành một công cụ **spec-first lifecycle**: một spec có thể được soạn từ một
**screenshot/design trước khi UI tồn tại**, rồi **bind vào một element DOM thật trong extension** khi
frontend đã dựng xong. Việc này mở cửa cho non-dev/PM soạn spec ngay từ giai đoạn thiết kế. Sau khi
port xong, repo specshot độc lập bị **khai tử/xóa**.

## Hướng đã chốt (sealed 2026-07-23)

- **Path A**, dưới dạng **hai workspace package + một app mỏng** (không phải một app khối liền):
  - `packages/specshot-core` — TS headless, không phụ thuộc framework: model MarkDoc/tọa độ, numbering,
    viewport transform, interaction geometry, detect (svg-geometry/cluster/path-bbox), các export
    string builder. Phụ thuộc `@specpin/spec-schema`.
  - `packages/specshot-react` — các React component + hook của editor. `react`/`react-dom` là
    **peerDependencies**.
  - `apps/spec-sheet` — shell mỏng nhúng cả hai; là bề mặt manual authoring + export.
- **Nhịp đã chọn = "Nhịp 2": cam kết đổi core-model pending-spec ngay bây giờ** (KHÔNG chọn biến thể
  nhẹ hơn "artifact riêng, không đụng vào Spec"). Hệ quả chấp nhận: track thủ công là một **thay đổi
  lifecycle first-class của specpin**, nặng hơn một bản bolt-on. Đây là chủ ý.
- **Bind-later diễn ra trong extension** (mở FE đã dựng → picker → capture fingerprint → promote
  pending → pinned).
- **Toolchain giữ nguyên những gì monorepo đang dùng.** Mọi nâng cấp TS/Vitest là một **migration
  tách riêng, không dính líu** — không bao giờ gộp vào lần tích hợp này.

## Thay đổi core-model: pending (unpinned) spec

Hiện tại `Spec` **bắt buộc** có `fingerprint` (schema `v1.json`: `required: [id,title,description,fingerprint]`).
Nên một user chỉ có screenshot không thể tạo được một spec hợp lệ. Lưu ý phân biệt:
- **Orphaned spec (đã có hôm nay):** CÓ fingerprint đầy đủ, chỉ là không match được live lúc runtime.
- **Pending spec (mới):** **chưa có fingerprint** — được soạn trước khi UI tồn tại.

Hệ thống vốn đã chấp nhận "spec không match live" (nhóm orphaned trong `pageHealth`), nên mở rộng
thành "spec chưa được pin" là hợp lý, không hề xa lạ.

**Thay đổi:** làm cho `Spec.fingerprint` thành **optional**. Không có fingerprint ⇒ trạng thái
**pending/unpinned**. Lifecycle:

```
PM/design soạn spec dựa trên một screenshot  →  PENDING spec (không fingerprint)
        │  (FE dựng UI)
        ▼
extension: "Pin pending spec này vào element này" → capture fingerprint → PINNED spec
        │  (UI sau đó thay đổi)
        ▼
match fail lúc runtime → ORPHANED (có fingerprint, không match) → relink
```

### Phạm vi ảnh hưởng của thay đổi schema (SSOT, validate cả TS lẫn Go, có drift-gate)
- `spec-schema/schema/v1.json`: `fingerprint` optional. (Chi tiết thiết kế cho plan: suy ra "pending"
  từ việc thiếu fingerprint — KISS — thay vì một field `pinState` tường minh. Khuyến nghị: thiếu =
  pending; xác nhận lúc lập plan.)
- `fingerprint-core/match.ts`: thiếu fingerprint → bỏ qua matching, phân loại **unpinned** (không throw).
- `surface-data.ts pageHealth()`: thêm một nhóm **unpinned/pending** bên cạnh exact/scored/orphaned.
- **UI bind-later của extension**: một action "Pin pending spec → element này". Dùng lại
  `capture-mode`/`capture-form` sẵn có, nhưng là phần net-new: nó **re-fingerprint một spec đã tồn tại**
  chứ không tạo spec mới.
- Go validator + drift-gate `make check-schema` được cập nhật; `.d.ts` publish có thay đổi
  (additive-optional, ít khả năng gây vỡ).

## Geometry nằm ngoài Spec (bất biến anti-bloat vẫn giữ)

Ngay cả pending spec cũng **không chứa geometry** (một fingerprint không có pixel nào). Screenshot +
các pixel box sống trong một **artifact riêng** `.specs/shots/<screenId>.shot.json` (đường dẫn là
`shots/`, KHÔNG phải `screens/`, để tránh đụng với singleton `screens.json` sẵn có):

```
{ screenId, image (ref/embed), items: [ { itemNo, bbox, specId } ] }
```

- Map mỗi số trên ảnh → một `specId` (pending hoặc pinned).
- Dùng lại **`Screen` / `ScreensConfig`** sẵn có (`Screen.specIds`, `urlGlob`, `name` đã localize) để
  trả lời "tất cả spec của screen này" — KHÔNG tự chế một cách gom nhóm mới.
- **Ràng buộc anti-bloat (không đổi, không được vi phạm):**
  1. Editor/exporter là bề mặt riêng (`apps/spec-sheet` + tùy chọn export bằng CLI) — không bao giờ
     bundle vào extension MV3.
  2. Tọa độ pixel chỉ sống trong shot artifact — không bao giờ nằm trong `Spec`.
  3. Extension chỉ nhận thêm: picker bind-later, cộng thêm (về sau, track auto) một screen capture qua
     `activeTab`. Không có React editor trong bundle của extension.

## Phân kỳ (Phasing)

### Phase 1 — Manual authoring + spec sheet export (ship trước) — **ĐÃ SHIP 2026-07-24**
- [x] Tách specshot thành `packages/specshot-core` + `packages/specshot-react`; căn theo convention
      của specpin (Biome, turbo, ESM, `tsconfig.base.json`, TS/Vitest nào monorepo đang chạy — không
      gộp version bump vào).
- [x] Schema: `Spec.fingerprint` làm optional (trạng thái pending) — gen TS + Go + drift-gate xanh.
- [x] `apps/spec-sheet`: upload screenshot → vẽ/đánh số box → với mỗi box, soạn một **pending Spec**
      (title/description/rule đã localize) hoặc tham chiếu một `specId` sẵn có.
- [x] Shot artifact `.specs/shots/<screenId>.shot.json` (itemNo → bbox + specId). Gom nhóm qua `Screen`.
- [x] **spec-sheet exporter** dùng chung: ảnh + callout đánh số + spec đầy đủ theo từng số → HTML + MD.
- [x] **Dependency** của `fingerprint-core`/`api-client`/`cli`/bundle-extension không đổi (không thêm
      workspace dep mới); mỗi package vẫn được thêm code additive cho trạng thái mới (xem bên dưới).

#### Phase 1 — ghi chú triển khai (những gì thực sự đã ship)

- **Package**: `@specpin/specshot-core` (authoring headless: model MarkDoc, numbering, canvas geometry,
  detect, export builder, `buildShot`/`buildPendingSpec`) và `@specpin/specshot-react` (UI editor
  presentational; `react`/`react-dom` là peerDep). Xem `docs/codebase-summary.md`.
- **App**: `apps/spec-sheet` — app Vite + React mỏng, là bề mặt manual authoring + export. Chạy hoàn
  toàn offline; khi có sidecar kết nối, nó cũng persist pending spec (`saveSpec`) và shot (`putShot`)
  vào `.specs/`. Không bao giờ bundle vào extension. Hướng dẫn: `docs/spec-sheet-authoring.md`.
- **Schema**: `Spec.fingerprint` optional (thiếu ⇒ pending), cộng thêm một entity `ShotConfig`/`ShotItem`
  mới. Cả hai đều additive, tương thích ngược. Xem `docs/schema-reference.md`.
- **Sidecar**: `GET /shots`, `GET/PUT/DELETE /shots/{screenId}` dưới `.specs/shots/` (`screenId` được
  guard theo charset và symlink, giới hạn body 16 MiB cho screenshot nhúng, broadcast SSE trực tiếp khi
  ghi vì watcher `.specs/` không đệ quy). `api-client` được thêm các hàm có kiểu
  `listShots`/`getShot`/`putShot`/`deleteShot`.
- **Extension**: `@specpin/fingerprint-core` export `isPinned(spec)`; vòng lặp render và `matchElement`
  đều bỏ qua pending spec thay vì tính chúng là một match thất bại. `pageHealth()` được thêm nhóm
  `unpinned` riêng; popup và side panel liệt kê pending spec ở chế độ read-only trong một section
  **Unpinned** mới, không bao giờ hiển thị trên host page.

### Phase 2 — Bind-later trong extension
- [ ] Action của extension "Pin pending spec → element này": picker → `captureFingerprint` → ghi
      fingerprint vào pending spec đã tồn tại (promote thành pinned). Cập nhật nhóm/UI của pageHealth.
- [ ] (Tùy chọn) tự gợi ý bind theo `data-spec-id`/text khi FE ship anchor.

### Phase 3 — Track screenshot tự động (về sau)
- [ ] Extension `captureVisibleTab` + gom `getBoundingClientRect` của các spec đã match → bundle
      screen-capture → `apps/spec-sheet` tự đặt box. Cần permission `activeTab`; ưu tiên viewport hiển thị.

### Phase 4 — Khai tử specshot standalone
- [ ] Khi các package + app đã bao phủ manual authoring, bind-later và export với test xanh,
      **xóa project specshot độc lập**; đưa các ghi chú contract vào `spec-schema` + tài liệu này.

## Rủi ro / cần theo dõi
- **Thay đổi core-model là rủi ro nặng nhất** — `fingerprint` optional động vào match, pageHealth,
  extension, Go validator, published type. Land nó thành một thay đổi riêng có test kỹ; giữ nó
  additive-optional để các pinned spec sẵn có không bị đụng.
- Kỷ luật anti-bloat: reject mọi PR đưa editor vào bundle extension hoặc đưa pixel vào `Spec`.
- Toolchain giữ nguyên những gì monorepo đang chạy — đừng ghép nâng cấp TS/Vitest vào công việc này.
- Định vị sản phẩm: spec-first lifecycle là một mở rộng cho câu chuyện của specpin — truyền đạt sao cho
  người ta đọc ra là "spec sớm hơn trong lifecycle", chứ không phải scope creep.

## Chỉ số thành công
- Một non-dev soạn được một **pending spec** từ screenshot khi không có app/sidecar nào chạy, và export
  được một spec sheet HTML/MD cho screen đó.
- Một dev sau đó **bind** pending spec ấy vào một element thật trong extension; nó trở thành một pinned
  spec bình thường và match được live.
- Bundle size của extension không tăng đáng kể; dep của `core`/`cli`/`fingerprint-core` không đổi;
  các pinned spec sẵn có vẫn validate được (fingerprint-optional là tương thích ngược).

## Câu hỏi mở — đã giải quyết (Phase 1)
- Biểu diễn pending bằng **fingerprint vắng mặt** (KISS) hay bằng một field `pinState` tường minh? →
  **Đã chốt: fingerprint vắng mặt.** Triển khai đúng như vậy; không thêm field `pinState`.
- Shot artifact: **app-local trước** hay promote lên SSOT `spec-schema` ngay? →
  **Đã chốt: promote lên SSOT ngay**, dưới dạng `ShotConfig`/`ShotItem` trong
  `packages/spec-schema/schema/v1.json` (không phải app-local), validate cả TS lẫn Go, sidecar phục vụ
  dưới `.specs/shots/`.
- Lưu screenshot: embed hay reference? → **Đã chốt: `data:` URL là mặc định của v1** (nhúng trong field
  `ShotConfig.image`); một đường dẫn tương đối cũng hợp lệ theo schema nhưng không phải mặc định khi
  authoring.
- Pending spec có xuất hiện trên các bề mặt live của extension (dưới dạng danh sách "unpinned"), hay chỉ
  trong `apps/spec-sheet` cho tới khi được bind? → **Đã chốt: có** — một section **Unpinned** read-only
  trong popup và side panel (`pageHealth().unpinned`), tách biệt với **orphaned**. Không bao giờ render
  trên host page.

## Câu hỏi mở — vẫn còn mở (Phase 2+)
- Bind-later: chỉ picker thủ công, hay còn tự match theo `data-spec-id`/text khi có anchor? Chưa thiết kế
  chi tiết; Phase 2 chưa bắt đầu.
