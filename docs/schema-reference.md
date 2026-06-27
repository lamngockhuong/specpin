# Schema Reference (v1)

> Tiếng Việt: [`vi/schema-reference.md`](./vi/schema-reference.md). English is the source of truth.

The canonical schema is `packages/spec-schema/schema/v1.json` (JSON Schema draft 2020-12, `$id: https://specpin.dev/schema/v1.json`). It is the single source of truth: TS types are generated from it, and the Go sidecar embeds the same file. Do not hand-edit generated artifacts.

## Files in a consumer repo

```
.specs/
├── manifest.json          # index + project config
├── views.json             # team visibility defaults (optional, Git-committed)
└── <area>.spec.json       # a group of specs (SpecFile)
```

## Manifest

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | schema/version marker, e.g. `"1.0"` |
| `project` | string | yes | display name |
| `domains` | string[] | yes | origins where the UI runs, e.g. `["localhost:3000"]`; empty = any |
| `specFiles` | string[] | yes | names of the `<area>.spec.json` files |
| `settings.defaultLocale` | string | no | fallback locale when the viewer's choice is absent on a spec |
| `settings.locales` | string[] | no | BCP-47 locales this project authors specs in; the extension's language picker offers the union across connected projects |
| `settings.matchConfidenceThreshold` | number 0-1 | no | reserved for the deferred hybrid scorer |
| `settings.defaultDisplayMode` | DisplayMode | no | fallback render mode |

## SpecFile (`<area>.spec.json`)

| Field | Type | Required |
|-------|------|----------|
| `group` | string | yes |
| `specs` | Spec[] | yes |

## Spec

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | unique within the project |
| `title` | LocalizedString | yes | locale-keyed object (see below) |
| `description` | LocalizedString | yes | locale-keyed object; each value non-empty |
| `businessRules` | LocalizedString[] | no | each rule is a locale-keyed object |
| `tags` | string[] | no | not localized |
| `preferredDisplayMode` | DisplayMode | no | overrides `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | the element link |
| `meta` | SpecMeta | no | provenance + timestamps |

## LocalizedString

Spec business content (`title`, `description`, each `businessRules` item) is a **locale-keyed object**, not a flat string:

```json
{ "en": "Log in button", "vi": "Nút đăng nhập" }
```

- Keys are BCP-47 locale codes (`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$`), e.g. `en`, `vi`, `en-US`.
- At least one entry is required (`minProperties: 1`); each value is a non-empty string (`minLength: 1`); at most 50 entries.
- **Flat strings are rejected** by both validators - `"title": "Log in"` is invalid.
- Fallback order when rendering for a locale: the requested locale, then the manifest's `defaultLocale`, then the first present value. A partly translated `businessRules` list drops items that have no value for the resolved locale (never renders a blank rule).

The `description` value is non-empty (`minLength: 1`), so a blank description is now invalid (it was an allowed empty string before localization).

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional: `testId`, `ariaLabel`, `id` (all nullable), `textContent` (nullable), `nearbyLabels`, `frameworkHint`.

`positionHint` = `{ index: int >= 0, siblingCount: int >= 0 }`.

## SpecMeta

`createdBy` (string), `createdAt` + `updatedAt` (date-time), `source` (`"ai-generated" | "manual"`). The date-time format is asserted by both validators.

## DisplayMode

`"overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge"`. `tooltip`, `sidebar`, and `modal` are implemented; `overlay` and `inline-badge` are reserved (forward-compatible) and fall back to `tooltip` at render time.

## ViewsConfig (`.specs/views.json`)

Optional team-level spec visibility defaults. When present, acts as the baseline for which specs are hidden before personal overrides apply (see visibility cascade in `docs/system-architecture.md`).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | e.g. `"1.0"` |
| `hidden` | string[] | yes | flat list of facet keys (can be empty array) |

Facet keys are strings like `tag:<name>`, `file:<filename>`, `spec:<id>`, or `url:<glob>`. A spec matches a facet if it has that tag, lives in that file, has that id, or appears on a page whose path matches the glob (`*` = one segment, `**` = across segments). The `url:` facet is a page-level gate (wins over everything).

When `.specs/views.json` is absent, the sidecar returns the empty default `{ "version": "1.0", "hidden": [] }` on `GET /views`. All specs are visible unless the user sets a personal override. Team defaults are edited via the extension Options page (per connection) and written to `.specs/views.json` via `PUT /views` (schema-validated, atomic, pretty-printed). The sidecar watches `.specs/` so changes trigger SSE (existing watch covers `views.json` too).

## Validation

- TS: `import { validateSpec, validateManifest, validateSpecFile, validateViews } from "@specpin/spec-schema"`.
- Go: `schema.NewValidator()` then `ValidateSpec` / `ValidateManifest` / `ValidateSpecFile` / `ValidateViews`.
- Shared fixture corpus (`tests/fixtures/specs/{valid,invalid}`, `tests/fixtures/views/{valid,invalid}`) run through both in CI; objects with unknown properties are rejected (`additionalProperties: false`).
