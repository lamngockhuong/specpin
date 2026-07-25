# Soạn Spec-sheet (spec-first, thủ công)

> Bản tiếng Việt của `docs/spec-sheet-authoring.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

**Specshot** cho phép bạn soạn một spec **từ một screenshot hoặc design, trước khi UI tồn tại** -
hữu ích cho một PM/designer soạn tài liệu cho một luồng trước khi implement, hoặc bất kỳ ai chú
thích một ảnh tham chiếu. Nó được host **ngay trong browser extension** dưới dạng một page riêng
(`specshot.html`, dựng trên composition dùng chung `@specpin/specshot-app`), và chạy hoàn toàn
**offline**. Xem `docs/specshot-integration.md` để biết bản ghi thiết kế đằng sau tính năng này và
`docs/schema-reference.md` cho shape `Spec`/`ShotConfig` mà nó tạo ra.

## Mở trang

Cài/load extension Specpin, rồi mở menu **⋯ More actions** ở header và bấm **Open spec sheet**:

- từ **popup** trên toolbar, hoặc
- từ header của **side panel**.

Cả hai đều mở trang `specshot.html` trong một tab mới. Không cần chạy dev server riêng.

## 1. Tải một screenshot

Click **Open image** và chọn một file PNG/JPEG/WEBP/SVG. Với nguồn SVG, **Detect from SVG** có thể
tự gợi ý box từ các shape trong file (best-effort - hãy review và dọn lại kết quả).

## 2. Vẽ và đánh số box

Chuyển sang **Add box** (hoặc nhấn `A`) và kéo trên ảnh để vẽ một box; nó được đánh số tự động.
**Select** (tool còn lại) cho phép click một box có sẵn để sửa hoặc xóa (`Delete`/`Backspace`), và
`Esc` bỏ chọn. Chọn **Reindex mode** - `Hierarchical` (`1`, `1.1`, `1.2`, `2`, ...) hoặc `Flat` (`1`,
`2`, `3`, ...) - rồi click **Reindex** để đánh số lại toàn bộ box theo thứ tự đọc.

## 3. Soạn spec cho mỗi box

Chọn một box, rồi trong form spec chọn một trong hai:

- **New pending spec**: điền spec id, title, description, và tùy chọn business rules (mỗi dòng một
  rule). Lưu sẽ dựng và validate một **spec pending** - không có `fingerprint` - qua
  `buildPendingSpec()`. Một spec pending hợp lệ y hệt spec bình thường; nó chỉ chưa được liên kết
  tới một element đang sống (xem "Pending vs. pinned vs. orphaned" trong `docs/schema-reference.md`).
- **Existing spec**: chọn một `specId` đã biết từ một sidecar đang kết nối, để callout này mô tả
  một spec đã có sẵn (pending hoặc pinned) thay vì soạn spec mới. Đường này cần có kết nối sidecar
  (xem bên dưới) - danh sách rỗng khi offline.

## 4. Đặt tên screen

Nhập một **Screen id** (ví dụ `checkout`) và một tên hiển thị. Nếu có sidecar kết nối và id đó khớp
với một `Screen` đã có trong `screens.json`, picker hiện số spec đã liên kết của nó; nếu không, shot
vẫn export bình thường, chỉ chưa được nhóm vào một screen đã biết.

## 5. Export

- **Shot JSON**: dữ liệu shot thô (box đánh số + bbox), độc lập với `Spec`.
- **Spec sheet HTML** / **Spec sheet MD**: artifact chia sẻ được - ảnh kèm callout đánh số cùng
  spec đầy đủ (title/description/rules) cho mỗi số. Đưa cho reviewer hoặc để trong PR/doc; không cần
  sidecar để tạo hay đọc nó.

Toolbar còn cung cấp export **PNG** / **JSON** / **SVG** / **Legend** thuần cho ảnh đã chú thích
(từ các builder tổng quát của `specshot-core`), tách biệt với bộ export spec-sheet ở trên.

## Tùy chọn: kết nối một sidecar

Nhập **URL** của sidecar (mặc định `http://127.0.0.1:4848`) và **token** của nó, rồi **Connect**.
Khi đã kết nối:

- Spec pending đã lưu cũng được persist vào `.specs/` qua `saveSpec`.
- Shot artifact được persist vào `.specs/shots/<screenId>.shot.json` qua `putShot`.
- **Existing spec** trong form spec và datalist **Screen id** được nạp từ sidecar.

Không có gì ở trên bắt buộc kết nối này - authoring và export đều chạy được mà không cần sidecar.
Điều này giống mô hình token-auth của chính `specpin serve` (xem `docs/run-guide.md`); token chỉ
bao giờ được gửi tới URL bạn đã nhập. Vì trang này chạy ở một extension origin
(`chrome-extension://...`), CORS policy của sidecar chấp nhận nó; một trang web host riêng biệt sẽ
không bao giờ kết nối được (sidecar từ chối mọi web origin).

## Điều gì xảy ra tiếp theo (bind-later, chưa ship)

Một spec pending soạn ở đây hiện dạng chỉ-đọc trong mục **Unpinned** ở popup/side panel của extension
một khi UI mà nó mô tả đã ship và có sidecar phục vụ trang. Việc thực sự liên kết nó tới một DOM
element đang sống ("bind-later": chọn element, capture fingerprint, promote spec thành pinned) là
Phase 2 của `docs/specshot-integration.md` và **chưa được xây dựng** - hiện tại chưa có action nào
trong extension để thêm fingerprint cho một spec pending đã có sẵn.
