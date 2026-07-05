# Tham chiếu Schema (v1)

> Bản tiếng Việt của `docs/schema-reference.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Schema chuẩn (canonical) là `packages/spec-schema/schema/v1.json` (JSON Schema draft 2020-12, `$id: https://specpin.ohnice.app/schema/v1.json`). Nó là single source of truth: TS types được sinh ra từ nó, và Go sidecar nhúng cùng file đó. Không chỉnh sửa tay các file được sinh ra (generated artifacts).

## Files in a consumer repo

```
.specs/
├── manifest.json          # index + project config
├── views.json             # cài đặt hiển thị mặc định theo nhóm (tùy chọn, commit vào Git)
├── guides.json            # các tour onboarding có tên (tùy chọn, commit vào Git)
└── <area>.spec.json       # a group of specs (SpecFile)
```

## Manifest

| Trường | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|-------|
| `version` | string | yes | nhãn đánh dấu schema/version, ví dụ `"1.0"` |
| `project` | string | yes | tên hiển thị |
| `domains` | string[] | yes | các origin nơi UI chạy, ví dụ `["localhost:3000"]`; rỗng = bất kỳ |
| `specFiles` | string[] | yes | tên của các file `<area>.spec.json` |
| `settings.defaultLocale` | string | no | fallback locale khi lựa chọn của người xem không có trên một spec |
| `settings.locales` | string[] | no | BCP-47 locales mà project này soạn spec trong đó; language picker của extension cung cấp hợp (union) của các project được kết nối |
| `settings.matchConfidenceThreshold` | number 0-1 | no | dành riêng cho hybrid scorer đang được hoãn lại |
| `settings.stalenessThresholdDays` | number 1-3650 | no | số ngày sau `meta.reviewedAt` của một spec trước khi nó render là **stale** (cũ); mặc định lúc chạy là **90** khi không có. Giá trị bị giới hạn khoảng nên không thể âm thầm tắt tín hiệu độ mới (freshness). Được phân giải theo từng project, nên một trang nhiều project dùng cài đặt của chính project chứa mỗi spec; project local/manual (không có manifest) luôn dùng 90. |
| `settings.defaultDisplayMode` | DisplayMode | no | render mode dự phòng (fallback) |

## SpecFile (`<area>.spec.json`)

| Trường | Kiểu | Bắt buộc |
|-------|------|----------|
| `group` | string | yes |
| `specs` | Spec[] | yes |

## Spec

| Trường | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|-------|
| `id` | string | yes | duy nhất trong phạm vi project |
| `title` | LocalizedString | yes | object đánh key theo locale (xem phía dưới) |
| `description` | LocalizedString | yes | object đánh key theo locale; mỗi giá trị không rỗng |
| `businessRules` | LocalizedString[] | no | mỗi rule là một object đánh key theo locale |
| `tags` | string[] | no | không localize |
| `links` | Link[] | no | tham chiếu do tác giả khai báo (ticket, doc, PR); ≤10; xem Link phía dưới |
| `verifiedBy` | string[] | no | đường dẫn tương đối theo repo của các test **khai báo** spec này; ≤20, mỗi đường dẫn ≤200 ký tự. Chỉ mang tính khai báo, xem lưu ý về trust phía dưới |
| `status` | SpecStatus | no | `"draft" \| "approved" \| "deprecated"`; **không khai báo = trung tính (neutral)** (không có default, nên các spec cũ không bị gắn lại nhãn) |
| `preferredDisplayMode` | DisplayMode | no | ghi đè `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | liên kết tới element |
| `meta` | SpecMeta | no | nguồn gốc (provenance) + timestamp |

### Link

| Trường | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|-------|
| `label` | string | yes | 1-80 ký tự |
| `url` | string | yes | chỉ `http`/`https` (`^https?://` + `format: uri`) |

Ràng buộc schema trên `url` là **phòng thủ theo chiều sâu ở ranh giới lưu trữ**, không phải bộ sanitizer có thẩm quyền: một URL hợp lệ về scheme vẫn có thể mang payload, nên bộ sanitize href lúc render (từ chối `javascript:`/`data:`/scheme-relative và HTML-escape giá trị) mới là thứ làm cho liên kết an toàn. Lưu ý rằng cách hai validator hiện thực `format: uri` khác nhau ở một số trường hợp biên; việc từ chối scheme được đảm bảo bởi **pattern** `^https?://` (giống nhau ở cả hai), còn độ an toàn khi render được đảm bảo tại thời điểm hiển thị.

### Provenance / mô hình tin cậy (trust model)

Provenance là **do tác giả khẳng định (author-asserted)**. Ranh giới toàn vẹn (integrity boundary) là **việc con người review diff JSON của `.specs/` trong một Git PR**, không phải bất kỳ tín hiệu lúc chạy nào: luồng ghi (write path) của extension không có đặc quyền (unprivileged) (một trang có thể gửi một chỉnh sửa, theo thiết kế, để capture ngay trên trang), nên `status` / `reviewedBy` / `links` không đáng tin hơn tiêu đề của một spec. UI không bao giờ trình bày `status: "approved"` hay `reviewedBy` như thể đã được xác minh bằng mật mã.

`verifiedBy` là một liên kết test **được khai báo**: `specpin validate` kiểm tra mỗi đường dẫn được tham chiếu **có tồn tại** trong repo hay không (tín hiệu "liên kết không bị hỏng"); nó **không** chạy các test và không biết pass/fail. Câu chữ trong UI luôn là "linked tests", không bao giờ là "verified"/"passed".

## LocalizedString

Nội dung business của spec (`title`, `description`, mỗi item trong `businessRules`) là một **object đánh key theo locale**, không phải string phẳng:

```json
{ "en": "Log in button", "vi": "Nút đăng nhập" }
```

- Các key là mã locale BCP-47 (`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$`), ví dụ `en`, `vi`, `en-US`.
- Ít nhất một entry được yêu cầu (`minProperties: 1`); mỗi giá trị là string không rỗng (`minLength: 1`); tối đa 50 entry.
- **String phẳng bị từ chối** bởi cả hai validator (nghĩa là `"title": "Log in"` không hợp lệ).
- Thứ tự fallback khi render cho một locale: locale được yêu cầu, rồi `defaultLocale` của manifest, rồi giá trị đầu tiên có mặt. Một danh sách `businessRules` được dịch một phần sẽ bỏ các item không có giá trị cho locale đã giải quyết (không bao giờ render một rule trống).

Giá trị `description` không rỗng (`minLength: 1`), nên một description trống bây giờ không hợp lệ (trước khi có bản địa hóa, chuỗi rỗng vẫn được cho phép).

## Định dạng (tập con Markdown)

`description` và mỗi item `businessRules` có thể mang một **tập con Markdown** nhỏ. Đây thuần túy là quy ước hiển thị: giá trị lưu trữ vẫn là string thường (không đổi schema), nên `.specs/*.json` vẫn diff được trên Git và cả hai validator không bị ảnh hưởng.

Cú pháp được hỗ trợ:

- **Đậm** `**text**`, *nghiêng* `*text*` hoặc `_text_`.
- Liên kết `[label](url)`. Chỉ URL `http`, `https`, và `mailto` hiển thị thành liên kết; các scheme khác (`javascript:`, `data:`) bị hạ xuống văn bản thường. URL tương đối (`/path`) được phân giải theo origin của trang chứa spec, và liên kết tới **cùng origin** đó mở trong **tab hiện tại** (không có `target`); mọi liên kết khác, gồm cả subdomain khác hay bất kỳ URL khác origin nào, mở trong **tab mới** (`rel="noopener noreferrer" target="_blank"`). Khi không biết origin của trang (caller cũ), URL tương đối bị bỏ và mọi liên kết mở trong tab mới.
- `description` còn hỗ trợ cấu trúc khối: danh sách dấu đầu dòng (tiền tố dòng `- ` hoặc `* `), danh sách đánh số (tiền tố dòng `1. `), các đoạn cách nhau bởi dòng trống, và xuống dòng đơn thành ngắt dòng.
- Mỗi item `businessRules` chỉ **inline** (đậm/nghiêng/liên kết); một rule là một dòng hiển thị thành một mục danh sách, nên danh sách khối bên trong một rule không áp dụng.

Không hỗ trợ (hiển thị nguyên văn): heading, blockquote, code block/span, bảng, hình ảnh, gạch chân. Markdown trong `title` không được diễn giải (nó tạo id slug và một tiêu đề).

Bộ render không phụ thuộc thư viện và an toàn CSP: nó escape mọi đoạn văn bản người dùng và chỉ phát ra một tập thẻ trong danh sách cho phép (`strong`, `em`, `a`, `ul`, `ol`, `li`, `p`, `br`), nên HTML thô và các vector injection trong nội dung spec vẫn vô hại.

**Lưu ý tương thích ngược:** văn bản thường cũ tình cờ chứa cặp `*`/`_` hoặc `[text](url)` bây giờ được diễn giải là Markdown (ví dụ `a_b_c` có thể render `b` in nghiêng, dù quy tắc ranh giới từ cho `_` tránh được phần lớn trường hợp snake_case). Không có migration; URL trần không tự động thành liên kết.

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional: `testId`, `ariaLabel`, `id` (đều nullable), `textContent` (nullable), `nearbyLabels`, `frameworkHint`, `pageUrl` (nullable).

`positionHint` = `{ index: int >= 0, siblingCount: int >= 0 }`.

`pageUrl` là một path glob giới hạn spec vào một page/route (`*` khớp một segment đường dẫn, `**` khớp qua nhiều segment; query và hash được bỏ qua). Nó được tự động điền bằng path lúc capture và có thể chỉnh trong capture form. Khi không có/null thì khớp trên mọi trang (tương thích ngược). Điều này ngăn một spec được pin ở màn hình này render sang màn hình khác có layout tạo ra `cssSelector`/`xpath` trùng nhau.

## SpecMeta

`createdBy` (string), `createdAt` + `updatedAt` (date-time), `source` (`"ai-generated" | "manual"`). Định dạng date-time được assert bởi cả hai validator.

Các trường review tùy chọn (được đóng dấu bởi hành động **Mark reviewed** của extension, đều tương thích ngược):

| Trường | Kiểu | Ghi chú |
|-------|------|-------|
| `reviewedAt` | date-time | thời điểm nội dung spec được con người review lần cuối; khi không có = chưa từng review. Điều khiển tín hiệu stale so với `settings.stalenessThresholdDays`. |
| `reviewedBy` | string | **token** người review do tác giả khai báo. Mặc định là cùng token không-PII mà `createdBy` dùng (ví dụ `manual`/`agent`), có thể chỉnh trong form. **Được commit vào `.specs/` (Git) và có trong các export bundle, đừng đặt PII/email vào đây.** |

## DisplayMode

`"overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge"`. `tooltip`, `sidebar`, và `modal` đã được hiện thực; `overlay` và `inline-badge` được dành riêng (forward-compatible) và fall back về `tooltip` lúc render.

## ViewsConfig (`.specs/views.json`)

Cài đặt hiển thị mặc định theo nhóm (team-level), không bắt buộc. Khi có, nó làm baseline cho việc những spec nào bị ẩn trước khi áp dụng override cá nhân (xem visibility cascade trong `docs/system-architecture.md`).

| Trường | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|-------|
| `version` | string | yes | ví dụ `"1.0"` |
| `hidden` | string[] | yes | danh sách phẳng các facet key (có thể là mảng rỗng) |

Facet key là các string dạng `tag:<name>`, `file:<filename>`, `spec:<id>`, hoặc `url:<glob>`. Một spec khớp với facet nếu nó có tag đó, nằm trong file đó, có id đó, hoặc xuất hiện trên trang có path khớp glob (`*` = một segment, `**` = qua nhiều segment). Facet `url:` là cổng chặn ở cấp trang (được ưu tiên hơn mọi facet khác).

Khi `.specs/views.json` không có, sidecar trả về default rỗng `{ "version": "1.0", "hidden": [] }` trên `GET /views`. Tất cả spec đều hiển thị trừ khi user đặt override cá nhân. Team default được chỉnh sửa qua trang Options của extension (per connection) và ghi vào `.specs/views.json` qua `PUT /views` (schema-validated, atomic, pretty-printed). Sidecar theo dõi (watch) `.specs/` nên mọi thay đổi đều kích hoạt SSE (cơ chế watch bao gồm cả `views.json`).

## GuidesConfig (`.specs/guides.json`)

Các tour onboarding có tên (tùy chọn): lối đi tuần tự qua các spec đã gắn trên trang. Mỗi guide làm nổi bật phần tử của từng bước và hiển thị nội dung đã bản địa hóa. File này giữ các guide **của nhóm** (commit vào Git); extension còn giữ guide **cá nhân** riêng tư trong `storage.sync` (không bao giờ ghi vào đây).

| Trường | Kiểu | Bắt buộc | Ghi chú |
|--------|------|----------|---------|
| `version` | string | có | ví dụ `"1.0"` |
| `guides` | GuideDef[] | có | có thể rỗng; tối đa 50 (`maxItems`) |

## RequiredConfig (`.specs/required.json`)

Cổng governance tùy chọn: danh sách spec id bắt buộc phải tồn tại trong dự án. Dùng bởi `specpin report --fail-on missing-required` để chặn CI khi một spec bắt buộc bị xóa hoặc đổi tên.

| Trường | Kiểu | Bắt buộc | Ghi chú |
|--------|------|----------|---------|
| `version` | string | có | ví dụ `"1.0"` |
| `required` | string[] | có | spec id phải tồn tại (có thể rỗng; mỗi phần tử `maxLength` 200) |

```json
{
  "version": "1.0",
  "required": ["login-submit-btn", "dashboard-stat-revenue"]
}
```

`GuideDef`:

| Trường | Kiểu | Bắt buộc | Ghi chú |
|--------|------|----------|---------|
| `id` | string | có | duy nhất trong file; pattern `^[a-z0-9-]+$`, `maxLength` 100 |
| `name` | string | có | nhãn UI dạng plain (KHÔNG phải LocalizedString), không rỗng, `maxLength` 200 |
| `description` | string | không | mô tả plain, `maxLength` 2000 |
| `steps` | string[] | có | danh sách spec id theo thứ tự; có thể rỗng, `maxItems` 200, mỗi phần tử `maxLength` 200 |

```json
{
  "version": "1.0",
  "guides": [
    { "id": "onboarding", "name": "Onboarding tour", "description": "First-run walkthrough", "steps": ["login-submit-btn", "nav-dashboard"] }
  ]
}
```

`name` là chuỗi plain (không bản địa hóa) theo thiết kế: nó là nhãn ngắn, còn **nội dung** từng bước bản địa hóa qua spec được tham chiếu. Guide có `steps` **rỗng** khi khởi chạy sẽ chạy qua mọi spec khớp trên trang theo thứ tự mặc định (theo tên file nguồn, rồi thứ tự trong file, dự án cục bộ xếp cuối), nên một guide dùng được mà không cần tùy biến. Các step id không còn phân giải được (spec bị đổi tên/xóa, hoặc không có trên trang hiện tại) bị bỏ khi khởi chạy và được đánh dấu trong trình chỉnh sửa.

Khi `.specs/guides.json` không có, sidecar trả về default rỗng `{ "version": "1.0", "guides": [] }` trên `GET /guides`. Guide được tạo trong extension (trình chỉnh sửa ở popup / thanh bên) và ghi qua `PUT /guides` (schema-validated, atomic, pretty-printed), hoặc lưu vào dự án cục bộ / lưu trữ cá nhân. Các giới hạn ở trên nằm trong SSOT nên cả hai validator đều kế thừa; guide cá nhân còn tôn trọng quota per-item của `storage.sync` (ghi bị từ chối sẽ báo lỗi thay vì âm thầm bỏ).

## Validation

- TS: `import { validateSpec, validateManifest, validateSpecFile, validateViews, validateGuides, validateRequired } from "@specpin/spec-schema"`.
- Go: `schema.NewValidator()` rồi `ValidateSpec` / `ValidateManifest` / `ValidateSpecFile` / `ValidateViews` / `ValidateGuides` / `ValidateRequired`.
- Fixture corpus dùng chung (`tests/fixtures/specs/{valid,invalid}`, `tests/fixtures/views/{valid,invalid}`, `tests/fixtures/guides/{valid,invalid}`, `tests/fixtures/required/{valid,invalid}`) được chạy qua cả hai trong CI; các object có unknown property bị từ chối (`additionalProperties: false`).

## Dùng schema (consuming)

Ba cách lấy schema, theo mức độ tiện dần:

- **Autocomplete trong editor qua `$schema` (không cần cài).** `specpin init` ghi
  sẵn `"$schema": "https://specpin.ohnice.app/schema/v1.json"` vào file spec. Editor
  nào tôn trọng `$schema` (VS Code, JetBrains) sẽ validate + gợi ý khi soạn. URL do
  trang docs (`apps/web`) phục vụ.
- **SchemaStore.org (không cần `$schema`).** Sau khi entry catalog được merge ở
  upstream, editor tự gắn schema cho `**/.specs/*.spec.json`, nên dòng `$schema` trở
  thành tùy chọn.
- **Gói npm** cho dùng lập trình: `pnpm add @specpin/spec-schema` cung cấp type sinh
  ra + ajv validator (xem Validation ở trên). Schema thô cũng lấy được qua CDN mà
  không cần URL hosted: `https://unpkg.com/@specpin/spec-schema/schema/v1.json` hoặc
  `https://cdn.jsdelivr.net/npm/@specpin/spec-schema/schema/v1.json`.

Versioning: `/schema/v1.json` ổn định cho schema v1. Breaking change sau này sẽ thêm
`/schema/v2.json` và giữ v1 sống cho các repo cũ.
