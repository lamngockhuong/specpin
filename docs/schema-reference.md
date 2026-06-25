# Schema Reference (v1)

The canonical schema is `packages/spec-schema/schema/v1.json` (JSON Schema draft 2020-12, `$id: https://specpin.dev/schema/v1.json`). It is the single source of truth: TS types are generated from it, and the Go sidecar embeds the same file. Do not hand-edit generated artifacts.

## Files in a consumer repo

```
.specs/
├── manifest.json          # index + project config
└── <area>.spec.json       # a group of specs (SpecFile)
```

## Manifest

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | schema/version marker, e.g. `"1.0"` |
| `project` | string | yes | display name |
| `domains` | string[] | yes | origins where the UI runs, e.g. `["localhost:3000"]`; empty = any |
| `specFiles` | string[] | yes | names of the `<area>.spec.json` files |
| `settings.defaultLocale` | string | no | |
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
| `title` | string | yes | |
| `description` | string | yes | |
| `businessRules` | string[] | no | |
| `tags` | string[] | no | |
| `preferredDisplayMode` | DisplayMode | no | overrides `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | the element link |
| `meta` | SpecMeta | no | provenance + timestamps |

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional: `testId`, `ariaLabel`, `id` (all nullable), `textContent` (nullable), `nearbyLabels`, `frameworkHint`.

`positionHint` = `{ index: int >= 0, siblingCount: int >= 0 }`.

## SpecMeta

`createdBy` (string), `createdAt` + `updatedAt` (date-time), `source` (`"ai-generated" | "manual"`). The date-time format is asserted by both validators.

## DisplayMode

`"overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge"`. Phase 1 implements `tooltip` and `sidebar`; the other three are reserved (forward-compatible) and fall back to `tooltip` at render time.

## Validation

- TS: `import { validateSpec, validateManifest, validateSpecFile } from "@specpin/spec-schema"`.
- Go: `schema.NewValidator()` then `ValidateSpec` / `ValidateManifest` / `ValidateSpecFile`.
- A shared fixture corpus (`tests/fixtures/specs/{valid,invalid}`) is run through both in CI; objects with unknown properties are rejected (`additionalProperties: false`).
