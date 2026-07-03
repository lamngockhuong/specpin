---
title: Spec format
description: A simplified, task-oriented primer on the spec JSON for authoring and reviewing specs.
---

This page explains the fields you touch when authoring or reviewing a spec. For the complete, contributor-level schema reference, see the [full schema reference on GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md).

## A spec file

Each `*.spec.json` file in `.specs/` is a **SpecFile**: a named group of specs.

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
      "status": "approved",
      "links": [
        { "label": "JIRA-1234", "url": "https://issues.example.com/browse/JIRA-1234" }
      ],
      "verifiedBy": ["tests/login/email.spec.ts"],
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
        "source": "manual",
        "reviewedAt": "2026-06-30T09:00:00Z",
        "reviewedBy": "alex"
      }
    }
  ]
}
```

## Fields you edit

### `id` (required)

A unique identifier for this spec within your project. Use kebab-case (e.g. `"login-email"`, `"deal-submit"`). Once set, do not change it (the extension uses this to track edits and personal visibility overrides).

### `title` (required, localized)

The spec's heading. This is a **locale-keyed object**, not a flat string:

```json
{ "en": "Email field", "vi": "Trường email" }
```

At least one locale is required. Keys are BCP-47 locale codes (`en`, `vi`, `en-US`, etc.). Flat strings like `"title": "Email field"` are invalid and rejected by the validator.

### `description` (required, localized)

The spec's body text. Same localized object shape as `title`. Each value must be non-empty.

Markdown subset supported (bold, italic, links, lists). See [Markdown formatting](#markdown-formatting) below.

### `businessRules` (optional, localized array)

An array of localized rule strings. Each rule is a separate locale-keyed object:

```json
[
  { "en": "Required; cannot be empty", "vi": "Bắt buộc; không được để trống" },
  { "en": "Must be a valid email format", "vi": "Phải đúng định dạng email" }
]
```

Each rule is displayed as one list item in the rendered spec. Markdown subset supported (bold, italic, links only, no block structure inside a rule).

### `tags` (optional)

An array of strings (not localized). Tags are used for filtering and grouping in the extension:

```json
["login", "critical"]
```

### `preferredDisplayMode` (optional)

How this spec should render by default. One of: `"tooltip"`, `"sidebar"`, `"modal"`. If omitted, the project's `settings.defaultDisplayMode` is used (and if that is also omitted, `"tooltip"` is the final fallback).

:::note
`"overlay"` and `"inline-badge"` are reserved (forward-compatible) modes. If you set them, they fall back to `"tooltip"` at render time.
:::

### `status` (optional)

The spec's lifecycle state. One of: `"draft"`, `"approved"`, `"deprecated"`. When absent, the spec is neutral (there is no default). This drives the lifecycle badge and the stale display on rendered specs — a `deprecated` spec, for example, is flagged so reviewers notice it.

```json
{ "status": "approved" }
```

### `links` (optional)

Author-declared references to related tickets, docs, or PRs. An array of `{ "label", "url" }` objects (up to 10). `url` must be `http` or `https`:

```json
[
  { "label": "JIRA-1234", "url": "https://issues.example.com/browse/JIRA-1234" },
  { "label": "Design doc", "url": "https://example.com/design" }
]
```

These are shown as clickable links on the rendered spec (opening in a new tab). They are context you attach by hand; Specpin does not fetch or verify them.

### `verifiedBy` (optional)

Repo-relative paths to the tests that **declare** this spec. An array of strings (up to 20). This is a *declarative link*, not a test result:

```json
["tests/login/email.spec.ts", "e2e/auth.spec.ts"]
```

`specpin validate` checks that each path **exists** in the repo (a broken-link guard). It never runs the tests and never implies they pass. The UI shows these as **linked** tests — not "verified" or "passing". Keeping the link honest is up to your review process, the same as any other spec field.

## Markdown formatting

`description` and each `businessRules` item support a small, safe Markdown subset:

- **Bold** `**text**`, *italic* `*text*` or `_text_`
- Links `[label](url)` (only `http`, `https`, `mailto` render as links; other schemes are dropped to plain text)
- In `description` only: bullet lists (`- ` or `* `), numbered lists (`1. `), blank-line-separated paragraphs, and newlines as line breaks

Each `businessRules` item is inline-only (no block lists inside a rule, because a rule is one line rendered as one list item).

The renderer escapes all user text and emits only an allowlisted tag set (`strong`, `em`, `a`, `ul`, `ol`, `li`, `p`, `br`), so raw HTML stays inert.

Example:

```json
{
  "description": {
    "en": "User enters their **primary email**. This field:\n\n- Must be unique\n- Cannot be changed after signup\n\nSee [Privacy Policy](https://example.com/privacy) for details."
  }
}
```

Renders as formatted text with bold, a bullet list, and a clickable link.

## How a spec links to an element

The `fingerprint` field holds multiple signals that identify the element on the page:

- `testId`, `ariaLabel`, `id` (exact anchors, highest confidence when present)
- `cssSelector`, `xpath`, `domPath` (fallback selectors)
- `textContent`, `nearbyLabels` (text-based hints)
- `positionHint` (sibling index + count)
- `frameworkHint` (e.g. `"react"`)

The extension tries exact anchors first (confidence 1.0), then unique CSS selectors (confidence 0.7). If neither matches, the spec is flagged `needsReview`.

:::tip
To make matching trivially exact, add a `data-spec-id` attribute to your element in code:

```html
<input data-spec-id="login-email" type="email" />
```

The fingerprint's `testId` will capture this, and matching becomes a simple attribute lookup (no fragility).
:::

You rarely need to hand-edit the fingerprint. The extension's capture flow populates it automatically. If you do edit it, run `specpin validate` to ensure it is still valid.

## The `meta` block

`meta` holds provenance and timestamps:

- `createdBy` (string, e.g. your email or username)
- `createdAt`, `updatedAt` (ISO 8601 date-time)
- `source` (`"manual"` or `"ai-generated"`)
- `reviewedAt` (ISO 8601 date-time) and `reviewedBy` (string): set by the extension's **Mark reviewed** action, not authored by hand. `reviewedBy` must be a **non-PII token** (a name or handle, **not** an email), because it is committed to Git and included in exports. `reviewedAt` also feeds the stale indicator (see `stalenessThresholdDays` in [Settings](/usage/settings/)).

The extension sets these when you capture, edit, or mark a spec reviewed. You rarely touch them by hand.

## Validate your changes

After editing a spec, validate it:

```bash
specpin validate --dir .specs
```

This checks every `.spec.json` against the schema and warns if `manifest.specFiles` is out of sync with the on-disk files.

`specpin validate` also checks that each `verifiedBy` path exists in the repo — a broken-link guard, not a test run (it never executes anything). Pass `--repo-root <path>` when your `.specs/` is not at `<repo>/.specs`, so paths resolve against the right root. See the [CLI guide](/sidecar/cli/#validate-specs-offline) for details.

For CI spec-lint, see the [CLI guide](/sidecar/cli/#validate-specs-offline).

## Full schema reference

This page covers the fields you need for authoring and reviewing specs. For the complete schema (all fields, internal validation rules, TypeScript/Go validator details, and advanced topics like `ViewsConfig` and the fingerprint-matching algorithm), see:

**[docs/schema-reference.md on GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md)**
