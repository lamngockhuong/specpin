# specshot → specpin Integration Plan

> **Status:** **Phase 1 SHIPPED** (2026-07-24, `main`) — manual authoring + shot artifacts + pending
> (unpinned) specs are live. See "Phase 1 — implementation notes" below for what actually landed;
> the rest of this doc is the original design record (kept for context on *why*), with the resolved
> open questions called out inline. Phases 2-4 are still design-only.
> **Update (2026-07-24):** host changed to the in-extension `specshot.html` page; `apps/spec-sheet`
> removed; composition in `@specpin/specshot-app`. Reason: the sidecar's CORS policy accepts the
> extension origin but rejects web origins, so a standalone web app could never persist to `.specs/`.
> The rest of this document (including "Decided direction" and the Phase 1 notes below) describes the
> original `apps/spec-sheet` design and is kept for historical context - read `docs/spec-sheet-authoring.md`
> and `docs/system-architecture.md` for the current, shipped shape.
> **Decision date:** 2026-07-23 (revised same day).
> Full trade-off analysis (VI): `mark-number/plans/reports/brainstorm-260723-2021-marknumber-specpin-integration.md`
> (project renamed specshot; on-disk folder still `mark-number/` until you rename it).
> Tiếng Việt: mirror to `vi/specshot-integration.md` when convenient (English is source of truth).

## Goal

Fold **specshot** (a standalone screenshot-annotation editor) into specpin to **grow adoption**
by making specpin a **spec-first lifecycle** tool: a spec can be authored from a **screenshot/design
before the UI exists**, then **bound to a real DOM element in the extension** once the frontend is
built. This opens spec authoring to non-devs/PMs at design time. Once ported, the standalone
specshot repo is **retired/deleted**.

## Decided direction (sealed 2026-07-23)

- **Path A**, as **two workspace packages + a thin app** (not one monolithic app):
  - `packages/specshot-core` — headless, framework-free TS: MarkDoc/coordinate model, numbering,
    viewport transform, interaction geometry, detect (svg-geometry/cluster/path-bbox), export string
    builders. Depends on `@specpin/spec-schema`.
  - `packages/specshot-react` — the editor React components + hooks. `react`/`react-dom` are
    **peerDependencies**.
  - `apps/spec-sheet` — thin shell embedding both; the manual authoring + export surface.
- **Cadence chosen = "Nhịp 2": commit to the pending-spec core-model change now** (NOT the lighter
  "separate artifact, don't touch Spec" variant). Accepted consequence: the manual track is a
  **first-class specpin lifecycle change**, heavier than a bolt-on. This is deliberate.
- **Bind-later happens in the extension** (open the built FE → picker → capture fingerprint →
  promote pending → pinned).
- **Toolchain stays whatever the monorepo already uses.** Any TS/Vitest version upgrade is a
  **separate, decoupled migration** — never bundled into this integration.

## The core-model change: pending (unpinned) specs

Today `Spec` **requires** `fingerprint` (schema `v1.json`: `required: [id,title,description,fingerprint]`).
So a screenshot-only user cannot mint a valid spec. Note the distinction:
- **Orphaned spec (exists today):** HAS a full fingerprint, just no live match at runtime.
- **Pending spec (new):** has **no fingerprint yet** — authored before the UI exists.

The system already tolerates "spec with no live match" (orphaned bucket in `pageHealth`), so extending
to "spec not yet pinned" is coherent, not alien.

**Change:** make `Spec.fingerprint` **optional**. Absent fingerprint ⇒ **pending/unpinned** state.
Lifecycle:

```
PM/design authors spec against a screenshot  →  PENDING spec (no fingerprint)
        │  (FE builds the UI)
        ▼
extension: "Pin this pending spec to this element" → capture fingerprint → PINNED spec
        │  (UI later changes)
        ▼
match fails at runtime → ORPHANED (has fingerprint, no match) → relink
```

### Blast radius of the schema change (SSOT, validated TS + Go, drift-gated)
- `spec-schema/schema/v1.json`: `fingerprint` optional. (Design detail for the plan: derive
  "pending" from absent fingerprint — KISS — vs. an explicit `pinState`. Recommend absent = pending;
  confirm at plan time.)
- `fingerprint-core/match.ts`: absent fingerprint → skip matching, classify **unpinned** (do not throw).
- `surface-data.ts pageHealth()`: add an **unpinned/pending** bucket alongside exact/scored/orphaned.
- **Extension bind-later UI**: a "Pin pending spec → this element" action. Rides existing
  `capture-mode`/`capture-form`, but is net-new: it **re-fingerprints an existing spec** rather than
  creating a new one.
- Go validator + `make check-schema` drift gate updated; published `.d.ts` changes (additive-optional,
  low breakage).

## Geometry stays out of Spec (anti-bloat still holds)

Even pending specs are **geometry-free** (a fingerprint has no pixels). The screenshot + pixel boxes
live in a **separate artifact** `.specs/shots/<screenId>.shot.json` (path is `shots/`, NOT `screens/`,
to avoid colliding with the existing `screens.json` singleton):

```
{ screenId, image (ref/embed), items: [ { itemNo, bbox, specId } ] }
```

- Maps each number on the image → a `specId` (pending or pinned).
- Reuse the existing **`Screen` / `ScreensConfig`** (`Screen.specIds`, `urlGlob`, localized `name`)
  to answer "all specs of this screen" — do NOT invent a new grouping.
- **Anti-bloat constraints (unchanged, do not violate):**
  1. Editor/exporter is a separate surface (`apps/spec-sheet` + optional CLI export) — never bundled
     into the MV3 extension.
  2. Pixel coordinates live only in the shot artifact — never inside `Spec`.
  3. Extension gains only: the bind-later picker, plus (later, auto track) an `activeTab` screen
     capture. No React editor in the extension bundle.

## Phasing

### Phase 1 — Manual authoring + spec sheet export (ship first) — **SHIPPED 2026-07-24**
- [x] Split specshot into `packages/specshot-core` + `packages/specshot-react`; aligned to
      specpin conventions (Biome, turbo, ESM, `tsconfig.base.json`, whatever TS/Vitest the
      monorepo runs — no version bump bundled in).
- [x] Schema: `Spec.fingerprint` made optional (pending state) — gen TS + Go + drift gate green.
- [x] `apps/spec-sheet`: upload screenshot → draw/number boxes → per box, author a **pending Spec**
      (localized title/description/rules) or reference an existing `specId`.
- [x] Shot artifact `.specs/shots/<screenId>.shot.json` (itemNo → bbox + specId). Grouped via `Screen`.
- [x] Shared **spec-sheet exporter**: image + numbered callouts + full per-number spec → HTML + MD.
- [x] `fingerprint-core`/`api-client`/`cli`/extension-bundle **dependencies** unchanged (no new
      workspace deps); each package still gained additive code for the new state (see below).

#### Phase 1 — implementation notes (what actually landed)

- **Packages**: `@specpin/specshot-core` (headless authoring: MarkDoc model, numbering, canvas
  geometry, detect, export builders, `buildShot`/`buildPendingSpec`) and `@specpin/specshot-react`
  (presentational editor UI; `react`/`react-dom` peerDeps). See `docs/codebase-summary.md`.
- **App**: `apps/spec-sheet` — thin Vite + React app, the manual authoring + export surface. Runs
  fully offline; with a sidecar connected it also persists pending specs (`saveSpec`) and the shot
  (`putShot`) into `.specs/`. Never bundled into the extension. Walkthrough: `docs/spec-sheet-authoring.md`.
- **Schema**: `Spec.fingerprint` optional (absent ⇒ pending), plus a new `ShotConfig`/`ShotItem`
  entity. Both additive, backward compatible. See `docs/schema-reference.md`.
- **Sidecar**: `GET /shots`, `GET/PUT/DELETE /shots/{screenId}` under `.specs/shots/` (charset- and
  symlink-guarded `screenId`, 16 MiB body limit for the embedded screenshot, direct SSE broadcast on
  write since the `.specs/` watcher is non-recursive). `api-client` gained typed
  `listShots`/`getShot`/`putShot`/`deleteShot`.
- **Extension**: `@specpin/fingerprint-core` exports `isPinned(spec)`; the render loop and
  `matchElement` both skip pending specs rather than counting them as a failed match. `pageHealth()`
  gained a distinct `unpinned` bucket; the popup and side panel list pending specs read-only in a new
  **Unpinned** section, never on the host page.

### Phase 2 — Bind-later in the extension
- [ ] Extension action "Pin pending spec → this element": picker → `captureFingerprint` → write the
      fingerprint onto the existing pending spec (promote to pinned). Update pageHealth buckets/UI.
- [ ] (Optional) auto-suggest binding by `data-spec-id`/text when the FE ships anchors.

### Phase 3 — Auto screenshot track (later)
- [ ] Extension `captureVisibleTab` + gather `getBoundingClientRect` of matched specs → screen-capture
      bundle → `apps/spec-sheet` auto-places boxes. `activeTab` permission; visible-viewport first.

### Phase 4 — Retire specshot standalone
- [ ] Once the packages + app cover manual authoring, bind-later, and export with tests green,
      **delete the standalone specshot project**; migrate contract notes into `spec-schema` + this doc.

## Risks / watch
- **Core-model change is the heaviest risk** — `fingerprint` optional touches match, pageHealth,
  extension, Go validator, published types. Land it as its own well-tested change; keep it
  additive-optional so existing pinned specs are untouched.
- Anti-bloat discipline: reject any PR putting the editor in the extension bundle or pixels in `Spec`.
- Toolchain stays whatever the monorepo already runs — do not couple a TS/Vitest upgrade to this work.
- Product positioning: spec-first lifecycle is an expansion of specpin's story — communicate it so it
  reads as "specs earlier in the lifecycle," not scope creep.

## Success metrics
- A non-dev authors a **pending spec** from a screenshot with no app/sidecar running, and exports an
  HTML/MD spec sheet for the screen.
- A dev later **binds** that pending spec to a real element in the extension; it becomes a normal
  pinned spec and matches live.
- Extension bundle size not materially increased; `core`/`cli`/`fingerprint-core` deps unchanged;
  existing pinned specs keep validating (fingerprint-optional is backward compatible).

## Open questions — resolved (Phase 1)
- Represent pending as **absent fingerprint** (KISS) or an explicit `pinState` field? →
  **Resolved: absent fingerprint.** Implemented as-is; no `pinState` field added.
- Shot artifact: **app-local first** vs. promote to `spec-schema` SSOT now? →
  **Resolved: promoted to the SSOT now**, as `ShotConfig`/`ShotItem` in `packages/spec-schema/schema/v1.json`
  (not app-local), validated on both TS and Go, sidecar-served under `.specs/shots/`.
- Screenshot storage: embed vs. reference? → **Resolved: a `data:` URL is the v1 default** (embedded
  in the `ShotConfig.image` field); a relative path is also schema-valid but not the authoring default.
- Do pending specs appear in the extension's live surfaces (as an "unpinned" list), or only in
  `apps/spec-sheet` until bound? → **Resolved: yes** — a read-only **Unpinned** section in the popup
  and side panel (`pageHealth().unpinned`), distinct from **orphaned**. Never rendered on the host page.

## Open questions — still open (Phase 2+)
- Bind-later: manual picker only, or also auto-match by `data-spec-id`/text when anchors exist? Not
  yet designed in detail; Phase 2 has not started.
