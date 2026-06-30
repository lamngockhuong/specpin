# Soạn spec bằng AI agent

> Bản tiếng Anh là nguồn chuẩn: [`../ai-authoring.md`](../ai-authoring.md). Nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các lệnh, đường dẫn và tên file giữ nguyên tiếng Anh.

Specpin không thêm LLM nào vào CLI. `specpin generate` chỉ là stub. Việc soạn spec bằng AI do **coding agent của bạn** (Claude Code, Cursor, Codex, v.v.) thực hiện thông qua một skill di động đóng gói trong `@specpin/cli`. Agent đọc mã nguồn UI, ghi các file `.specs/*.spec.json` hợp lệ schema, đăng ký vào manifest, rồi chạy `specpin validate`. CLI Go chỉ phục vụ và kiểm tra.

Điều này đảo ngược mô hình quen thuộc "CLI có sẵn agent": ở đây host agent là người soạn, còn CLI là trình kiểm tra offline và server.

## Skill

Nguồn chuẩn nằm trong repo tại [`apps/cli/skill/`](../../apps/cli/skill/) và được đóng gói trong package npm đã publish, nên có thể truy cập mà không cần cài đặt:

- `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`
- `https://unpkg.com/@specpin/cli@latest/skill/references/<file>.md`

`SKILL.md` tự đủ. Ba file reference đào sâu thêm: `schema-authoring.md` (cấu trúc v1 kèm một ví dụ hợp lệ đầy đủ), `fingerprint-strategy.md` (cây quyết định ưu tiên test-id) và `cli-commands.md` (mọi lệnh kèm mã thoát).

Một drift-gate (`node apps/cli/npm/scripts/sync-skill.mjs --check`, chạy trong CI) giữ bản copy đóng gói giống hệt nguồn chuẩn, giống cách schema nhúng của sidecar Go được đồng bộ.

## Trỏ agent của bạn tới skill

- **Claude Code / skill dạng kit**: cài skill hoặc lấy `SKILL.md` rồi đưa cho agent. Nó kích hoạt khi có yêu cầu soạn business spec cho element UI hoặc chạy CLI `specpin`.
- **Agent khác**: dán URL `SKILL.md` trên unpkg (hoặc nội dung của nó) vào ngữ cảnh của agent và yêu cầu nó soạn spec cho màn hình của bạn.

Không cần auth, key hay cấu hình model: sidecar chỉ chạy localhost và tự in bearer token khi `serve`.

## Vòng lặp soạn spec

1. **Scaffold** (một lần): `specpin init --project "<Name>" --domains <origin>`.
2. **Soạn**: agent chọn element mục tiêu và, mặc định, dựng fingerprint từ các signal element đã có sẵn (một `data-testid` / `data-spec-id` đang tồn tại, một `id` không phải dạng generated, một `aria-label`, hoặc một selector duy nhất) mà KHÔNG sửa source của ứng dụng. Nó ghi một file `<area>.spec.json` với `title` / `description` đánh key theo locale, `businessRules` tuỳ chọn, một `fingerprint`, và `meta.source: "ai-generated"`. Thêm `data-spec-id` để có anchor chính xác chỉ là opt-in tuỳ chọn, khi dự án muốn.
3. **Đăng ký**: thêm file mới vào `manifest.json` `specFiles[]`.
4. **Kiểm tra**: `specpin validate` (cần exit 0; sửa các dòng `FAIL` khi exit 1).
5. **Xem trước**: `specpin serve`, rồi extension render spec trực tiếp.

Xem trọn vòng lặp, gồm cả đường capture thủ công, trong [`run-guide.md`](./run-guide.md).

## Ví dụ thực tế

Demo đóng gói mang một spec do AI soạn bằng cách theo skill này: [`examples/demo-react-app/.specs/nav.spec.json`](../../examples/demo-react-app/.specs/nav.spec.json) gắn một spec lên nút "Log out" trên nav qua anchor `data-spec-id="nav-logout"`, và pass `specpin validate` (exit 0). Demo app dùng `data-spec-id` trên các element theo convention, nên ví dụ này minh hoạ đường anchor chính xác dạng **opt-in**: thêm attribute, phản chiếu vào `fingerprint.testId`, điền các field bắt buộc còn lại, đăng ký, kiểm tra. Dự án không muốn động vào source thì dựng fingerprint từ markup có sẵn thay vì vậy (xem fingerprint strategy trong skill).

## Lan can an toàn

- Output được đánh dấu `meta.source: "ai-generated"` và cần được con người review trước khi ship.
- Agent phải neo mọi business rule vào mã thật hoặc yêu cầu đã nêu, không bịa.
- Cả hai validator từ chối string phẳng cho field đa ngôn ngữ và các key lạ (`additionalProperties: false`), nên spec không hợp lệ sẽ fail ngay tại `specpin validate`.
