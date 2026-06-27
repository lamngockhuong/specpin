# Tham chiếu Schema (v1)

> Bản tiếng Việt của `docs/schema-reference.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Schema chuẩn (canonical) là `packages/spec-schema/schema/v1.json` (JSON Schema draft 2020-12, `$id: https://specpin.ohnice.app/schema/v1.json`). Nó là single source of truth: TS types được sinh ra từ nó, và Go sidecar nhúng cùng file đó. Không hand-edit các generated artifact.

## Files in a consumer repo

```
.specs/
├── manifest.json          # index + project config
├── views.json             # cài đặt hiển thị mặc định theo nhóm (tùy chọn, commit vào Git)
└── <area>.spec.json       # a group of specs (SpecFile)
```

## Manifest

| Field | Type | Required | Ghi chú |
|-------|------|----------|-------|
| `version` | string | yes | marker đánh dấu schema/version, ví dụ `"1.0"` |
| `project` | string | yes | tên hiển thị |
| `domains` | string[] | yes | các origin nơi UI chạy, ví dụ `["localhost:3000"]`; rỗng = bất kỳ |
| `specFiles` | string[] | yes | tên của các file `<area>.spec.json` |
| `settings.defaultLocale` | string | no | fallback locale khi lựa chọn của người xem không có trên một spec |
| `settings.locales` | string[] | no | BCP-47 locales mà project này soạn spec trong đó; language picker của extension cung cấp hợp (union) của các project được kết nối |
| `settings.matchConfidenceThreshold` | number 0-1 | no | dành riêng cho hybrid scorer đang được hoãn lại |
| `settings.defaultDisplayMode` | DisplayMode | no | render mode dự phòng (fallback) |

## SpecFile (`<area>.spec.json`)

| Field | Type | Required |
|-------|------|----------|
| `group` | string | yes |
| `specs` | Spec[] | yes |

## Spec

| Field | Type | Required | Ghi chú |
|-------|------|----------|-------|
| `id` | string | yes | duy nhất trong phạm vi project |
| `title` | LocalizedString | yes | object đánh key theo locale (xem phía dưới) |
| `description` | LocalizedString | yes | object đánh key theo locale; mỗi giá trị không rỗng |
| `businessRules` | LocalizedString[] | no | mỗi rule là một object đánh key theo locale |
| `tags` | string[] | no | không localize |
| `preferredDisplayMode` | DisplayMode | no | ghi đè `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | liên kết tới element |
| `meta` | SpecMeta | no | nguồn gốc (provenance) + timestamp |

## LocalizedString

Nội dung business của spec (`title`, `description`, mỗi item trong `businessRules`) là một **object đánh key theo locale**, không phải string phẳng:

```json
{ "en": "Log in button", "vi": "Nút đăng nhập" }
```

- Các key là mã locale BCP-47 (`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$`), ví dụ `en`, `vi`, `en-US`.
- Ít nhất một entry được yêu cầu (`minProperties: 1`); mỗi giá trị là string không rỗng (`minLength: 1`); tối đa 50 entry.
- **String phẳng bị từ chối** bởi cả hai validator (nghĩa là `"title": "Log in"` không hợp lệ).
- Thứ tự fallback khi render cho một locale: locale được yêu cầu, rồi `defaultLocale` của manifest, rồi giá trị đầu tiên có mặt. Một danh sách `businessRules` được dịch một phần sẽ bỏ các item không có giá trị cho locale đã giải quyết (không bao giờ render một rule trống).

Giá trị `description` không rỗng (`minLength: 1`), nên một description trống bây giờ không hợp lệ (trước đây là empty string được phép trước khi localize).

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional: `testId`, `ariaLabel`, `id` (đều nullable), `textContent` (nullable), `nearbyLabels`, `frameworkHint`.

`positionHint` = `{ index: int >= 0, siblingCount: int >= 0 }`.

## SpecMeta

`createdBy` (string), `createdAt` + `updatedAt` (date-time), `source` (`"ai-generated" | "manual"`). Định dạng date-time được assert bởi cả hai validator.

## DisplayMode

`"overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge"`. `tooltip`, `sidebar`, và `modal` đã được hiện thực; `overlay` và `inline-badge` được dành riêng (forward-compatible) và fall back về `tooltip` lúc render.

## ViewsConfig (`.specs/views.json`)

Cài đặt hiển thị mặc định theo nhóm (team-level), không bắt buộc. Khi có, nó làm baseline cho việc những spec nào bị ẩn trước khi áp dụng override cá nhân (xem visibility cascade trong `docs/system-architecture.md`).

| Field | Type | Required | Ghi chú |
|-------|------|----------|-------|
| `version` | string | yes | ví dụ `"1.0"` |
| `hidden` | string[] | yes | danh sách phẳng các facet key (có thể là mảng rỗng) |

Facet key là các string dạng `tag:<name>`, `file:<filename>`, `spec:<id>`, hoặc `url:<glob>`. Một spec khớp với facet nếu nó có tag đó, nằm trong file đó, có id đó, hoặc xuất hiện trên trang có path khớp glob (`*` = một segment, `**` = qua nhiều segment). Facet `url:` là cổng chặn ở cấp trang (wins over everything).

Khi `.specs/views.json` không có, sidecar trả về default rỗng `{ "version": "1.0", "hidden": [] }` trên `GET /views`. Tất cả spec đều hiển thị trừ khi user đặt override cá nhân. Team default được chỉnh sửa qua trang Options của extension (per connection) và ghi vào `.specs/views.json` qua `PUT /views` (schema-validated, atomic, pretty-printed). Sidecar watch `.specs/` nên thay đổi trigger SSE (watch đang có cover luôn `views.json`).

## Validation

- TS: `import { validateSpec, validateManifest, validateSpecFile, validateViews } from "@specpin/spec-schema"`.
- Go: `schema.NewValidator()` rồi `ValidateSpec` / `ValidateManifest` / `ValidateSpecFile` / `ValidateViews`.
- Fixture corpus dùng chung (`tests/fixtures/specs/{valid,invalid}`, `tests/fixtures/views/{valid,invalid}`) được chạy qua cả hai trong CI; các object có unknown property bị từ chối (`additionalProperties: false`).
