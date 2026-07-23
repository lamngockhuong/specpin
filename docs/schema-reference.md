# Schema Reference (v1)

> Tiếng Việt: [`vi/schema-reference.md`](./vi/schema-reference.md). English is the source of truth.

The canonical schema is `packages/spec-schema/schema/v1.json` (JSON Schema draft 2020-12, `$id: https://specpin.ohnice.app/schema/v1.json`). It is the single source of truth: TS types are generated from it, and the Go sidecar embeds the same file. Do not hand-edit generated artifacts.

## Files in a consumer repo

```
.specs/
├── manifest.json          # index + project config
├── views.json             # team visibility defaults (optional, Git-committed)
├── guides.json            # named onboarding tours (optional, Git-committed)
├── flows.json             # status-flow FSMs (optional, Git-committed)
├── screens.json           # screen-transition graph (optional, Git-committed)
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
| `settings.stalenessThresholdDays` | number 1-3650 | no | days after a spec's `meta.reviewedAt` before it renders as **stale**; runtime default **90** when absent. Bounded so it cannot silently disable the freshness signal. Resolved per-project, so a multi-project page uses each spec's own project setting; local/manual projects (no manifest) always use 90. |
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
| `links` | Link[] | no | author-declared references (tickets, docs, PRs); ≤10; see Link below |
| `verifiedBy` | string[] | no | repo-relative paths of tests that **declare** this spec; ≤20, each ≤200 chars. Declarative only; see the trust note below |
| `status` | SpecStatus | no | `"draft" \| "approved" \| "deprecated"`; **absent = neutral** (no default, so existing specs are not relabelled) |
| `preferredDisplayMode` | DisplayMode | no | overrides `settings.defaultDisplayMode` |
| `fingerprint` | ElementFingerprint | yes | the element link |
| `meta` | SpecMeta | no | provenance + timestamps |

### Link

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | string | yes | 1-80 chars |
| `url` | string | yes | `http`/`https` only (`^https?://` + `format: uri`) |

The `url` schema constraint is **defense-in-depth at the storage boundary**, not the authoritative sanitizer: a scheme-valid URL can still carry a payload, so the render-time href sanitizer (which rejects `javascript:`/`data:`/scheme-relative and HTML-escapes the value) is what makes links safe. Note the two validators' `uri`-format implementations differ on some edge cases; scheme rejection is enforced by the `^https?://` **pattern** (identical on both), and render safety is enforced at display time.

### Provenance / trust model

Provenance is **author-asserted**. The integrity boundary is the **human review of the `.specs/` JSON diff in a Git PR**, not any runtime signal; the extension's write path is unprivileged (a page can send an edit, by design, for in-page capture), so `status` / `reviewedBy` / `links` are no more trusted than a spec's title. The UI never presents `status: "approved"` or `reviewedBy` as cryptographically verified.

`verifiedBy` is a **declared** test link: `specpin validate` checks each referenced path **exists** in the repo (a "link isn't broken" signal); it does **not** run the tests or know pass/fail. The UI wording is always "linked tests", never "verified"/"passed".

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

## Formatting (Markdown subset)

`description` and each `businessRules` item may carry a small **Markdown subset**. This is purely a rendering convention: the stored value is still a plain string (no schema change), so `.specs/*.json` stays Git-diffable and both validators are unaffected.

Supported syntax:

- **Bold** `**text**`, *italic* `*text*` or `_text_`.
- Links `[label](url)`. Only `http`, `https`, and `mailto` URLs render as links; other schemes (`javascript:`, `data:`) are dropped to plain text. A relative URL (`/path`) is resolved against the spec's page origin, and a link to that **same origin** opens in the **current tab** (no `target`); every other link, including a different subdomain or any cross-origin URL, opens in a **new tab** (`rel="noopener noreferrer" target="_blank"`). Without a known page origin (legacy callers) relative URLs are dropped and all links open in a new tab.
- `description` also supports block structure: bullet lists (`- ` or `* ` line prefix), numbered lists (`1. ` line prefix), blank-line-separated paragraphs, and single newlines as line breaks.
- Each `businessRules` item is **inline-only** (bold/italic/link); a rule is one line rendered as one list item, so block lists inside a rule do not apply.

Not supported (rendered literally): headings, blockquotes, code blocks/spans, tables, images, underline. Markdown in `title` is not interpreted (it seeds the id slug and a heading).

The renderer is dependency-free and CSP-safe: it escapes every leaf of user text and emits only an allowlisted tag set (`strong`, `em`, `a`, `ul`, `ol`, `li`, `p`, `br`), so raw HTML and injection vectors in spec text stay inert.

**Backward-compat caveat:** legacy plain text that happens to contain paired `*`/`_` or `[text](url)` is now interpreted as Markdown (e.g. `a_b_c` could render `b` in italics, though the word-boundary rule for `_` avoids most snake_case cases). There is no migration; bare URLs are not auto-linked.

## ElementFingerprint

Required: `cssSelector`, `xpath`, `domPath`, `tagName`, `attributes`, `positionHint`.
Optional: `testId`, `ariaLabel`, `id` (all nullable), `textContent` (nullable), `nearbyLabels`, `frameworkHint`, `pageUrl` (nullable).

`positionHint` = `{ index: int >= 0, siblingCount: int >= 0 }`.

`pageUrl` is a path glob that scopes the spec to a page/route (`*` matches one path segment, `**` matches across segments; query and hash are ignored). It is auto-filled with the capture path and editable in the capture form. Absent/null matches on any page (backward compatible). This stops a spec pinned on one screen from rendering on another screen whose layout yields a colliding `cssSelector`/`xpath`.

## SpecMeta

`createdBy` (string), `createdAt` + `updatedAt` (date-time), `source` (`"ai-generated" | "manual"`). The date-time format is asserted by both validators.

Optional review fields (stamped by the extension's **Mark reviewed** action, all backward-compatible):

| Field | Type | Notes |
|-------|------|-------|
| `reviewedAt` | date-time | when the spec content was last human-reviewed; absent = never reviewed. Drives the stale indicator against `settings.stalenessThresholdDays`. |
| `reviewedBy` | string | author-declared reviewer **token**. Defaults to the same non-PII token `createdBy` uses (e.g. `manual`/`agent`), editable in the form. **Committed to `.specs/` (Git) and included in export bundles; do not put PII/emails here.** |

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

## GuidesConfig (`.specs/guides.json`)

Optional named onboarding tours: ordered walkthroughs over specs already pinned to a page. A guide spotlights each step's element and shows its localized content. This file holds the **team** (Git-committed) guides; the extension also keeps **personal** guides privately in `storage.sync` (never written here).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | e.g. `"1.0"` |
| `guides` | GuideDef[] | yes | may be empty; at most 50 (`maxItems`) |

## RequiredConfig (`.specs/required.json`)

Optional governance gate: a list of spec ids that must exist in the project. Used by `specpin report --fail-on missing-required` to gate CI when a required spec is deleted or renamed.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | e.g. `"1.0"` |
| `required` | string[] | yes | spec ids that must exist (may be empty; each `maxLength` 200) |

```json
{
  "version": "1.0",
  "required": ["login-submit-btn", "dashboard-stat-revenue"]
}
```

`GuideDef`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | unique within the file; pattern `^[a-z0-9-]+$`, `maxLength` 100 |
| `name` | string | yes | plain UI label (NOT a LocalizedString), non-empty, `maxLength` 200 |
| `description` | string | no | plain blurb, `maxLength` 2000 |
| `steps` | string[] | yes | ordered spec ids; may be empty, `maxItems` 200, each `maxLength` 200 |

```json
{
  "version": "1.0",
  "guides": [
    { "id": "onboarding", "name": "Onboarding tour", "description": "First-run walkthrough", "steps": ["login-submit-btn", "nav-dashboard"] }
  ]
}
```

`name` is a plain string (not localized) by design: it is a short label, while the step **content** localizes via the referenced specs. An **empty `steps`** guide falls back at launch to all specs matched on the page in the default order (alphabetical by source file, then in-file order, with local-project specs last), so a guide is usable with zero curation. Step ids that no longer resolve (renamed/deleted spec, or absent on the current page) are dropped at launch and flagged in the curation editor.

When `.specs/guides.json` is absent, the sidecar returns the empty default `{ "version": "1.0", "guides": [] }` on `GET /guides`. Guides are authored in the extension (popup / side panel guide editor) and written via `PUT /guides` (schema-validated, atomic, pretty-printed), or saved to a local project / personal storage. The bounds above live in the SSOT so both validators inherit them; personal guides additionally respect the `storage.sync` per-item quota (a rejected write surfaces an error rather than dropping silently).

## Transition (shared by FlowsConfig and ScreensConfig)

A directed edge, used both by a status-flow FSM (state -> state) and by the screen-transition graph (screen -> screen). `trigger` names the action that causes it; the optional `specId` links the edge back to the pinned element that fires it, so a graph is a *view over already-pinned knowledge*, not a parallel silo.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | 1-100 chars; stable, unique within its parent graph |
| `from` | string | yes | source node id (a `FlowState.id` or `Screen.id`) |
| `to` | string | yes | target node id (a `FlowState.id` or `Screen.id`) |
| `trigger` | LocalizedString | yes | the action/event that causes the transition, e.g. `"Submit"` |
| `guard` | string \| null | no | optional condition that must hold for the transition to fire, e.g. `"amount > 0"` |
| `role` | string \| null | no | optional actor/role that performs the transition, e.g. `"admin"` |
| `specId` | string \| null | no | id of the pinned element that triggers this transition, if any |
| `source` | SpecSource-like enum | no | `"manual" \| "auto-captured" \| "imported"`; defaults to manual authoring when absent |

## FlowsConfig (`.specs/flows.json`)

A status-flow FSM per object type (e.g. the lifecycle of a "Deal" or "Application"): its states and the transitions between them. Optional, Git-committed, mirrors the `guides.json`/`views.json` singleton pattern.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | e.g. `"1.0"` |
| `flows` | Flow[] | yes | at most 50 (`maxItems`) |

`Flow`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | 1-100 chars; unique within the file, e.g. `"deal-status"` |
| `object` | LocalizedString | yes | the object type whose lifecycle this flow describes, e.g. `"Deal"` |
| `description` | LocalizedString | no | optional blurb describing the flow |
| `states` | FlowState[] | yes | at most 200 |
| `transitions` | Transition[] | yes | at most 2000 |

`FlowState`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | 1-100 chars; unique within its Flow |
| `label` | LocalizedString | yes | human-readable state label |
| `kind` | string | no | `"initial" \| "normal" \| "terminal"`; absent means a normal state |
| `specId` | string \| null | no | id of a pinned element that represents this state in the live UI |

State ids are only unique **within** their own Flow (two flows may both use `"draft"` as a state id).

```json
{
  "version": "1.0",
  "flows": [
    {
      "id": "deal-status",
      "object": { "en": "Deal", "vi": "Giao dịch" },
      "description": {
        "en": "Lifecycle of a deal as it moves through the sales pipeline.",
        "vi": "Vòng đời của một giao dịch khi di chuyển qua pipeline bán hàng."
      },
      "states": [
        { "id": "draft", "label": { "en": "Draft", "vi": "Nháp" }, "kind": "initial" },
        { "id": "negotiation", "label": { "en": "Negotiation", "vi": "Đàm phán" }, "specId": "deal-stage" },
        { "id": "won", "label": { "en": "Won", "vi": "Đã chốt" }, "kind": "terminal", "specId": "deal-stage" },
        { "id": "lost", "label": { "en": "Lost", "vi": "Thất bại" }, "kind": "terminal", "specId": "deal-stage" }
      ],
      "transitions": [
        {
          "id": "start-negotiation",
          "from": "draft",
          "to": "negotiation",
          "trigger": { "en": "Start negotiation", "vi": "Bắt đầu đàm phán" },
          "specId": "deal-submit",
          "source": "manual"
        },
        {
          "id": "mark-won",
          "from": "negotiation",
          "to": "won",
          "trigger": { "en": "Mark won", "vi": "Đánh dấu đã chốt" },
          "specId": "deal-stage",
          "source": "manual"
        }
      ]
    }
  ]
}
```

When `.specs/flows.json` is absent, the sidecar returns the empty default `{ "version": "1.0", "flows": [] }` on `GET /flows`. `PUT /flows` validates + writes it (schema-validated, atomic, pretty-printed, `.specs/`-confined), and the existing `.specs/` watcher fires SSE on change, the same as `views.json`/`guides.json`.

## ScreensConfig (`.specs/screens.json`)

The screen-transition graph: screen/page nodes and the navigation transitions between them. Optional, Git-committed, same singleton pattern as `flows.json`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | e.g. `"1.0"` |
| `screens` | Screen[] | yes | at most 500 |
| `transitions` | Transition[] | yes | at most 2000 |

`Screen`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | 1-100 chars; unique within the file, e.g. `"checkout"` |
| `name` | LocalizedString | yes | human-readable screen name |
| `urlGlob` | string | yes | URL glob that identifies this screen in the live UI, **reusing the same glob semantics as a spec's `fingerprint.pageUrl`** (`*` = one path segment, `**` = across segments), e.g. `"/checkout/*"` |
| `description` | LocalizedString | no | optional blurb describing the screen |
| `specIds` | string[] | no | ids of pinned elements that live on this screen; at most 200, each `maxLength` 200 |

Unlike `flows.json` (where state ids are only unique per-Flow), `screens.json` holds one flat `screens`/`transitions` list, so ids are already globally unique - no prefixing needed.

```json
{
  "version": "1.0",
  "screens": [
    { "id": "login", "name": { "en": "Login", "vi": "Đăng nhập" }, "urlGlob": "/login", "specIds": ["login-submit-btn"] },
    {
      "id": "dashboard",
      "name": { "en": "Dashboard", "vi": "Bảng điều khiển" },
      "urlGlob": "/",
      "description": { "en": "Landing page after sign-in: stats + recent activity.", "vi": "Trang sau khi đăng nhập: số liệu và hoạt động gần đây." },
      "specIds": ["dashboard-new-deal-cta"]
    }
  ],
  "transitions": [
    {
      "id": "login-to-dashboard",
      "from": "login",
      "to": "dashboard",
      "trigger": { "en": "Sign in", "vi": "Đăng nhập" },
      "specId": "login-submit-btn"
    }
  ]
}
```

When `.specs/screens.json` is absent, the sidecar returns the empty default `{ "version": "1.0", "screens": [], "transitions": [] }` on `GET /screens`. `PUT /screens` validates + writes it the same way as `PUT /flows`.

Both configs render in the extension's full-page **graph view** (dagre layout + hand-drawn SVG, launched from the popup/side panel); see [`run-guide.md`](./run-guide.md#19-graph-views) for the reader-facing walkthrough.

## Validation

- TS: `import { validateSpec, validateManifest, validateSpecFile, validateViews, validateGuides, validateRequired, validateFlows, validateScreens } from "@specpin/spec-schema"`.
- Go: `schema.NewValidator()` then `ValidateSpec` / `ValidateManifest` / `ValidateSpecFile` / `ValidateViews` / `ValidateGuides` / `ValidateRequired` / `ValidateFlows` / `ValidateScreens`.
- Shared fixture corpus (`tests/fixtures/specs/{valid,invalid}`, `tests/fixtures/views/{valid,invalid}`, `tests/fixtures/guides/{valid,invalid}`, `tests/fixtures/required/{valid,invalid}`, `tests/fixtures/flows/{valid,invalid}`, `tests/fixtures/screens/{valid,invalid}`) run through both in CI; objects with unknown properties are rejected (`additionalProperties: false`).

## Consuming the schema

Three ways to get the schema, in order of convenience:

- **Editor autocomplete via `$schema` (zero install).** `specpin init` writes
  `"$schema": "https://specpin.ohnice.app/schema/v1.json"` into spec files. Any
  editor that honors `$schema` (VS Code, JetBrains) then validates and autocompletes
  while authoring. The URL is served by the docs site (`apps/web`).
- **SchemaStore.org (no `$schema` needed).** Once the catalog entry is merged
  upstream, editors auto-associate `**/.specs/*.spec.json` with the schema, so the
  `$schema` line becomes optional.
- **npm package** for programmatic use: `pnpm add @specpin/spec-schema` gives the
  generated types + ajv validators (see Validation above). The raw schema is also
  reachable over a CDN without the hosted URL:
  `https://unpkg.com/@specpin/spec-schema/schema/v1.json` or
  `https://cdn.jsdelivr.net/npm/@specpin/spec-schema/schema/v1.json`.

Versioning: `/schema/v1.json` is stable for the v1 schema. A future breaking change
adds `/schema/v2.json` and keeps v1 alive for existing repos.
