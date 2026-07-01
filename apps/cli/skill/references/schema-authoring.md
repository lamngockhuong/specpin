# Schema authoring (spec v1)

Distilled from the canonical schema `v1.json`
(`$id: https://specpin.ohnice.app/schema/v1.json`, JSON Schema draft 2020-12).
Every object is `additionalProperties: false`: unknown keys are rejected by both
the TS (ajv) and Go validators. Add `"$schema": "https://specpin.ohnice.app/schema/v1.json"`
to each file for editor autocomplete.

## Files in `.specs/`

```
.specs/
  manifest.json          # index + project config (required)
  <area>.spec.json       # a group of specs (SpecFile)
  views.json             # optional team visibility defaults (do not author by hand)
  guides.json            # optional onboarding tours (do not author by hand)
```

## Manifest (`manifest.json`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | e.g. `"1.0"` |
| `project` | string | yes | display name |
| `domains` | string[] | yes | origins the UI runs on, e.g. `["localhost:3000"]`; empty = any |
| `specFiles` | string[] | yes | names of the `<area>.spec.json` files |
| `settings.defaultLocale` | string | no | fallback locale |
| `settings.locales` | string[] | no | BCP-47 locales authored |
| `settings.matchConfidenceThreshold` | number 0-1 | no | reserved for the deferred hybrid scorer |
| `settings.defaultDisplayMode` | DisplayMode | no | fallback render mode |

## SpecFile (`<area>.spec.json`)

| Field | Type | Required |
|-------|------|----------|
| `group` | string (non-empty) | yes |
| `specs` | Spec[] | yes |

## Spec

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (non-empty) | yes | unique within the project |
| `title` | LocalizedString | yes | locale-keyed object |
| `description` | LocalizedString | yes | locale-keyed object, each value non-empty |
| `businessRules` | LocalizedString[] | no | one locale-keyed object per rule |
| `tags` | string[] | no | NOT localized |
| `preferredDisplayMode` | DisplayMode | no | overrides `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | the element link |
| `meta` | SpecMeta | no | provenance + timestamps |

## LocalizedString

A locale-keyed object, NOT a flat string:

```json
{ "en": "Log in button", "vi": "Nut dang nhap" }
```

- Keys are BCP-47 codes matching `^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$` (`en`, `vi`, `en-US`).
- At least one entry (`minProperties: 1`), at most 50; each value non-empty (`minLength: 1`).
- Flat strings are rejected: `"title": "Log in"` is invalid. Use `{ "en": "Log in" }`.

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional (all nullable where noted): `testId`, `ariaLabel`, `id`, `textContent`,
`nearbyLabels`, `frameworkHint`, `pageUrl`.

- `domPath`: tag chain array, e.g. `["form", "button"]`.
- `attributes`: object of whitelisted attrs (role, type, name, placeholder, href), string values.
- `positionHint`: `{ "index": int >= 0, "siblingCount": int >= 0 }` (both required).
- `frameworkHint`: `"react" | "vue" | "angular" | "vanilla"`.
- `pageUrl`: path glob scoping the spec to a page/route (`*` = one path segment,
  `**` = across segments; query and hash ignored). Absent/null matches on any
  page. Set it on multi-screen apps so a spec does not render on another screen
  whose layout yields a colliding selector. See `fingerprint-strategy.md`.

See `fingerprint-strategy.md` for how to fill these from source.

## SpecMeta

All four required when `meta` is present: `createdBy` (string),
`createdAt` + `updatedAt` (RFC3339 date-time, format-checked by both validators),
`source` (`"ai-generated" | "manual"`). Use `"ai-generated"` for specs you author.

## DisplayMode

`"overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge"`. Implemented:
`tooltip`, `sidebar`, `modal`. `overlay` and `inline-badge` are reserved and
fall back to `tooltip` at render time.

## Markdown subset (rendering convention only)

`description` and each `businessRules` item may carry a small Markdown subset.
The stored value stays a plain string (no schema change), so files remain
Git-diffable.

- Inline (both fields): bold `**text**`, italic `*text*` / `_text_`, links
  `[label](url)`. Only `http`, `https`, `mailto` URLs render; others drop to text.
- Block (`description` only): bullet lists (`- ` / `* `), numbered lists (`1. `),
  blank-line paragraphs, single newline = line break. A `businessRules` item is
  inline-only (one line, one list item).
- Not supported (rendered literally): headings, blockquotes, code, tables,
  images, underline. `title` is never interpreted as Markdown.

## Complete minimal valid example

`nav.spec.json`:

```json
{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Navigation",
  "specs": [
    {
      "id": "nav-logout",
      "title": { "en": "Log out button" },
      "description": { "en": "Ends the session and returns to the login screen." },
      "businessRules": [
        { "en": "Clears the auth token client-side before redirecting" }
      ],
      "tags": ["auth"],
      "preferredDisplayMode": "tooltip",
      "fingerprint": {
        "testId": "nav-logout",
        "ariaLabel": null,
        "id": null,
        "cssSelector": "nav button[type=button]",
        "xpath": "//nav//button[@type='button']",
        "domPath": ["nav", "button"],
        "tagName": "button",
        "textContent": "Log out",
        "attributes": { "type": "button" },
        "nearbyLabels": ["Settings"],
        "positionHint": { "index": 5, "siblingCount": 6 },
        "frameworkHint": "react",
        "pageUrl": null
      },
      "meta": {
        "createdBy": "agent",
        "createdAt": "2026-06-30T00:00:00Z",
        "updatedAt": "2026-06-30T00:00:00Z",
        "source": "ai-generated"
      }
    }
  ]
}
```

Then add `"nav.spec.json"` to `manifest.json` `specFiles[]` and run
`specpin validate`.
