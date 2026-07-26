# Fingerprint strategy

You are not running inside the browser, so you cannot capture a live element.
You synthesize the fingerprint from source (JSX/HTML/Vue/Svelte) or a DOM dump.
Specpin is **non-intrusive by default**: it attaches to the UI you already have,
so do NOT edit the app's source unless the project opts in. Prefer an anchor the
element already carries; fall back to synthesized selectors; treat adding a new
attribute as an optional, opt-in upgrade.

## Decision tree

1. **Existing anchor (best, confidence 1.0, zero source changes).** If the
   element already has a stable `data-testid` / `data-spec-id` / `data-cy` /
   `data-qa`, set `fingerprint.testId` to it. A non-generated `id` or an
   `aria-label` are also exact-ish anchors: set `fingerprint.id` / `ariaLabel`.
   This is the default and preferred path: an exact match that survives refactors
   without touching the app.

2. **Synthesize from the existing markup (no edits, lower confidence).** No ready
   anchor: derive the required fields from the source as it is (see per-field
   derivation below). Without an exact anchor a spec may render as `needsReview`
   in the extension, but nothing in the app changes. This is the right default for
   any project that does not want source modifications.

3. **Add a `data-spec-id` (optional, opt-in only).** ONLY when the project agrees
   to small non-functional markup additions, add a `data-spec-id` for the most
   resilient anchor, then fingerprint on it (step 1). Specpin works fine without
   this; never edit source unless asked.

   ```jsx
   // React
   <button data-spec-id="nav-logout" type="button" onClick={logout}>Log out</button>
   ```
   ```html
   <!-- HTML -->
   <button data-spec-id="nav-logout" type="button">Log out</button>
   ```
   ```vue
   <!-- Vue -->
   <button data-spec-id="nav-logout" type="button" @click="logout">Log out</button>
   ```

   Then mirror it: `"testId": "nav-logout"`. Either way, the remaining fingerprint
   fields are still required by the schema, so fill them as below.

### Per-field derivation (reading the source)

- `cssSelector`: shortest unique selector, e.g. `nav button[type=button]` or
  `form.login input[type=email]`. Prefer classes/attributes over nth-child.
- `xpath`: e.g. `//nav//button[@type='button']`.
- `domPath`: ancestor-to-element tag chain, e.g. `["nav", "button"]`.
- `tagName`: lowercase tag, e.g. `"button"`.
- `attributes`: whitelisted only (role, type, name, placeholder, href),
  string values, e.g. `{ "type": "button" }`.
- `positionHint`: `{ index, siblingCount }` among siblings (0-based index).
  Estimate from source order; both are integers >= 0.
- `textContent` (optional, nullable): the visible text, normalized, e.g.
  `"Log out"`; `null` for inputs.
- `ariaLabel`, `id` (optional, nullable): set if present; exclude
  auto-generated ids like `":r1:"` or `"css-1a2b3c"` (use `null`).
- `nearbyLabels` (optional): visible labels near the element, e.g.
  `["Email", "Password"]`.
- `frameworkHint` (optional): `"react" | "vue" | "angular" | "vanilla"`.
- `pageUrl` (optional, nullable): path glob scoping the spec to its route (see
  "Page scope" below).

## Page scope (multi-screen apps)

The extension matches a spec against the live DOM by selector, so a spec pinned
on one screen also renders on another screen whose layout produces the same
`cssSelector`/`xpath` (common in SPAs: list screens sharing a search/filter bar).
`fingerprint.pageUrl` prevents this: a spec renders only on paths its glob covers.

- Derive the route from the source, not a live URL (you are not in the browser):
  read the router config (React Router / Vue Router paths), the file-based route
  (e.g. `pages/orders/[id].tsx` -> `/orders/**`), or the link/nav target.
- `*` matches one path segment, `**` matches across segments; query and hash are
  ignored. For a parameterized route use a glob: `/orders/**`, not `/orders/123`.
- Set it whenever the element is screen-specific. Leave it `null` (or omit) for
  elements present on every screen (global nav, header, footer) so they match
  everywhere. Absent/null is backward compatible.

## Brittleness caveat

`positionHint` and `domPath` are the most fragile signals: any reorder or
wrapper change breaks them. The CSS selector is moderately robust. A test-id is
the only signal that survives a refactor unchanged. So for a critical element,
fingerprint on the most stable signal it already has (an existing test-id, a
non-generated `id`, or a unique selector); an added `data-spec-id` is the most
robust option only if the project allows source edits.

## Match order (current)

The extension matches in this order: exact anchors (test-id, confidence 1.0) ->
unique `cssSelector` (confidence 0.7) -> otherwise `needsReview`. The
`settings.matchConfidenceThreshold` in the manifest is reserved for the deferred
hybrid weighted scorer; exact-anchor and unique-cssSelector are the live paths
today.
