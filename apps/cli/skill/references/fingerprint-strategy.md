# Fingerprint strategy

You are not running inside the browser, so you cannot capture a live element.
You synthesize the fingerprint from source (JSX/HTML/Vue/Svelte) or a DOM dump.
Aim for an exact anchor; fall back to best-effort selectors.

## Decision tree

1. **Test-id anchor (best, confidence 1.0).** If the element has, or you can
   add, a stable `data-spec-id` (or `data-testid` / `data-cy` / `data-qa`), set
   `fingerprint.testId` to that value. This is an exact match and survives
   refactors. Prefer this for anything important.

   Add the attribute in source if missing:

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

   Then mirror it: `"testId": "nav-logout"`. The remaining fingerprint fields are
   still required by the schema, so fill them as below (they act as fallbacks).

2. **Synthesized selectors (best-effort, lower confidence).** No stable test-id
   and you cannot add one: synthesize the required fields. Without an exact
   anchor a spec may render as `needsReview` in the extension.

3. **Per-field derivation** (reading the source):
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

## Brittleness caveat

`positionHint` and `domPath` are the most fragile signals: any reorder or
wrapper change breaks them. The CSS selector is moderately robust. The test-id
is the only signal that survives a refactor unchanged. So for any critical
element, add a `data-spec-id`.

## Match order (current)

The extension matches in this order: exact anchors (test-id, confidence 1.0) ->
unique `cssSelector` (confidence 0.7) -> otherwise `needsReview`. The
`settings.matchConfidenceThreshold` in the manifest is reserved for the deferred
hybrid weighted scorer; exact-anchor and unique-cssSelector are the live paths
today.
