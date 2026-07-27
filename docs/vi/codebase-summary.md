# Tóm tắt Codebase

> Bản tiếng Việt của `docs/codebase-summary.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Monorepo Specpin triển khai một lớp spec Git-native cho các web UI. Sáu package (spec-schema, fingerprint-core, api-client, specshot-core, specshot-react, specshot-app), hai app (Go sidecar CLI, WXT browser extension - nay còn host luôn trang soạn specshot), một demo.

## Package Dependencies

```
spec-schema (base, no deps)
  |
  +-> fingerprint-core (DOM fingerprinting)
  |     |
  |     +-> api-client (HTTP client over sidecar)
  |           |
  |           +-> extension (WXT MV3, Chrome+Firefox; entrypoint specshot.html mount specshot-app)
  |
  +-> cli (Go sidecar, embeds schema copy)
  |
  +-> specshot-core (authoring headless: MarkDoc model, shot + pending-spec builders)
        |
        +-> specshot-react (UI editor presentational; react/react-dom là peerDeps)
              |
              +-> specshot-app (composition authoring: screen picker, spec form, export panel,
                    persist sidecar tùy chọn; react/react-dom là peerDeps)
                    |
                    +-> entrypoint specshot của extension (mount <SpecshotApp/> trong specshot.html)
```

Tất cả package TS phụ thuộc `spec-schema` để lấy type. Extension phụ thuộc `spec-schema`, `fingerprint-core`, `api-client`, và (chỉ cho bundle entrypoint `specshot` của nó) `specshot-app`. `packages/specshot-app` phụ thuộc `spec-schema`, `specshot-core`, `specshot-react`, và (để persist sidecar tùy chọn) `api-client` trực tiếp - nó cũng chạy hoàn toàn offline không cần sidecar. React chỉ nằm trong bundle `specshot.html`; content script vẫn không có React. CLI nhúng một bản copy đã sync của `v1.json` (không bao giờ sửa tay).

## packages/spec-schema

**Purpose**: JSON Schema v1 SSOT + generated TS types + ajv validators.

**Key files:**
- `schema/v1.json` - schema chuẩn (130+ dòng), định nghĩa `Spec`, `SpecManifest`, `SpecFile`, `ViewsConfig`, `GuidesConfig`, `RequiredConfig`, `Fingerprint`, `MatchResult`.
- `src/schema.gen.ts` - generated ajv standalone validator (7,700+ dòng, không bao giờ sửa).
- `src/types.gen.ts` - generated TS types (3,100+ dòng, không bao giờ sửa).
- `src/validators.gen.cjs` - CJS ajv validator cho các consumer Node (49,900+ dòng, không bao giờ sửa).
- `src/validate.ts` - wrapper mỏng expose `validateSpec()`, `validateManifest()`, `validateViews()`, `validateGuides()`, `validateRequired()` (40+ dòng).
- `src/resolve-localized.ts` - prototype-safe `resolveLocalized()` / `resolveLocalizedList()` cho nội dung `LocalizedString` (locale -> defaultLocale -> fallback first present).
- `scripts/gen-types.ts` - codegen runner (json-schema-to-typescript + ajv standalone).
- `scripts/copy-gen-assets.ts` - copy `.gen.cjs` + `.gen.d.cts` sang dist sau build.
- `scripts/validate-fixtures.ts` - cross-validate fixtures (valid + invalid, specs + views + guides) với schema.

**Scripts:**
- `pnpm gen` - regenerate types + validators từ `v1.json`.
- `pnpm build` - gen + tsc + copy assets.
- `pnpm schema-validate` - chạy fixture validation (CI gate).

**Conventions:**
- Mọi generated file khớp pattern `*.gen.*` (bị Biome bỏ qua).
- Không bao giờ sửa tay generated file; luôn regenerate qua `pnpm gen`.

## packages/fingerprint-core

**Purpose**: Framework-agnostic DOM fingerprinting (capture + match), không phụ thuộc extension.

**Key files:**
- `src/capture.ts` - `captureFingerprint(element)` (145 dòng). Trích xuất anchors (test-id, aria, id, data-spec-id), cssSelector, xpath, domPath, text, attrs, labels, position, framework hint.
- `src/match.ts` - `matchElement(fingerprint, root)`. Exact anchors (1.0) -> unique cssSelector (0.7) -> hybrid scorer trên các hit css mơ hồ hoặc một tập candidate có giới hạn (`strategy:"scored"`), nếu không thì `needsReview`. Trả về `MatchResult` (thêm breakdown `signals` tùy chọn cho một scored match).
- `src/score.ts` - hybrid weighted scorer: bảng `WEIGHTS`/`THRESHOLDS`, `signalScores`, `rankCandidates`, `pickBest` (biên độ + không đưa ra kết quả khi không có signal nội dung), `generateCandidates` (tập có giới hạn). Tầng thận trọng HIGH>=0.85 / MID 0.6-0.85(needsReview) / còn lại no-match.
- `src/selector.ts` - `buildCssSelector(element)` (98 dòng). Sinh selector tối ưu, ưu tiên class hơn nth-child khi unique.
- `src/xpath.ts` - `buildXPath(element)` (38 dòng). Đường dẫn dự phòng khi CSS mơ hồ.
- `src/detect-framework.ts` - `detectFramework()` (39 dòng). Heuristics cho React, Vue, Angular, Svelte.
- `src/generated-id.ts` - `isGeneratedId(id)` (49 dòng). Lọc các ID do framework sinh (pattern uuid, base64, hash).
- `src/css-escape.ts` - CSS identifier escaper (32 dòng). Xử lý ký tự đặc biệt trong selector.
- `src/pinned.ts` - type guard `isPinned(spec)` (`fingerprint != null`). Một spec không có fingerprint là PENDING (chưa gắn), được soạn trước khi có element liên kết; cả `matchElement` lẫn vòng lặp render của extension đều gate theo cái này thay vì coi fingerprint vắng mặt là một lần match thất bại.
- `src/index.ts` - barrel export (23 dòng).

**Test coverage**: Vitest với happy-dom. Coverage theo dõi qua `pnpm test:coverage`.

**Conventions:**
- Hàm thuần, không side effect.
- Tất cả export chỉ từ `index.ts`.
- Hình dạng `MatchResult` ổn định (confidence: number, element: Element | null, status: 'exact' | 'partial' | 'needsReview').

## packages/api-client

**Purpose**: Typed HTTP client trên REST contract của sidecar + SSE helper.

**Key files:**
- `src/client.ts` - class `SidecarClient` (200+ dòng). Methods: `health()`, `getSpecs()`, `saveSpec(file, spec)`, `updateSpec(id, spec)`, `deleteSpec(id)`, `getViews()`, `putViews(views)`, `getGuides()`, `putGuides(guides)`, `getFlows()`, `putFlows(flows)`, `getScreens()`, `putScreens(screens)`, `listShots()`, `getShot(screenId)`, `putShot(shot)`, `deleteShot(screenId)`, `subscribe(onChange, options)`. Xử lý Bearer token, JSON serialization, error mapping.
- `src/events.ts` - class `SidecarEventSource` (74 dòng). SSE wrapper với exponential backoff (min 1s, max 30s, reset sau 5s ổn định). Phát `specsChanged`, `manifestChanged`, `error`.
- `src/errors.ts` - cây kế thừa `SidecarError` (42 dòng). `NotFoundError`, `ValidationError`, `UnauthorizedError`, `NetworkError`.
- `src/types.ts` - HTTP contract types (40+ dòng). Re-export từ spec-schema (`ViewsConfig`, `ShotConfig`, `ShotItem`) + `SidecarConfig`, `ConnectionStatus`.

**Scripts:**
- `pnpm build` - chỉ tsc (không codegen).
- `pnpm test` - unit test cho client error handling, logic SSE reconnect.

**Conventions:**
- Tất cả API method trả về `Promise<T>`, throw `SidecarError` khi thất bại.
- SSE reconnect chỉ reset backoff sau 5s kết nối ổn định (fix M3 từ code review).

## packages/specshot-core

**Purpose**: Authoring core headless, framework-free cho specshot (soạn thủ công bằng chú thích screenshot). MarkDoc model + đánh số, canvas viewport/interaction geometry, phát hiện shape SVG best-effort, export string builders, và hai bridge sang schema. Chỉ phụ thuộc `@specpin/spec-schema`.

**Key files:**
- `src/model/mark-doc.ts` - type `MarkDoc`/`MarkItem`, `parseMarkDoc`/`serializeMarkDoc`/`validateMarkDoc`, pattern `ItemNo` phân cấp + validate.
- `src/model/numbering.ts` - `compareItemNo`, `nextItemNo`, `readingOrderSort`, `reindexFlat`/`reindexHierarchical`.
- `src/canvas/viewport.ts` - transform pan/zoom (`Viewport`, `imageToScreen`/`screenToImage`, `zoomAt`, `panBy`, `fitToContainer`, `clampScale`).
- `src/canvas/interactions.ts` - geometry drag/resize box (`applyDrag`, `applyResize`, `normalize`, `clampToImage`, `defaultBoxAt`).
- `src/detect/` - tự phát hiện shape SVG best-effort: `svg-geometry.ts` (parse SVG an toàn + detect), `cluster.ts` (gom cụm box), `path-bbox.ts` (bbox của path), `image-source.ts` (load image-source).
- `src/export/` - export builders: `to-json.ts` / `to-legend.ts` / `to-svg.ts` (export string MarkDoc), `spec-sheet-data.ts` / `spec-sheet-html.ts` / `spec-sheet-md.ts` (bộ export spec sheet - ảnh + callout đánh số + spec đầy đủ mỗi số, dạng HTML hoặc MD), `draw-annotations.ts` / `draw-style.ts` (vẽ annotation trên canvas), `download.ts` (helper tải Blob).
- `src/shot/build-shot.ts` - `buildShot(doc, options)`: một MarkDoc + map itemNo->specId + screenId, validate thành một `ShotConfig`.
- `src/spec/build-pending-spec.ts` - `buildPendingSpec(options)`: nội dung soạn (title/description/businessRules/tags đã localize), validate thành một `Spec` pending (bỏ fingerprint).
- `src/state/marks-reducer.ts` - `marksReducer` + `MarkAction`/`ReindexMode`, state machine MarkDoc của editor.
- `src/index.ts` - barrel export.

**Conventions:**
- Zero React, zero phụ thuộc extension; hàm thuần trên các data shape MarkDoc/ShotConfig/Spec.
- Tọa độ pixel (`bbox`) chỉ nằm trong `ShotItem`/`MarkItem`, không bao giờ copy vào `Spec` mà box đó mô tả (bất biến chống bloat; xem `docs/specshot-integration.md`).

## packages/specshot-react

**Purpose**: UI editor React presentational cho việc soạn specshot - canvas viewport + pointer interaction, toolbar, item list, phím tắt. Không giữ business state: render và forward `MarkAction`/callback, mọi logic geometry/đánh số/export đến từ `specshot-core`. `react`/`react-dom` là peerDependencies.

**Key files:**
- `src/canvas/editor-canvas.tsx` - `EditorCanvas`, canvas ảnh + mark.
- `src/canvas/marks-layer.tsx` - `MarksLayer`, render các box đánh số trên canvas.
- `src/canvas/use-editor-interactions.ts` - hook `useEditorInteractions` + type `Tool` (select/draw/pan).
- `src/ui/toolbar.tsx` - `Toolbar` (đổi tool, reindex mode).
- `src/ui/item-list-panel.tsx` - `ItemListPanel` (danh sách item đánh số, select/delete).
- `src/ui/empty-state.tsx` - `EmptyState` (placeholder khi chưa có ảnh).
- `src/ui/use-keyboard-shortcuts.ts` - hook `useKeyboardShortcuts`.
- `src/index.ts` - barrel export.

**Conventions:**
- Chỉ presentational: không có logic fetch/persist/export (nằm ở composition dùng nó, `packages/specshot-app`).

## packages/specshot-app

**Purpose**: Composition React dùng chung (`@specpin/specshot-app`) cho việc soạn thủ công + export specshot - bề mặt "spec-first": tải lên một screenshot, vẽ/đánh số box, soạn một `Spec` pending cho mỗi box (title/description/rules đã localize) hoặc tham chiếu một `specId` có sẵn, rồi export một spec sheet (ảnh + callout đánh số + spec đầy đủ mỗi số) dạng HTML hoặc MD. Chạy hoàn toàn **offline** (không cần sidecar); khi có sidecar kết nối, nó còn persist các spec pending (`saveSpec`) và shot artifact (`putShot`) vào `.specs/`. Được host dưới dạng trang `specshot.html` của extension (`apps/extension/src/entrypoints/specshot/`) - entrypoint đó là consumer duy nhất; `react`/`react-dom` là peerDependencies.

**Key files:**
- `src/specshot-app.tsx` - `SpecshotApp`, composition root: nối editor `specshot-react` với các module authoring/persist/export của package này. Chỉ orchestration; không có domain logic ở đây (đánh số, validate, dựng string đều đến từ `specshot-core`/`spec-schema`).
- `src/authoring/spec-form.tsx` - form theo box, soạn một Spec pending, hoặc tham chiếu một `specId` có sẵn.
- `src/authoring/screen-picker.tsx` - chọn/tạo `Screen` (từ `screens.json`) mà shot thuộc về.
- `src/export/export-panel.tsx`, `use-export-handlers.ts`, `export-actions.ts` - export spec sheet (HTML/MD, qua builder của `specshot-core`) + tải về.
- `src/persist/use-sidecar.ts`, `use-sidecar-catalog.ts`, `sidecar-panel.tsx` - kết nối sidecar tùy chọn qua `@specpin/api-client` (`saveSpec` cho spec pending, `putShot` cho shot artifact); app vẫn chạy được khi không nối gì cả.
- `src/state/editor-store.ts` - `useEditorStore`, state MarkDoc (dựng trên `marksReducer` của `specshot-core`).
- `src/index.ts` - barrel export (`SpecshotApp`); `./app.css` là export riêng cho stylesheet dùng chung.

**Build:**
- `pnpm build` - `tsc` (build thư viện, được bundler của extension tiêu thụ).
- `pnpm test` - Vitest.

**Conventions:**
- Composition root chỉ orchestration; mọi rule đánh số/validate/export đến từ `@specpin/specshot-core` / `@specpin/spec-schema`.
- Consumer duy nhất là entrypoint `specshot` của extension (`apps/extension/src/entrypoints/specshot/main.tsx`), mount `<SpecshotApp/>` bên trong `specshot.html`. React không bao giờ lọt vào content script; xem `docs/specshot-integration.md` và `docs/system-architecture.md`.

## apps/cli (Go sidecar)

**Purpose**: Localhost HTTP+SSE server expose `.specs/` với token auth.

**Module**: `specpin` (Go 1.26), dependencies: `cobra`, `gorilla/mux`, `gorilla/handlers`, `santhosh-tekuri/jsonschema/v6`, `fsnotify`.

**Structure:**
```
cmd/
  root.go       - cobra root command (33 lines)
  init.go       - `specpin init` scaffold manifest (62 lines)
  serve.go      - entrypoint `specpin serve`: --port/--host/--token, mặc định loopback + cảnh báo khi không phải loopback
  report.go     - `specpin report` kiểm tra freshness/stats/required của spec cho các CI gate (điều kiện --fail-on, output --json)
  generate.go   - stub: trỏ người dùng tới skill soạn spec bằng AI (không có LLM)
skill/          - nguồn chuẩn của skill @specpin/cli (SKILL.md + references/) dạy
                  một coding agent soạn spec; xem docs/ai-authoring.md
npm/
  skill/        - bản copy đồng bộ, đóng gói vào tarball npm; sync-skill.mjs còn đồng bộ sang
                  đích thứ hai, plugin Claude Code ở repo-root plugins/specpin/skills/specpin/
                  (xem docs/ai-authoring.md); cả hai bản copy đều drift-gate bằng sync-skill.mjs --check
internal/
  schema/
    schema.go   - embeds v1.json, exposes `ValidateSpec/Manifest/SpecFile/Views/Guides/Required` (50+ lines)
    v1.json     - COPY of packages/spec-schema/schema/v1.json (synced via make)
  server/
    server.go   - HTTP handlers: CRUD + SSE hub (kèm heartbeat ~20s) + GET/PUT /views + GET/PUT /guides + GET /shots, GET/PUT/DELETE /shots/{screenId} (370+ lines). PUT shot chấp nhận body lớn hơn (16 MiB, cho screenshot embed) và bắn SSE trực tiếp vì watcher `.specs/` không đệ quy nên không quan sát thư mục con `shots/`. ETag trên GET /specs + If-Match 409 khi ghi spec đã cũ
    middleware.go - token auth + CORS (89 lines)
    hub.go      - SSE broadcast hub (102 lines)
  store/
    store.go       - file-based spec store + views.json + guides.json read/write (300+ lines, atomic, pretty JSON; ghi được serialize qua sync.Mutex + optimistic concurrency bằng bundle ETag/If-Match)
    store_shots.go - CRUD shot per-screenId (`ListShots`/`ReadShot`/`WriteShot`/`DeleteShot`) dưới `.specs/shots/<screenId>.shot.json`; guard charset + guard symlink cho screenId, atomic pretty JSON
  watch/
    watch.go    - fsnotify watcher, triggers SSE (87 lines)
```

**Key flows:**
- `serve`: giải quyết token (--token / SPECPIN_TOKEN / random), tự chọn port rảnh (hoặc --port), bind `--host` (mặc định loopback; nếu không phải loopback thì in cảnh báo về việc lộ ra mạng + hướng dẫn dùng HTTPS-proxy), in URL+token, khởi động HTTP+SSE, watch `.specs/`. Cách dùng từ xa được mô tả trong run-guide ("Serve on a remote machine"): dùng HTTPS qua reverse proxy, còn binary Go giữ nguyên HTTP thuần.
- `init`: tạo `.specs/manifest.json` với giá trị mặc định.
- Middleware: mọi request cần `Authorization: Bearer <token>`. CORS chỉ chấp nhận origin `chrome-extension://`, `moz-extension://`, `safari-web-extension://`. Từ chối web origin.
- Store: ghi giới hạn trong `.specs/`, path-traversal guard (fix review H1). File ops atomic (temp + rename). JSON pretty-printed (indent 2 space) cho Git diff sạch. `GET /views` trả về `.specs/views.json` hoặc default rỗng `{version:"1.0",hidden:[]}` khi không có; `PUT /views` validate rồi ghi. `GET /guides` / `PUT /guides` phản chiếu điều này cho `.specs/guides.json` (default rỗng `{version:"1.0",guides:[]}`); spec scanner bỏ qua `guides.json` (không phải `*.spec.json`).
- Shots: `GET /shots` liệt kê screenId (danh sách rỗng khi không có `shots/`, không cần case đặc biệt 404); `GET/PUT/DELETE /shots/{screenId}` thao tác từng file `.specs/shots/<screenId>.shot.json`, schema-validated khi ghi, giới hạn trong `.specs/`.

**Makefile:**
- `make sync-schema` - cp schema từ packages/spec-schema.
- `make check-schema` - diff bản chuẩn vs bản embedded (CI gate).
- `make build` - sync-schema + go build -> bin/specpin.
- `make test` - go test ./...
- `make vet` - go vet ./...

**Conventions:**
- Go standard layout (cmd/, internal/, không có pkg/).
- Error được wrap kèm context (`fmt.Errorf("%w", err)`).
- Không có global state; server giữ toàn bộ state.
- Schema nhúng qua `//go:embed`, không bao giờ đọc từ disk lúc runtime.

## apps/extension (WXT MV3)

**Purpose**: Cross-browser extension (Chrome mv3, Firefox mv2) match + render specs.

**Framework**: WXT 0.20, webextension-polyfill 0.12.

**Structure:**
```
src/
  entrypoints/
    background.ts     - SW; sở hữu SidecarRegistry, định tuyến message, SW-wake re-establish
    content.ts        - vòng lặp match+render, locale state, capture flow
    popup/            - view per-tab: status, specs, project list, language picker, filter UI, danh sách Unpinned (spec pending) chỉ-đọc
    sidepanel/        - docked surface (Chrome side_panel / Firefox sidebar_action)
    options/          - connection manager (add/remove/reconnect) + manual import + rename/export per-batch + team views authoring + quản lý team-guides per-connection (liệt kê + xóa)
    specshot/         - trang soạn `specshot.html` (mở qua "Open spec sheet" ở popup/side panel); mount `<SpecshotApp/>` của `@specpin/specshot-app`, nơi duy nhất trong extension kéo vào React
  background/
    sidecar-registry.ts   - map của các connection + danh sách batch cục bộ (Manual); tổng hợp được gate theo origin (domains theo từng batch, dedupe id giữa các batch, tag `manual:<batchId>` theo từng batch) + views threading; `guidesForOrigin` (team guides: sidecar + local, tag theo origin) + `upsertGuide`/`deleteGuide` đọc-lại-trước-khi-ghi; `localTargetsForOrigin` (gate mục tiêu ghi được) + `manualBatchesForExport`
    sidecar-connection.ts - client + cache + SSE watch + team views cache + team guides cache của một project (tất cả trong một nhóm reload, được cô lập)
    context-menu.ts       - submenu "Specpin" của menu chuột phải: build/gate hiển thị/đổi tiêu đề + router onClicked (gửi PIN_ELEMENT / SHOW_SPEC_HERE / START_CAPTURE tới tab, tắt tại chỗ)
  content/
    orchestrator.ts   - vòng lặp match; thread locale + project label + visibility filtering vào renderer
    localize-spec.ts  - giải quyết text được localize của spec cho viewer locale
    capture-mode.ts   - element picker (Esc hủy qua callback)
    capture-form.ts   - soạn spec per-locale + bộ chọn "Save to" gắn nhãn theo loại (sidecar + local; định tuyến mục tiêu duy nhất; vô hiệu khi không dự án nào phục vụ trang)
    context-target.ts - helper thuần cho hành động chuột phải (guard element thuộc Specpin + duyệt ancestor đã match)
    toast.ts          - pill thông báo tạm thời trong shadow-DOM (vd "Show spec here" khi không có spec dưới con trỏ)
    keyboard.ts       - shortcut handler (gồm Alt+Shift+G start/stop tour guide mặc định)
    guide.ts          - GuideController: tour onboarding ở tầng page (spotlight overlay riêng + popover được neo, Prev/Next/Skip/Done, bàn phím, suspend + khôi phục phiên render, hard-stop khi spec đổi / SPA nav)
    resolve-guide.ts  - thuần: giải quyết step id của một guide -> các DOM element đã match (bỏ cái chưa giải quyết, giữ thứ tự) + thứ tự mặc định RT-H4
  renderers/
    registry.ts       - interface `SpecRenderer` + registry
    tooltip.ts / sidebar.ts / modal.ts - ba display mode đã triển khai (tooltip: pin + open-in-panel)
    launcher.ts       - pill nổi để mở lại, hiện khi một sidebar/modal đã ẩn thu gọn (host riêng theo mode, mở lại qua `onSetDismissed`)
  sources/
    registry.ts       - interface `SpecSource` + selection
    sidecar.ts        - SidecarSource adapter
    manual.ts / local-bundle.ts - nguồn cục bộ (Manual) + bundle parser (giờ còn ghi `group` mỗi file vào `fileGroups` cho export round-trip)
  shared/
    shadow.ts / html.ts        - cô lập Shadow DOM + safe HTML escaping
    theme.ts                   - Theme = "system"|"light"|"dark", applyTheme(el, theme), applyStoredTheme(), watchThemeChanges()
    messaging.ts               - protocol message được type (bao gồm OPEN_SPEC_IN_PANEL, SET_PERSONAL_VISIBILITY, SAVE_TEAM_VIEWS, SET_THEME, SET_UI_LOCALE, broadcastToTabs; tạo nội dung cục bộ: CREATE_LOCAL_PROJECT/RENAME_LOCAL_PROJECT (privileged), GET_WRITE_TARGETS, GET_EXPORT_BUNDLES (privileged); guides: GET_GUIDES_FOR_ORIGIN, GET_TEAM_GUIDES, START_GUIDE, SAVE_TEAM_GUIDE/SAVE_PERSONAL_GUIDE/DELETE_GUIDE (privileged))
    guide-editor.ts (+ .css)   - modal biên soạn dùng chung: name + description + include/sắp thứ tự các bước + bộ chọn Save-to (sidecar/local/personal), định tuyến SAVE_TEAM_GUIDE/SAVE_PERSONAL_GUIDE; lưu bản chỉnh sửa đang dở vào storage.session đánh key theo origin+guide-id (xóa khi đóng/lưu)
    draft-store.ts             - load/save/clearDraft trên storage.session (đặt namespace "specpin:draft:"); khôi phục input popup chưa gửi qua một lần blur-dismiss, tự xóa khi trình duyệt khởi động lại; no-op êm nếu storage.session không có
    guide-section.ts (+ .css)  - danh sách khởi chạy guide dùng chung (tour mặc định + Start/Edit/Delete per-guide + New) cho popup + side panel
    connection-types.ts        - Connection / ConnectionStatus / TaggedSpec / TaggedGuide không phụ thuộc browser; MANUAL_CONNECTION_ID giờ là id bare legacy/dành riêng
    local-id.ts                - prefix `manual:<batchId>` + predicate isLocalConnectionId / localBatchId / localConnId (thay cho các phép so sánh bằng tag bare)
    local-url.ts               - guard URL sidecar chỉ-localhost được tách ra (dùng chung bởi Options + add-project; guard SSRF/phishing)
    add-project.ts (+ .css)    - form inline "+ New project" dùng chung (Local qua CREATE_LOCAL_PROJECT, Sidecar qua ADD_CONNECTION); mount bởi popup + side panel; lưu input đang dở (bỏ token, RT-SA6) vào storage.session theo từng surface để popup bị đóng khôi phục lại được
    export-bundle.ts           - bundleToFiles(batch): dựng lại manifest.json + *.spec.json mỗi group (fileGroups, $schema, bỏ _file, tên file chống zip-slip)
    zip-store.ts               - bộ ghi zip STORE (không nén) không phụ thuộc + crc32
    download.ts / export-download.ts - tải về qua Blob object-URL + glue zip-và-tải (popup/panel/Options)
    origin-match.ts            - matching origin/domain thuần (dùng chung bởi SW + popup; statusServesOrigin là gate ghi/capture)
    visibility.ts              - unified facet model: isVisible(spec, url, state), matchPathGlob
    config.ts                  - storage helper (connections, locale, enabled, danh sách batch cục bộ + migration legacy, personal visibility, theme, uiLocale, personal guides trong storage.sync đánh key theo canonicalOrigin) + các mutator cục bộ thuần (createLocalBatch / upsertLocalSpec / removeLocalSpecById / renameLocalBatch / upsertLocalGuide / removeLocalGuide)
    surface-renderers.ts       - helper dùng chung cho popup/side panel: sourceBadge() (pill sidecar vs manual), setListControlsHidden() + render locale/filter có gate theo enabled (ẩn list controls khi Specpin off), noServingProject()/setSurfaceState() (điều khiển empty state khi không có dự án phục vụ trang và paused state khi Specpin off), giữ trạng thái đóng/mở của filter-group qua các lần rebuild
    surface-states.css         - các trạng thái toàn bề mặt dùng chung cho popup + side panel: empty state (không có dự án -> CTA tạo dự án; hai bước có hướng dẫn ở panel) + paused state (Specpin off -> panel "N spec đang ẩn"). body.no-project / body.paused thu gọn phần chrome thao tác spec bằng CSS
    provenance.ts              - render + logic provenance dùng chung cho cả 4 reader surface: các helper HTML-string (status badge, links qua classifyHref, "linked tests" mang tính khai báo, reviewed+stale) + resolveStalenessThreshold (chặn khoảng [1,3650], mặc định 90) + formatRelativeTime (Intl.RelativeTimeFormat) + PROVENANCE_CSS. provenanceSectionHtml(spec, opts) trả về "" cho một spec không có provenance (render legacy giống hệt từng byte)
    surface-data.ts            - lọc spec dùng chung: specMatchesQuery() (predicate title/file/tags/description); pageHealth() (bucket exact/scored/fuzzy/needsReview/orphaned/unpinned - `unpinned` đếm spec pending, tách riêng khỏi `orphaned` là spec có fingerprint nhưng match thất bại); helper danh sách pendingSpecs()/orphanedSpecs()
    drift-corpus.ts            - corpus khớp cục bộ (opt-in, mặc định TẮT): ring-buffer storage.local (cap 500), entry supervised + passive, lược bỏ free-text lúc ghi, export/clear JSON. Nạp qua RECORD_DRIFT / RECORD_DRIFT_PASSIVE không đặc quyền (background kiểm cổng opt-in)
  i18n/
    index.ts                   - runtime t(key, params), initI18n, plural, hydrateI18n, watchUiLocaleChanges
    locales.ts                 - SUPPORTED=["en","vi"], UiLocale, resolveUiLocale (stored -> browser UI -> "en")
    messages/en.ts             - source of truth, ~235 keys (gồm guide.* tour + chrome biên soạn)
    messages/vi.ts             - typed against keyof Messages để đảm bảo compile-time parity
```

**Key flows:**
- Background SW: một `SidecarRegistry` giữ N connection (mỗi cái có client + cache + team views cache + SSE watch riêng; mỗi cái có trường `enabled` tùy chọn, undefined = enabled, được gate tập trung tại `SidecarConnection.matchesOrigin`) cộng một danh sách manual-import batch (thêm khi import, xóa theo từng batch, clear tất cả; mọi mutation được serialize qua cùng writer `mutate()` như connection). `reestablish()` xây dựng lại chúng từ storage khi mỗi lần SW wake. `GET_SPECS_FOR_ORIGIN` trả về tổng hợp đã khớp origin, được tag theo project, đã filter theo visibility (xem `shared/visibility.ts`).
- Content script: khi load, hỏi BG lấy spec của origin (đã được visibility-filter). Với mỗi cái, `matchElement(fingerprint)`; render qua mode đang active (tooltip | sidebar | modal), giải quyết localized text cho viewer locale. Lắng nghe capture toggle, locale change, `SPECS_CHANGED`, và các thay đổi visibility state.
- Capture: picker highlight các element; khi click, form soạn title/description/rules per locale và chọn target project qua `GET_WRITE_TARGETS` (sidecar + local, gắn nhãn theo loại; mục tiêu duy nhất tự chọn; vô hiệu khi không cái nào phục vụ page). Khi save, validate rồi định tuyến theo connectionId: mục tiêu `manual:<batchId>` ghi vào `storage.local` (giới hạn origin + re-validate ở background), còn lại POST tới sidecar và reload.
- Xoá spec: một spec ghi được (sidecar hoặc cục bộ) có thể xoá từ tooltip đã ghim (`pin-delete`) hoặc spec card trong side panel (`spec-delete`) sau một hộp xác nhận nguy hiểm; `DELETE_SPEC` không đặc quyền + định tuyến theo origin (cùng mô hình tin cậy với `UPDATE_SPEC`), đi tới `registry.deleteSpec` (sidecar) hoặc `deleteLocalSpec` -> `removeLocalSpecById` (cục bộ, có kiểm tra `batchServesOrigin`); Delete ở side panel uỷ thác cho trang qua `DELETE_SPEC_HERE`.
- Tạo nội dung cục bộ: manual spec sửa được tại chỗ (tooltip + side-panel card, tái dùng `CaptureForm`); `+ New project` (popup/panel) tạo một dự án cục bộ hoặc kết nối sidecar; Export zip theo group per-batch (popup/panel + Options) dựng lại shape `.specs/` trên đĩa để round-trip qua re-import / `specpin serve`.
- Renderers: triển khai `SpecRenderer` (`render(spec, target, meta)`, `destroy()`); đọc localized text qua `localizeSpec`, và caption project khi nhiều hơn một đóng góp cho page. Tooltip renderer: click badge để pin tip mở (một lúc một cái), nút đóng, action "Open in side panel" highlight card side-panel tương ứng (best-effort auto-open trên Chrome, Firefox không thể mở sidebar lập trình).
- Sources: pluggable. Đã ship: `SidecarSource` + một nguồn cục bộ (Manual) ghi được (import, tạo trong extension, capture, sửa, export zip theo group). FileSystem Access hoãn lại.
- Visibility: `isVisible(spec, url, state)` gộp team defaults từ `.specs/views.json` (qua `GET /views`) và personal overrides từ `chrome.storage.sync`. `url:` page gate được ưu tiên hơn tất cả; `spec:<id>` force-show là hard rescue. Filter UI (popup + side panel) cung cấp facet checklists (Tags / Files / This page) + per-spec eye toggle; Reset xóa personal overrides. Options page soạn team defaults (ghi qua `PUT /views`).
- Spec pending: một spec được soạn không có fingerprint (ví dụ qua trang `specshot.html` của extension) không bao giờ render trên trang host - `isPinned` gate nó khỏi pipeline match/render trong `orchestrator.ts`, giống hệt `matchElement`. Popup và side panel thay vào đó liệt kê nó dạng chỉ-đọc trong mục **Unpinned** (`pageHealth().unpinned`), khác với **orphaned** (có fingerprint, không match được).

**Build:**
- `pnpm build` - WXT build cho chrome-mv3 -> `.output/chrome-mv3/`.
- `pnpm build:firefox` - WXT build -b firefox -> `.output/firefox-mv2/`.
- `pnpm zip` - đóng gói để upload lên store.

**Conventions:**
- Mọi DOM write qua shadow root (style isolation).
- Message passing được type qua union type của `messaging.ts`.
- Mutation config bị từ chối trừ khi đến từ extension page (fix review M4).
- Generated ID được escape trước khi chèn vào DOM (fix review M1).

## examples/demo-react-app

**Purpose**: App mẫu React 19 + Vite với `.specs/` đã seed để dùng thử ngay. Một "Acme CRM" nhiều màn hình nhỏ gọn để thử spec qua điều hướng thực tế.

**Structure:**
```
src/
  main.tsx          - React 19 entry (BrowserRouter + AuthProvider)
  App.tsx           - bảng route (login công khai; phần còn lại sau cổng auth)
  auth.tsx          - auth demo trong bộ nhớ (không backend)
  styles.ts         - token style inline dùng chung
  data.ts           - khách hàng/giao dịch CRM giả lập + số liệu dashboard suy ra
  components/        - Layout (nav + Outlet), RequireAuth (chốt chuyển hướng)
  screens/          - Login, Dashboard, Customers, CustomerDetail, Settings, NewDeal
.specs/
  manifest.json     - v1 manifest, liệt kê 5 file spec
  login.spec.json   - spec cho form đăng nhập
  dashboard.spec.json, customers.spec.json, settings.spec.json, deals.spec.json
```

**Key features:**
- Element được gắn `data-spec-id` để match chính xác (mỗi anchor một spec).
- Spec song ngữ (en/vi) trải các chế độ hiển thị tooltip/sidebar/modal.
- Điều hướng bằng `react-router-dom`; cổng auth trong bộ nhớ nhẹ (chỉ cho demo).
- Spec đã seed được validate bởi CI schema job (chống lỗi thời).
- Chạy trên port 3000 (Vite dev server).

**Scripts:**
- `pnpm dev` - khởi động dev server.
- `pnpm build` - Vite build.

## Toolchain & CI

**Node/TS:**
- Node >= 22, pnpm 11.9, Turborepo 2.10.
- TypeScript 5.7, strict mode + noUncheckedIndexedAccess.
- Biome 2 (`biome.json`): công cụ duy nhất cho lint + format + import organize. Lint = preset recommended cộng `noUnusedVariables` + `noUnusedImports`. Bỏ qua `*.gen.*`, `apps/cli/**`, `packages/spec-schema/schema/**`, và các path trong `.gitignore`.
- Format: space (2), lineWidth 100, double quotes, semicolons, trailingComma all (khớp config Prettier trước đó).
- Vitest 3 cho tất cả package TS (happy-dom cho các DOM test của fingerprint-core).

**Go:**
- Go 1.26, standard layout.
- Testing: package `testing` của stdlib.
- CI: `go vet`, `go test ./...`, `make build`, `make check-schema`.

**CI (.github/workflows/ci.yml):**
Hai job (JS, Go):

**JS job:**
1. pnpm install --frozen-lockfile
2. turbo run build
3. biome ci . (lint + format gate)
4. turbo run typecheck
5. turbo run test
6. turbo run schema-validate (cross-validate fixtures qua ajv)

**Go job (working-directory: apps/cli):**
1. make check-schema (fail nếu embedded v1.json bị drift)
2. go vet ./...
3. go test ./...
4. make build (sinh ra bin/specpin)

**Schema drift gate**: cả hai job phải pass. JS job validate fixtures qua ajv. Go job validate cùng fixtures đó qua Go validator + kiểm tra bản copy schema embedded khớp với nguồn chuẩn.

## File Naming Conventions

- File TS: kebab-case (`capture-mode.ts`, `sidecar-registry.ts`).
- File Go: snake_case theo quy ước Go stdlib (`server.go`, `middleware.go`).
- Generated file: pattern `*.gen.*` (`schema.gen.ts`, `validators.gen.cjs`), không bao giờ sửa.
- File test: `*.test.ts` (TS), `*_test.go` (Go).
- File config: lowercase (`biome.json`, `tsconfig.json`, `turbo.json`).

## Code Standards (suy ra từ config thực tế)

**TypeScript:**
- Strict mode, noUncheckedIndexedAccess, noImplicitOverride.
- Cho phép biến không dùng với tiền tố `_` (`argsIgnorePattern: "^_"`).
- ESM only (`"type": "module"` trong mọi package.json).
- Target ES2022, moduleResolution bundler.
- Composite projects, declaration + sourceMap.
- Mọi generated file bị lint/typecheck bỏ qua.

**Go:**
- CGO_ENABLED=0 cho binary tĩnh.
- go vet + go test trước khi build.
- Error được wrap kèm context.
- Không có global mutable state.
- Schema nhúng lúc compile (`//go:embed`).

**Git:**
- JSON pretty-printed (indent 2 space) cho diff sạch.
- Lock file được commit (pnpm-lock.yaml, go.sum).
- Generated file được commit (`.gen.*` trong packages/spec-schema/dist để publish npm).
- Bỏ qua `.output/`, `dist/`, `coverage/`, `.turbo/`.

## Key Invariants

1. **One schema, two validators**: `packages/spec-schema/schema/v1.json` là SSOT. Phía TS dùng ajv. Phía Go nhúng bản copy tại `apps/cli/internal/schema/v1.json`. `make sync-schema` đồng bộ. `make check-schema` là CI gate chống drift.

2. **Generated file không bao giờ sửa tay**: tất cả file `*.gen.*` được regenerate qua `pnpm --filter @specpin/spec-schema gen`. Biome bỏ qua chúng. Git track chúng (cho consumer không có bước build).

3. **Thứ tự fingerprint matching**: (1) exact anchors (test-id, aria, id, data-spec-id) confidence 1.0, (2) unique cssSelector confidence 0.7, (3) hybrid weighted scorer trên các hit mơ hồ/orphan (`strategy:"scored"`, match khi trên MID, `needsReview` khi dưới HIGH), nếu không thì `needsReview`. Interface `MatchResult` ổn định; `WEIGHTS` của scorer nằm trong `score.ts` (xem `docs/scorer-tuning.md`).

4. **Sidecar security**: chỉ bind 127.0.0.1, token auth trên mọi request, CORS giới hạn ở extension origin, path-traversal guard khi ghi, không cho web origin truy cập.

5. **Extension style isolation**: mọi DOM injection qua shadow root. Không rò rỉ style vào/ra host page.

6. **Atomic spec writes**: temp file + rename. JSON pretty (indent 2) cho Git.

## LOC Breakdown (xấp xỉ)

| Area | LOC | Files |
|------|-----|-------|
| packages/spec-schema (viết tay) | ~650 | 6 TS + 3 scripts |
| packages/spec-schema (generated) | ~61,500 | 3 gen files |
| packages/fingerprint-core | ~700 | 10 TS |
| packages/api-client | ~350 | 4 TS |
| apps/cli | ~970 | 17 Go |
| apps/extension | ~2,100 | 35 TS |
| examples/demo-react-app | ~770 | 13 TS + 5 specs |
| **Tổng (source, không tính generated)** | **~4,820** | **83 TS + 17 Go** |

## Where Things Live

**Đổi schema**: sửa `packages/spec-schema/schema/v1.json`, chạy `pnpm --filter @specpin/spec-schema gen`, rồi `cd apps/cli && make sync-schema`.

**Logic fingerprint**: `packages/fingerprint-core/src/capture.ts` (capture signals), `match.ts` (thứ tự matching), `selector.ts` (tối ưu CSS).

**Sidecar HTTP handlers**: `apps/cli/internal/server/server.go` (CRUD endpoints + GET/PUT /views + GET/PUT /guides + GET/PUT/DELETE /shots), `middleware.go` (auth+CORS), `hub.go` (SSE broadcast).

**Trang soạn specshot**: entrypoint `specshot.html` của extension (tải lên screenshot -> vẽ/đánh số box -> soạn spec pending -> export spec sheet dạng HTML/MD, persist sidecar tùy chọn), mở qua **Open spec sheet** ở popup/side panel. Composition ở `packages/specshot-app`, editor UI ở `packages/specshot-react`, mọi logic authoring/geometry ở `packages/specshot-core`.

**Guide mode**: `content/guide.ts` (runtime tour) + `content/resolve-guide.ts` (giải quyết bước), `shared/guide-editor.ts` + `guide-section.ts` (UI biên soạn + khởi chạy), các guide handler ở background trong `entrypoints/background.ts`, sidecar `/guides` trong `server.go`/`store.go`.

**Extension rendering**: `apps/extension/src/renderers/` (tooltip.ts, sidebar.ts, modal.ts), `content/orchestrator.ts` (match loop).

**Extension capture**: `apps/extension/src/content/capture-mode.ts` (picker), `capture-form.ts` (authoring form).

**Docs**: `docs/` (architecture, run-guide, schema-reference, design-system, file này).

**CI**: `.github/workflows/ci.yml` (JS + Go jobs).
