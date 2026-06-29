---
title: Định dạng spec
description: Hướng dẫn đơn giản, hướng tác vụ về spec JSON để soạn và review spec.
---

Trang này giải thích các trường bạn chạm tới khi soạn hoặc review một spec. Để xem tham chiếu schema đầy đủ dành cho người đóng góp, xem [tham chiếu schema đầy đủ trên GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md).

## Một file spec

Mỗi file `*.spec.json` trong `.specs/` là một **SpecFile**: một nhóm spec có tên.

```json
{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Login",
  "specs": [
    {
      "id": "login-email",
      "title": { "en": "Email field", "vi": "Trường email" },
      "description": {
        "en": "User enters their email address here.",
        "vi": "Người dùng nhập địa chỉ email của họ vào đây."
      },
      "businessRules": [
        { "en": "Required; cannot be empty", "vi": "Bắt buộc; không được để trống" },
        { "en": "Must be a valid email format", "vi": "Phải đúng định dạng email" }
      ],
      "tags": ["login", "critical"],
      "preferredDisplayMode": "tooltip",
      "fingerprint": {
        "testId": "login-email",
        "ariaLabel": null,
        "id": null,
        "cssSelector": "[data-spec-id='login-email']",
        "xpath": "//input[@data-spec-id='login-email']",
        "domPath": ["form", "label", "input"],
        "tagName": "input",
        "textContent": null,
        "attributes": { "type": "email" },
        "nearbyLabels": ["Email"],
        "positionHint": { "index": 0, "siblingCount": 1 },
        "frameworkHint": "react"
      },
      "meta": {
        "createdBy": "you@example.com",
        "createdAt": "2026-06-28T10:00:00Z",
        "updatedAt": "2026-06-28T10:00:00Z",
        "source": "manual"
      }
    }
  ]
}
```

## Các trường bạn sửa

### `id` (bắt buộc)

Một định danh duy nhất cho spec này trong dự án của bạn. Sử dụng kebab-case (ví dụ `"login-email"`, `"deal-submit"`). Khi đã đặt, đừng thay đổi nó (extension sử dụng cái này để theo dõi các chỉnh sửa và override hiển thị cá nhân).

### `title` (bắt buộc, được localize)

Tiêu đề của spec. Đây là một **object đánh key theo locale**, không phải string phẳng:

```json
{ "en": "Email field", "vi": "Trường email" }
```

Ít nhất một locale là bắt buộc. Key là mã locale BCP-47 (`en`, `vi`, `en-US`, v.v.). String phẳng như `"title": "Email field"` không hợp lệ và bị từ chối bởi validator.

### `description` (bắt buộc, được localize)

Văn bản nội dung của spec. Cùng dạng object được localize như `title`. Mỗi giá trị phải không rỗng.

Hỗ trợ tập con Markdown (đậm, nghiêng, liên kết, danh sách). Xem [Định dạng Markdown](#định-dạng-markdown) bên dưới.

### `businessRules` (tùy chọn, mảng được localize)

Một mảng các chuỗi rule được localize. Mỗi rule là một object đánh key theo locale riêng biệt:

```json
[
  { "en": "Required; cannot be empty", "vi": "Bắt buộc; không được để trống" },
  { "en": "Must be a valid email format", "vi": "Phải đúng định dạng email" }
]
```

Mỗi rule được hiển thị dưới dạng một mục danh sách trong spec đã render. Hỗ trợ tập con Markdown (chỉ đậm, nghiêng, liên kết, không có cấu trúc khối bên trong một rule).

### `tags` (tùy chọn)

Một mảng string (không được localize). Tag được sử dụng để lọc và nhóm trong extension:

```json
["login", "critical"]
```

### `preferredDisplayMode` (tùy chọn)

Cách spec này nên render theo mặc định. Một trong: `"tooltip"`, `"sidebar"`, `"modal"`. Nếu bỏ qua, `settings.defaultDisplayMode` của dự án được sử dụng (và nếu cái đó cũng bị bỏ qua, `"tooltip"` là fallback cuối cùng).

:::note
`"overlay"` và `"inline-badge"` là các mode dành riêng (forward-compatible). Nếu bạn đặt chúng, chúng sẽ fall back về `"tooltip"` lúc render.
:::

## Định dạng Markdown

`description` và mỗi item `businessRules` hỗ trợ một tập con Markdown nhỏ, an toàn:

- **Đậm** `**text**`, *nghiêng* `*text*` hoặc `_text_`
- Liên kết `[label](url)` (chỉ `http`, `https`, `mailto` render thành liên kết; các scheme khác bị hạ xuống văn bản thường)
- Chỉ trong `description`: danh sách dấu đầu dòng (`- ` hoặc `* `), danh sách đánh số (`1. `), các đoạn cách nhau bởi dòng trống, và xuống dòng thành ngắt dòng

Mỗi item `businessRules` chỉ inline (không có danh sách khối bên trong một rule, vì một rule là một dòng được render thành một mục danh sách).

Bộ render escape tất cả văn bản người dùng và chỉ phát ra một tập thẻ trong danh sách cho phép (`strong`, `em`, `a`, `ul`, `ol`, `li`, `p`, `br`), nên HTML thô vẫn vô hại.

Ví dụ:

```json
{
  "description": {
    "en": "User enters their **primary email**. This field:\n\n- Must be unique\n- Cannot be changed after signup\n\nSee [Privacy Policy](https://example.com/privacy) for details."
  }
}
```

Render thành văn bản có định dạng với đậm, một danh sách dấu đầu dòng, và một liên kết có thể click.

## Cách một spec liên kết tới element

Trường `fingerprint` giữ nhiều tín hiệu xác định element trên trang:

- `testId`, `ariaLabel`, `id` (anchor chính xác, độ tin cậy cao nhất khi có mặt)
- `cssSelector`, `xpath`, `domPath` (selector dự phòng)
- `textContent`, `nearbyLabels` (gợi ý dựa trên text)
- `positionHint` (sibling index + count)
- `frameworkHint` (ví dụ `"react"`)

Extension thử các anchor chính xác trước (độ tin cậy 1.0), sau đó CSS selector duy nhất (độ tin cậy 0.7). Nếu không khớp cái nào, spec được đánh dấu `needsReview`.

:::tip
Để làm cho matching trở nên chính xác một cách tầm thường, thêm thuộc tính `data-spec-id` vào element của bạn trong code:

```html
<input data-spec-id="login-email" type="email" />
```

`testId` của fingerprint sẽ capture cái này, và matching trở thành tra cứu thuộc tính đơn giản (không dễ vỡ).
:::

Bạn hiếm khi cần sửa fingerprint bằng tay. Luồng capture của extension tự động điền nó. Nếu bạn có sửa nó, chạy `specpin validate` để đảm bảo nó vẫn hợp lệ.

## Khối `meta`

`meta` giữ nguồn gốc và timestamp:

- `createdBy` (string, ví dụ email hoặc username của bạn)
- `createdAt`, `updatedAt` (ISO 8601 date-time)
- `source` (`"manual"` hoặc `"ai-generated"`)

Extension đặt các giá trị này khi bạn capture hoặc sửa một spec. Bạn hiếm khi chạm tới chúng bằng tay.

## Validate các thay đổi của bạn

Sau khi sửa một spec, validate nó:

```bash
specpin validate --dir .specs
```

Lệnh này kiểm tra mọi `.spec.json` với schema và cảnh báo nếu `manifest.specFiles` không đồng bộ với các file trên đĩa.

Để lint spec trong CI, xem [hướng dẫn CLI](/vi/sidecar/cli/#validate-spec-ngoại-tuyến).

## Tham chiếu schema đầy đủ

Trang này bao gồm các trường bạn cần để soạn và review spec. Để xem schema đầy đủ (tất cả trường, quy tắc validate nội bộ, chi tiết validator TypeScript/Go, và các chủ đề nâng cao như `ViewsConfig` và thuật toán khớp fingerprint), xem:

**[docs/schema-reference.md trên GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md)**
