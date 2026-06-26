# Tham chiếu Schema (v1)

> Bản tiếng Việt của `docs/schema-reference.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Schema chuẩn (canonical) là `packages/spec-schema/schema/v1.json` (JSON Schema draft 2020-12, `$id: https://specpin.dev/schema/v1.json`). Nó là single source of truth: TS types được sinh ra từ nó, và Go sidecar nhúng cùng file đó. Không hand-edit các generated artifact.

## Files in a consumer repo

```
.specs/
├── manifest.json          # index + project config
└── <area>.spec.json       # a group of specs (SpecFile)
```

## Manifest

| Field | Type | Required | Ghi chú |
|-------|------|----------|-------|
| `version` | string | yes | marker đánh dấu schema/version, ví dụ `"1.0"` |
| `project` | string | yes | tên hiển thị |
| `domains` | string[] | yes | các origin nơi UI chạy, ví dụ `["localhost:3000"]`; rỗng = bất kỳ |
| `specFiles` | string[] | yes | tên của các file `<area>.spec.json` |
| `settings.defaultLocale` | string | no | |
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
| `title` | string | yes | |
| `description` | string | yes | |
| `businessRules` | string[] | no | |
| `tags` | string[] | no | |
| `preferredDisplayMode` | DisplayMode | no | ghi đè `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | liên kết tới element |
| `meta` | SpecMeta | no | nguồn gốc (provenance) + timestamp |

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional: `testId`, `ariaLabel`, `id` (đều nullable), `textContent` (nullable), `nearbyLabels`, `frameworkHint`.

`positionHint` = `{ index: int >= 0, siblingCount: int >= 0 }`.

## SpecMeta

`createdBy` (string), `createdAt` + `updatedAt` (date-time), `source` (`"ai-generated" | "manual"`). Định dạng date-time được assert bởi cả hai validator.

## DisplayMode

`"overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge"`. Phase 1 hiện thực `tooltip` và `sidebar`; ba mode còn lại được dành riêng (forward-compatible) và fall back về `tooltip` lúc render.

## Validation

- TS: `import { validateSpec, validateManifest, validateSpecFile } from "@specpin/spec-schema"`.
- Go: `schema.NewValidator()` rồi `ValidateSpec` / `ValidateManifest` / `ValidateSpecFile`.
- Một fixture corpus dùng chung (`tests/fixtures/specs/{valid,invalid}`) được chạy qua cả hai trong CI; các object có unknown property bị từ chối (`additionalProperties: false`).
