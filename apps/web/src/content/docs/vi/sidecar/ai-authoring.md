---
title: Soạn spec bằng AI agent
description: Để coding agent của bạn (Claude Code, Cursor, Codex) viết spec hợp lệ theo schema bằng skill @specpin/cli, rồi validate và phục vụ chúng.
---

Specpin không đi kèm LLM nào cả. `specpin generate` chỉ là stub, và CLI không bao giờ gọi model. Thay vào đó, chính **coding agent của bạn** (Claude Code, Cursor, Codex và các agent khác) sẽ soạn spec thông qua một skill di động đóng gói sẵn trong `@specpin/cli`. Agent đọc mã nguồn UI, viết các file `.specs/*.spec.json` hợp lệ theo schema, đăng ký chúng vào manifest, rồi chạy `specpin validate`. Sidecar Go chỉ làm nhiệm vụ phục vụ và validate.

Cách làm này đảo ngược mô hình quen thuộc "CLI có sẵn agent tích hợp": ở đây agent bạn đang dùng đóng vai trò tác giả, còn CLI là bộ validate và server chạy offline cho nó.

## Skill

Skill nằm sẵn trong package npm đã publish, nên agent của bạn có thể đọc mà không cần cài gì:

- `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`
- `https://unpkg.com/@specpin/cli@latest/skill/references/<file>.md`

`SKILL.md` là đủ để tự vận hành. Ba tài liệu tham chiếu tải theo nhu cầu sẽ đào sâu thêm:

- `schema-authoring.md` — cấu trúc spec v1 kèm một ví dụ hợp lệ đầy đủ.
- `fingerprint-strategy.md` — cây quyết định ưu tiên test-id để neo một spec vào element.
- `cli-commands.md` — mọi lệnh và exit code của chúng.

[Bản gốc canonical nằm trên GitHub](https://github.com/lamngockhuong/specpin/tree/main/apps/cli/skill).

## Trỏ agent tới skill

- **Claude Code (và các skill kiểu kit khác):** cài skill, hoặc lấy `SKILL.md` rồi đưa cho agent. Nó kích hoạt khi bạn yêu cầu soạn business spec cho các element UI hoặc chạy CLI `specpin`.
- **Agent bất kỳ khác:** dán URL `SKILL.md` trên unpkg (hoặc nội dung của nó) vào ngữ cảnh của agent và yêu cầu nó soạn spec cho màn hình của bạn.

Không có API key, xác thực hay cấu hình model nào phải làm ở đây: sidecar chỉ chạy trên localhost và tự in ra bearer token khi bạn chạy `serve`.

## Vòng lặp soạn spec

1. **Khởi tạo** (một lần): `specpin init --project "<Tên>" --domains <origin>`. Xem [Cài đặt và chạy CLI](/vi/sidecar/cli/).
2. **Soạn spec:** agent chọn một element mục tiêu và, theo mặc định, fingerprint nó từ các tín hiệu sẵn có — một `data-testid` / `data-spec-id` đang có, một `id` không do máy sinh, một `aria-label`, hoặc một selector duy nhất — mà không sửa mã nguồn ứng dụng của bạn. Nó viết một file `<khu-vực>.spec.json` với `title` / `description` theo khóa locale, `businessRules` tùy chọn, một `fingerprint`, và `meta.source: "ai-generated"`. Việc thêm `data-spec-id` để có anchor chính xác là tùy chọn opt-in, chỉ khi dự án của bạn muốn.
   - Các trường provenance tùy chọn agent có thể thêm (đều tương thích ngược): `links` (URL ticket / tài liệu / PR, chỉ `http`/`https`), `verifiedBy` (đường dẫn test tương đối theo repo — **mang tính khai báo**: `specpin validate` chỉ kiểm tra các file *có tồn tại*, không chạy chúng và cũng không ngụ ý chúng pass, nên chỉ liệt kê file có thật), và `status` (`draft` / `approved` / `deprecated`; bỏ trống nếu trung tính).
   - Agent **không** được tự soạn `meta.reviewedAt` / `meta.reviewedBy`: những trường này do con người đóng dấu qua thao tác Mark-reviewed của extension, và `reviewedBy` là một token không chứa PII được commit vào Git và các bản export (không bao giờ là email hay danh tính).
3. **Đăng ký:** thêm file mới vào `specFiles[]` trong `manifest.json`.
4. **Validate:** `specpin validate` (bắt buộc exit 0; sửa các dòng `FAIL` khi exit 1). Bất kỳ đường dẫn `verifiedBy` nào không tồn tại trong repo đều làm validate thất bại — đây là kiểm tra link hỏng, không phải chạy test.
5. **Xem trước:** `specpin serve`, sau đó extension render các spec trực tiếp trên trang.

Muốn tự soạn bằng tay? Xem [Chụp và chỉnh sửa spec](/vi/usage/capturing-and-editing/) để biết luồng thao tác ngay trong trình duyệt.

## Ví dụ thực tế

Bản demo đi kèm có sẵn một spec do AI soạn theo đúng skill này: [`examples/demo-react-app/.specs/nav.spec.json`](https://github.com/lamngockhuong/specpin/blob/main/examples/demo-react-app/.specs/nav.spec.json) neo một spec vào nút "Log out" trên thanh nav qua anchor `data-spec-id="nav-logout"`, và pass `specpin validate` (exit 0).

App demo áp dụng `data-spec-id` cho các element theo quy ước, nên ví dụ này minh họa đường **opt-in** dùng anchor chính xác: thêm attribute, sao lại nó vào `fingerprint.testId`, điền nốt các trường bắt buộc, đăng ký, validate. Những dự án không muốn động vào mã nguồn thì tổng hợp fingerprint từ markup sẵn có (xem chiến lược fingerprint trong skill).

## Lằn ranh an toàn

- Kết quả được đánh dấu `meta.source: "ai-generated"` và cần được con người review trước khi ship.
- Agent phải neo mọi business rule vào mã nguồn thật hoặc yêu cầu đã nêu — không bao giờ bịa ra.
- Cả hai validator đều từ chối chuỗi phẳng cho các trường đa ngôn ngữ và các khóa lạ (`additionalProperties: false`), nên một spec không hợp lệ sẽ thất bại ngay tại `specpin validate`. Xem [Định dạng spec](/vi/sidecar/spec-format/) để biết các trường bạn cần chạm tới.
