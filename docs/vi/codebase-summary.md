# Tóm tắt Codebase

> Bản tiếng Việt của `docs/codebase-summary.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Monorepo Specpin (~4,620 LOC: 83 file TS, 17 file Go) hiện thực một lớp spec Git-native cho các web UI. Ba package (spec-schema, fingerprint-core, api-client), hai app (Go sidecar CLI, WXT browser extension), một demo.

## Package Dependencies

```
spec-schema (base, no deps)
  |
  +-> fingerprint-core (DOM fingerprinting)
  |     |
  |     +-> api-client (HTTP client over sidecar)
  |           |
  |           +-> extension (WXT MV3, Chrome+Firefox)
  |
  +-> cli (Go sidecar, embeds schema copy)
```

Tất cả package TS phụ thuộc `spec-schema` để lấy type. Extension phụ thuộc cả ba package TS. CLI nhúng một bản copy đã sync của `v1.json` (không bao giờ sửa tay).

## packages/spec-schema

**Purpose**: JSON Schema v1 SSOT + generated TS types + ajv validators.

**Key files:**
- `schema/v1.json` - schema chuẩn (130+ dòng), định nghĩa `Spec`, `SpecManifest`, `SpecFile`, `ViewsConfig`, `Fingerprint`, `MatchResult`.
- `src/schema.gen.ts` - generated ajv standalone validator (7,700+ dòng, không bao giờ sửa).
- `src/types.gen.ts` - generated TS types (3,100+ dòng, không bao giờ sửa).
- `src/validators.gen.cjs` - CJS ajv validator cho các consumer Node (49,900+ dòng, không bao giờ sửa).
- `src/validate.ts` - wrapper mỏng expose `validateSpec()`, `validateManifest()`, `validateViews()` (30+ dòng).
- `src/resolve-localized.ts` - prototype-safe `resolveLocalized()` / `resolveLocalizedList()` cho nội dung `LocalizedString` (locale -> defaultLocale -> fallback first present).
- `scripts/gen-types.ts` - codegen runner (json-schema-to-typescript + ajv standalone).
- `scripts/copy-gen-assets.ts` - copy `.gen.cjs` + `.gen.d.cts` sang dist sau build.
- `scripts/validate-fixtures.ts` - cross-validate fixtures (valid + invalid, specs + views) với schema.

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
- `src/match.ts` - `matchElement(fingerprint, root)` (90 dòng). Thử exact anchors trước (confidence 1.0), rồi unique cssSelector (0.7), nếu không thì `needsReview`. Trả về `MatchResult`.
- `src/selector.ts` - `buildCssSelector(element)` (98 dòng). Sinh selector tối ưu, ưu tiên class hơn nth-child khi unique.
- `src/xpath.ts` - `buildXPath(element)` (38 dòng). Đường dẫn dự phòng khi CSS mơ hồ.
- `src/detect-framework.ts` - `detectFramework()` (39 dòng). Heuristics cho React, Vue, Angular, Svelte.
- `src/generated-id.ts` - `isGeneratedId(id)` (49 dòng). Lọc các ID do framework sinh (pattern uuid, base64, hash).
- `src/css-escape.ts` - CSS identifier escaper (32 dòng). Xử lý ký tự đặc biệt trong selector.
- `src/index.ts` - barrel export (23 dòng).

**Test coverage**: Vitest với happy-dom. Coverage theo dõi qua `pnpm test:coverage`.

**Conventions:**
- Hàm thuần, không side effect.
- Tất cả export chỉ từ `index.ts`.
- Hình dạng `MatchResult` ổn định (confidence: number, element: Element | null, status: 'exact' | 'partial' | 'needsReview').

## packages/api-client

**Purpose**: Typed HTTP client trên REST contract của sidecar + SSE helper.

**Key files:**
- `src/client.ts` - class `SidecarClient` (200+ dòng). Methods: `ping()`, `getManifest()`, `listSpecs()`, `getSpec(id)`, `saveSpec(spec)`, `deleteSpec(id)`, `getViews()`, `putViews(views)`. Xử lý Bearer token, JSON serialization, error mapping.
- `src/events.ts` - class `SidecarEventSource` (74 dòng). SSE wrapper với exponential backoff (min 1s, max 30s, reset sau 5s ổn định). Phát `specsChanged`, `manifestChanged`, `error`.
- `src/errors.ts` - cây kế thừa `SidecarError` (42 dòng). `NotFoundError`, `ValidationError`, `UnauthorizedError`, `NetworkError`.
- `src/types.ts` - HTTP contract types (40+ dòng). Re-export từ spec-schema (`ViewsConfig`) + `SidecarConfig`, `ConnectionStatus`.

**Scripts:**
- `pnpm build` - chỉ tsc (không codegen).
- `pnpm test` - unit test cho client error handling, logic SSE reconnect.

**Conventions:**
- Tất cả API method trả về `Promise<T>`, throw `SidecarError` khi thất bại.
- SSE reconnect chỉ reset backoff sau 5s kết nối ổn định (fix M3 từ code review).

## apps/cli (Go sidecar)

**Purpose**: Localhost HTTP+SSE server expose `.specs/` với token auth.

**Module**: `specpin` (Go 1.26), dependencies: `cobra`, `gorilla/mux`, `gorilla/handlers`, `santhosh-tekuri/jsonschema/v6`, `fsnotify`.

**Structure:**
```
cmd/
  root.go       - cobra root command (33 lines)
  init.go       - `specpin init` scaffold manifest (62 lines)
  serve.go      - `specpin serve` entrypoint (115 lines)
  generate.go   - stub for 1.1 AI feature (19 lines)
internal/
  schema/
    schema.go   - embeds v1.json, exposes `ValidateSpec/Manifest/SpecFile/Views` (50+ lines)
    v1.json     - COPY of packages/spec-schema/schema/v1.json (synced via make)
  server/
    server.go   - HTTP handlers: CRUD + SSE hub + GET/PUT /views (340+ lines)
    middleware.go - token auth + CORS (89 lines)
    hub.go      - SSE broadcast hub (102 lines)
  store/
    store.go    - file-based spec store + views.json read/write (260+ lines, atomic, pretty JSON)
  watch/
    watch.go    - fsnotify watcher, triggers SSE (87 lines)
```

**Key flows:**
- `serve`: tự chọn port rảnh (hoặc --port), in URL+token, bind 127.0.0.1, khởi động HTTP+SSE, watch `.specs/`.
- `init`: tạo `.specs/manifest.json` với giá trị mặc định.
- Middleware: mọi request cần `Authorization: Bearer <token>`. CORS chỉ chấp nhận origin `chrome-extension://`, `moz-extension://`, `safari-web-extension://`. Từ chối web origin.
- Store: ghi giới hạn trong `.specs/`, path-traversal guard (fix review H1). File ops atomic (temp + rename). JSON pretty-printed (indent 2 space) cho Git diff sạch. `GET /views` trả về `.specs/views.json` hoặc default rỗng `{version:"1.0",hidden:[]}` khi không có; `PUT /views` validate rồi ghi.

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
    popup/            - view per-tab: status, specs, project list, language picker, filter UI
    sidepanel/        - docked surface (Chrome side_panel / Firefox sidebar_action)
    options/          - connection manager (add/remove/reconnect) + manual import + team views authoring
  background/
    sidecar-registry.ts   - map của các connection + danh sách manual-import batch; tổng hợp được gate theo origin (domains theo từng batch, dedupe id giữa các batch) + views threading
    sidecar-connection.ts - client + cache + SSE watch + team views cache của một project (được cô lập)
  content/
    orchestrator.ts   - vòng lặp match; thread locale + project label + visibility filtering vào renderer
    localize-spec.ts  - giải quyết text được localize của spec cho viewer locale
    capture-mode.ts   - element picker (Esc hủy qua callback)
    capture-form.ts   - soạn spec per-locale + target-project picker
    keyboard.ts       - shortcut handler
  renderers/
    registry.ts       - interface `SpecRenderer` + registry
    tooltip.ts / sidebar.ts / modal.ts - ba display mode đã hiện thực (tooltip: pin + open-in-panel)
  sources/
    registry.ts       - interface `SpecSource` + selection
    sidecar.ts        - SidecarSource adapter
    manual.ts / local-bundle.ts - read-only manual-import source + bundle parser
  shared/
    shadow.ts / html.ts        - cô lập Shadow DOM + safe HTML escaping
    messaging.ts               - protocol message được type (bao gồm OPEN_SPEC_IN_PANEL, SET_PERSONAL_VISIBILITY, SAVE_TEAM_VIEWS)
    connection-types.ts        - Connection / ConnectionStatus / TaggedSpec không phụ thuộc browser
    origin-match.ts            - matching origin/domain thuần (dùng chung bởi SW + popup)
    visibility.ts              - unified facet model: isVisible(spec, url, state), matchPathGlob
    config.ts                  - storage helper (connections, locale, enabled, danh sách manual-import batch + migration legacy, personal visibility)
```

**Key flows:**
- Background SW: một `SidecarRegistry` giữ N connection (mỗi cái có client + cache + team views cache + SSE watch riêng) cộng một danh sách manual-import batch (thêm khi import, xóa theo từng batch, clear tất cả; mọi mutation được serialize qua cùng writer `mutate()` như connection). `reestablish()` xây dựng lại chúng từ storage khi mỗi lần SW wake. `GET_SPECS_FOR_ORIGIN` trả về tổng hợp đã khớp origin, được tag theo project, đã filter theo visibility (xem `shared/visibility.ts`).
- Content script: khi load, hỏi BG lấy spec của origin (đã được visibility-filter). Với mỗi cái, `matchElement(fingerprint)`; render qua mode đang active (tooltip | sidebar | modal), giải quyết localized text cho viewer locale. Lắng nghe capture toggle, locale change, `SPECS_CHANGED`, và các thay đổi visibility state.
- Capture: picker highlight các element; khi click, form soạn title/description/rules per locale (và chọn một target project khi nhiều cái phục vụ page). Khi save, validate, POST tới connection đã chọn, reload.
- Renderers: hiện thực `SpecRenderer` (`render(spec, target, meta)`, `destroy()`); đọc localized text qua `localizeSpec`, và caption project khi nhiều hơn một đóng góp cho page. Tooltip renderer: click badge để pin tip mở (một lúc một cái), nút đóng, action "Open in side panel" highlight card side-panel tương ứng (best-effort auto-open trên Chrome, Firefox không thể mở sidebar lập trình).
- Sources: pluggable. Đã ship: `SidecarSource` + read-only Manual import. FileSystem Access hoãn lại.
- Visibility: `isVisible(spec, url, state)` gộp team defaults từ `.specs/views.json` (qua `GET /views`) và personal overrides từ `chrome.storage.sync`. `url:` page gate thắng tất cả; `spec:<id>` force-show là hard rescue. Filter UI (popup + side panel) cung cấp facet checklists (Tags / Files / This page) + per-spec eye toggle; Reset xóa personal overrides. Options page soạn team defaults (ghi qua `PUT /views`).

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

**Purpose**: App mẫu React 19 + Vite với `.specs/` đã seed để dùng thử ngay.

**Structure:**
```
src/
  App.tsx           - main component, login form + dashboard cards
  main.tsx          - React 19 entry
.specs/
  manifest.json     - v1 manifest (version, createdAt, updatedAt)
  login.spec.json   - spec for login form (email input, submit button)
  localhost.spec.json - spec for dashboard cards
```

**Key features:**
- Element được gắn `data-spec-id` để match chính xác.
- Spec đã seed được validate bởi CI schema job (chống lỗi thời).
- Chạy trên port 3000 (Vite dev server).

**Scripts:**
- `pnpm dev` - khởi động dev server.
- `pnpm build` - Vite build.

## Toolchain & CI

**Node/TS:**
- Node >= 20, pnpm 10.33, Turborepo 2.3.
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

3. **Thứ tự fingerprint matching**: (1) exact anchors (test-id, aria, id, data-spec-id) confidence 1.0, (2) unique cssSelector confidence 0.7, (3) nếu không thì `needsReview`. Hybrid weighted scorer hoãn sang 1.1 nhưng interface `MatchResult` ổn định.

4. **Sidecar security**: chỉ bind 127.0.0.1, token auth trên mọi request, CORS giới hạn ở extension origin, path-traversal guard khi ghi, không cho web origin truy cập.

5. **Extension style isolation**: mọi DOM injection qua shadow root. Không rò rỉ style vào/ra host page.

6. **Atomic spec writes**: temp file + rename. JSON pretty (indent 2) cho Git.

## LOC Breakdown (xấp xỉ)

| Area | LOC | Files |
|------|-----|-------|
| packages/spec-schema (viết tay) | ~650 | 6 TS + 3 scripts |
| packages/spec-schema (generated) | ~61,500 | 3 gen files |
| packages/fingerprint-core | ~550 | 9 TS |
| packages/api-client | ~350 | 4 TS |
| apps/cli | ~970 | 17 Go |
| apps/extension | ~2,100 | 35 TS |
| examples/demo-react-app | ~200 | 3 TS + 2 specs |
| **Tổng (source, không tính generated)** | **~4,820** | **83 TS + 17 Go** |

## Where Things Live

**Đổi schema**: sửa `packages/spec-schema/schema/v1.json`, chạy `pnpm --filter @specpin/spec-schema gen`, rồi `cd apps/cli && make sync-schema`.

**Logic fingerprint**: `packages/fingerprint-core/src/capture.ts` (capture signals), `match.ts` (thứ tự matching), `selector.ts` (tối ưu CSS).

**Sidecar HTTP handlers**: `apps/cli/internal/server/server.go` (CRUD endpoints + GET/PUT /views), `middleware.go` (auth+CORS), `hub.go` (SSE broadcast).

**Extension rendering**: `apps/extension/src/renderers/` (tooltip.ts, sidebar.ts, modal.ts), `content/orchestrator.ts` (match loop).

**Extension capture**: `apps/extension/src/content/capture-mode.ts` (picker), `capture-form.ts` (authoring form).

**Docs**: `docs/` (architecture, run-guide, schema-reference, design-system, file này).

**Plans**: `plans/260625-1504-specpin-phase1-mvp/` (8 phase files), `plans/reports/` (code review, brainstorm).

**CI**: `.github/workflows/ci.yml` (JS + Go jobs).
