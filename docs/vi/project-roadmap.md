# Lộ trình Dự án

> Bản tiếng Việt của `docs/project-roadmap.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Quá trình phát triển Specpin đi theo cách tiếp cận phân kỳ (phased): giao MVP có thể demo được trước, hoãn việc đánh bóng và các tính năng nâng cao sang 1.1+.

## Phase 1 MVP (Hoàn thành 2026-06-25)

Status: **DONE**. Cả 8 phase đã được implement, test và code-review. CI xanh. Bản review độc lập phát hiện 7 vấn đề (1 High, 4 Medium, 2 Low), tất cả High/Medium đã được giải quyết trước khi hoàn thành.

### Tính năng đã giao (Delivered Features)

**Core Infrastructure:**
- Khung monorepo (pnpm 10.33, Turborepo 2.3, Node >= 20, Go 1.26)
- JSON Schema v1 (SSOT) với TS types được sinh ra và ajv validators
- Go sidecar nhúng bản copy đã đồng bộ của schema, validate bằng `santhosh-tekuri/jsonschema/v6`
- CI cross-validate các fixture qua cả hai validator, fail khi schema drift

**Fingerprinting (chỉ exact match):**
- `captureFingerprint(element)` không phụ thuộc framework, thu thập: test-id anchors, aria, id không phải dạng generated, cssSelector, xpath, domPath, text, attrs, labels, position, framework hint
- `matchElement(fingerprint)` thử exact anchors trước (confidence 1.0), rồi đến cssSelector duy nhất (0.7), nếu không thì gắn cờ `needsReview`
- Thuộc tính `data-spec-id` đảm bảo exact match (khuyến nghị cho các element quan trọng)
- Pure DOM APIs, không gắn chặt với framework, test coverage 90%+

**Go Sidecar CLI:**
- `specpin init` tạo khung `.specs/manifest.json`
- `specpin serve` bind 127.0.0.1, tự chọn port trống, in token, expose CRUD + SSE
- Bảo mật: token auth trên mọi request, CORS giới hạn cho các extension origin (`chrome-extension://`, `moz-extension://`), guard chống path-traversal khi ghi, không cho phép web origin truy cập
- Ghi atomic (temp + rename), JSON được pretty-print (thụt 2 khoảng trắng) để Git diff sạch
- Watcher fsnotify kích hoạt SSE broadcast khi `.specs/` thay đổi

**Browser Extension (WXT MV3):**
- Build cho Chrome 120+ (MV3) và Firefox 115+ (tương thích MV2)
- Background SW: vòng đời `SidecarClient`, relay SSE tới content script
- Content script: fetch specs, match fingerprint, render qua interface `SpecRenderer` dạng pluggable
- Hai renderer: tooltip (xem nhanh khi hover) và sidebar (panel cố định liệt kê tất cả spec)
- Chế độ capture thủ công: click element, điền form (title, description, rules, tags), lưu vào `.specs/`
- Phím tắt: Ctrl+Shift+C bật/tắt chế độ capture
- Cô lập Shadow DOM cho mọi UI được inject (không rò rỉ style)

**Demo + Docs:**
- App demo React 19 + Vite với `.specs/` đã seed sẵn (manifest + 2 file spec)
- `docs/system-architecture.md` (55 dòng), `run-guide.md` (88 dòng), `schema-reference.md` (64 dòng), `design-system.md` (79 dòng)
- CI workflow (job JS + Go): lint, typecheck, test, build, schema-validate, schema-drift-check
- License: Apache-2.0

### Phân rã theo Phase (8 phase, đồ thị phụ thuộc)

1. **Monorepo Scaffold** (P1, 0.5d) - pnpm workspace, Turborepo, Biome (lint + format), Vitest, tsconfig.base.json
2. **Spec Schema** (P1, 0.5d, phụ thuộc 1) - `packages/spec-schema`: v1.json + types được sinh ra + ajv validators
3. **Fingerprint Core** (P1, 1.5d, phụ thuộc 1,2) - `packages/fingerprint-core`: capture + match (exact anchors + fallback cssSelector)
4. **Go Sidecar CLI** (P1, 2d, phụ thuộc 2) - `apps/cli`: init + serve (CRUD, SSE, token auth, CORS, schema validation)
5. **API Client** (P2, 1d, phụ thuộc 2,4) - `packages/api-client`: `SidecarClient` có kiểu (typed) + SSE helper với exponential backoff
6. **Extension Read-Only** (P2, 2d, phụ thuộc 3,5) - `apps/extension`: background SW + content script + popup + tooltip renderer (cột mốc demo được đầu tiên)
7. **Renderers and Capture** (P1, 2d, phụ thuộc 6) - sidebar renderer + chế độ capture + phím tắt + soạn spec thủ công
8. **Demo App Docs CI** (P2, 1d, phụ thuộc 6,7) - `examples/demo-react-app` + docs + CI (lint, test, build, schema cross-validation)

**Luồng phụ thuộc:**
- P1 (scaffold) -> P2 (schema) -> P3 (fingerprint)
- P2 -> P4 (CLI), P2 -> P5 (API client), P4 -> P5
- P3 + P5 -> P6 (extension read-only, demo đầu tiên)
- P6 -> P7 (capture + sidebar)
- P6 -> P8 (demo + docs + CI)

### Phát hiện từ Code Review (tất cả High/Medium đã giải quyết)

Review độc lập (`plans/reports/from-code-reviewer-to-orchestrator-specpin-mvp-review-report.md`):
- **0 Critical**
- **1 High** - H1: origin-match quá lỏng (spec rò rỉ sang các subdomain trông giống). Đã sửa: chỉ chấp nhận host khớp chính xác hoặc subdomain theo ranh giới label, đã thêm regression test.
- **4 Medium** - M1: capture crash trên các id do framework sinh ra (đã sửa: escape + guard việc tra cứu label). M2: SaveSpec có thể ghi đè manifest.json (đã sửa: bắt buộc hậu tố `.spec.json`). M3: SSE backoff reset khi kết nối chập chờn (đã sửa: chỉ reset sau 5s ổn định). M4: mutate config từ content script (đã sửa: từ chối trừ khi đến từ trang extension).
- **4 Low** - L2 (doc về watch), L3 (chặn pointerdown/mousedown trong capture) đã sửa. L1 (escape id trong xpath, chỉ stored), L4 (`:nth-of-type` keyed theo compound) được chấp nhận là rủi ro thấp.

### Số liệu (Metrics)

- **LOC**: ~4,820 source (83 file TS + 17 file Go), ~61,500 generated (ajv validators)
- **Test coverage**: fingerprint-core 90%+, các package khác có unit-test (Vitest + Go stdlib testing)
- **Build times**: TS workspace < 30s, Go CLI < 5s, extension < 20s
- **Bundle size**: content script của extension ~450 KB chưa nén (đã gồm ajv validator, dưới mục tiêu 500 KB)
- **Performance**: fingerprint match < 10ms (exact anchors), độ trễ render < 100ms

## Phase 1.1 (Đang thực hiện)

Mục tiêu: độ bền (robustness), tính linh hoạt, đánh bóng. Chưa cam kết timeline.

**Đã ship website (2026-06-29)**: trang landing marketing công khai cùng một bộ tài liệu dành cho người dùng cuối viết mới (EN + VI), dựng bằng Astro Starlight trong `apps/web`, hướng tới `specpin.ohnice.app` qua GitHub Pages (plan: `plans/260629-1348-specpin-landing-docs-site/`). Bộ `docs/` trong repo vẫn là tài liệu cho lập trình viên/người đóng góp, tách biệt với nội dung người dùng cuối của website.

**Đã ship lát cắt đầu tiên (2026-06-26)** trên nhánh `feat/spec-validate-cli-and-ci` (plan: `plans/260626-1415-specpin-phase-1-1/`):
- `specpin validate`: kiểm tra schema offline cho `.specs/` (exit 0 hợp lệ / 1 không hợp lệ / 2 không chạy được), chặn symlink trong store, cảnh báo drift của manifest.
- CI spec-lint: bước trong repo chạy trên demo specs + một composite action tái sử dụng, build validator từ ref đã pin (không phải PR của bên gọi).
- Manual spec source: hiển thị spec không cần sidecar bằng cách dán bundle `{ manifest, files }` đã validate trong Options; read-only, giới hạn kích thước, chặn prototype-pollution; controller chọn sidecar -> manual theo tính khả dụng.
- Modal renderer: hộp thoại giữa màn hình có bẫy focus liệt kê spec trên trang (chế độ hiển thị thứ ba), dọn dẹp bằng AbortController.

**Đã ship lát cắt thứ hai (2026-06-26)** trên nhánh `feat/i18n-specs-multi-project` (plan: `plans/260626-1555-i18n-specs-multi-project/`):
- Multi-language specs: `title`/`description`/`businessRules` là `LocalizedString` chỉ dạng object (đánh key theo locale; string phẳng bị từ chối bởi cả hai validator). Runtime language toggle trong popup (được phản chiếu trong sidebar) với fallback `defaultLocale` -> first-present; các bản dịch được soạn per locale trong form capture. Các giá trị `description` bây giờ không rỗng.
- Multi-project display: một extension kết nối tới nhiều sidecar cùng lúc qua một `SidecarRegistry`; spec định tuyến tới từng page theo `domains` của project, được tag theo project. Các project empty-`domains` cần một opt-in `applyToAllSites` rõ ràng (không match mọi site một cách im lặng). Cô lập token per-connection, cô lập lỗi, reconnect được jitter, và một tổng quát SW-wake watch re-establish (cũng sửa trường hợp latent single-connection). Trang Options bây giờ là một connection manager (add/remove/reconnect, view per-tab popup, project labels trên spec).

**Đã ship bề mặt side panel (2026-06-27)** trên nhánh `feat/extension-sidepanel-surface` (plan: `plans/260627-1119-extension-sidepanel-surface/`):
- Side panel (`entrypoints/sidepanel/`) là lựa chọn gắn cố định thay cho popup: layout rộng full-height, hiển thị description + business rules của spec ngay inline, tự refresh khi activate tab / đổi URL / `SPECS_CHANGED`. Popup và side panel dùng chung một helper `fetchSurfaceState()`. WXT map một entrypoint duy nhất sang Chrome `side_panel` + Firefox `sidebar_action`. Một tùy chọn `defaultSurface` được lưu (Options) chọn bề mặt mở khi click icon trên Chrome; Firefox giữ popup trên nút thanh công cụ và mở sidebar từ nút gốc của nó.

**Đã ship spec visibility toggle + tooltip UX (2026-06-27)** trên nhánh `feat/spec-visibility-toggle` (plan: `plans/260627-1348-spec-visibility-toggle-tooltip-ux/`):
- Cải tiến tooltip renderer: sửa full-width (`min(360px, 90vw)`); click badge để ghim tip mở (mỗi lần một cái, nút đóng); hành động "Open in side panel" highlight card side-panel tương ứng (best-effort auto-open trên Chrome, Firefox giảm xuống chỉ highlight). Các message mới `OPEN_SPEC_IN_PANEL` (content sang background) và `HIGHLIGHT_SPEC` (background sang side panel).
- Mô hình facet thống nhất cho spec visibility: mỗi spec được các facet key `tag:<t>`, `file:<file>`, `spec:<id>`; `url:<glob>` là cổng cấp page. Một predicate `isVisible(spec, url, state)` trong `apps/extension/src/shared/visibility.ts` quyết định render. Path glob matcher: `*` = một segment, `**` = qua nhiều segment.
- Chuỗi đồng bộ hai lớp: `effectiveDisabled = (teamHidden union personalForceHide) minus personalForceShow`. Mặc định team từ `.specs/views.json` (commit vào Git, chia sẻ, soạn qua trang Options, ghi qua sidecar `PUT /views`). Ghi đè cá nhân trong `chrome.storage.sync` (cross-machine, personal thắng). `spec:<id>` force-show là một rescue cứng theo per-spec (thắng trên tag/file hide); `url:` page gate thắng trên tất cả. Trạng thái rỗng = tất cả hiển thị (tương thích ngược).
- Filter UI: checklist facet (Tags / Files / This page) trong popup + side panel; toggle mắt per-spec trong side panel; Reset xóa ghi đè cá nhân. Soạn team trên trang Options (per connection, editor dòng facet-key).
- Schema: entity `ViewsConfig` mới trong `packages/spec-schema/schema/v1.json` = `{ version: string, hidden: string[] }`. Type TS được sinh ra + validator `validateViews`; Go `ValidateViews`; fixture cross-validate tại `tests/fixtures/views/{valid,invalid}` trên cả ajv và Go.
- Sidecar: `GET /views` mới (trả về `.specs/views.json` hoặc mặc định rỗng `{version:"1.0",hidden:[]}` khi không có) và `PUT /views` (validate schema, atomic, pretty-print, confined `.specs/`). Watcher `.specs/` hiện có đã fire SSE khi ghi `views.json`.
- api-client: `SidecarClient.getViews()` / `putViews()`, type `ViewsConfig` được export.
- Message privileged mới: `SET_PERSONAL_VISIBILITY`, `SAVE_TEAM_VIEWS` (thêm vào `PRIVILEGED_MESSAGE_TYPES`). `OPEN_SPEC_IN_PANEL` là non-privileged (read-only, từ content script).

Hoãn lại từ các lát cắt này, chờ corpus thực tế / phản hồi sử dụng: hybrid weighted scorer (cần corpus DOM trước/sau để tinh chỉnh), nguồn FileSystem Access, renderer overlay + inline-badge, và extension VSCode.

**Đã ship theme có thể chọn bởi người dùng (2026-06-28)** trên nhánh `feat/extension-theme-and-i18n` (plan: `plans/260628-0028-extension-theme-and-i18n/`):
- Tùy chọn theme (System / Light / Dark) qua trang Options. Trước đây dark chỉ tồn tại đằng sau `@media (prefers-color-scheme: dark)` (tự động, không có toggle). Giờ người dùng có thể force một theme. Generator phát ra bốn block selector trong `tokens.gen.css`: `:root` (shared + light), `:root[data-theme="dark"]` (forced dark), `:root[data-theme="light"]` (forced light), và `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="dark"]) { ... } }` (system default, chỉ áp dụng khi không có override). `tokens.ts` `scopeTokensToShadow()` đổi tất cả bốn dạng sang `:host(...)` cho Shadow DOM renderer. `src/shared/theme.ts` export `Theme`, `applyTheme(el, theme)`, `applyStoredTheme()`, `watchThemeChanges()`. `config.ts` có thêm `getTheme`/`setTheme` (key storage.local `specpin:theme`, mặc định `system`). Lan truyền trực tiếp: message `SET_THEME` + helper `broadcastToTabs()`; Options broadcast sang tất cả tab, các page phản ứng qua `storage.onChanged`. `theme` được thread vào `renderSession` và mỗi renderer áp dụng nó lên shadow host của nó. Forced theme có thể nhấp nháy System default trong một frame khi load (đọc storage bất đồng bộ, được chấp nhận).

**Đã ship i18n cho UI-chrome (EN + VI) (2026-06-28)** trên cùng nhánh `feat/extension-theme-and-i18n`:
- Runtime `t(key, params)` tùy chỉnh trong `apps/extension/src/i18n/` (`index.ts` export `t`, `initI18n`, `plural`, `hydrateI18n`, `watchUiLocaleChanges`; `locales.ts` định nghĩa `SUPPORTED=["en","vi"]`, `UiLocale`, `resolveUiLocale`; `messages/en.ts` là source of truth, ~115 key; `messages/vi.ts` được type theo `keyof Messages` để đảm bảo parity compile-time). Đây là một trục MỚI, ĐỘC LẬP với locale spec-content hiện có (`getLocale`/`setLocale`, `localize-spec.ts pickLocale`), cái đó không thay đổi. Ngôn ngữ UI-chrome = các nút/nhãn/banner của chính extension; locale spec-content = ngôn ngữ của text spec từ `.specs/`. Thứ tự resolution: stored `specpin:uiLocale` -> browser UI language -> "en". `config.ts` có thêm `getUiLocale`/`setUiLocale`. HTML tĩnh được địa phương hóa qua các attribute `data-i18n` / `data-i18n-placeholder` / `data-i18n-aria` / `data-i18n-title` / `data-i18n-html` được hydrate bởi `hydrateI18n`. Trang Options có một điều khiển Language (System default / English / Tiếng Việt). Thay đổi broadcast `SET_UI_LOCALE` sang các tab và render lại tại chỗ qua `renderAll()`; popup/side panel đang mở render lại qua `watchUiLocaleChanges` (storage.onChanged). Ngoài phạm vi: localizing tên/mô tả manifest, RTL, định dạng số/ngày nhận biết locale, ngôn ngữ ngoài EN+VI. Chuỗi lỗi SW background vẫn là tiếng Anh (không phải bề mặt i18n).

### Tính năng đã lên kế hoạch

**Hybrid Weighted Fingerprint Scoring:**
- Matcher tính điểm theo trọng số đa tín hiệu: khi exact anchors fail, chấm điểm cssSelector + xpath + domPath + text + labels + position + attrs với các hệ số đã tinh chỉnh
- Ngưỡng confidence (0.0-1.0): trên ngưỡng -> render, dưới ngưỡng -> gắn cờ `needsReview`
- Thu thập các fixture DOM thực tế trước/sau trong quá trình dogfooding (corpus để tinh chỉnh trọng số)
- Interface `MatchResult` đã ổn định, scorer ghép vào mà không phá vỡ caller

**Các nguồn Spec bổ sung:**
- Manual import source (đã giao) (bundle `{ manifest, files }` read-only trong Options)
- Nguồn FileSystem Access API (browser hỏi quyền truy cập thư mục `.specs/`, không cần sidecar) (vẫn hoãn lại)
- Source registry đã pluggable (interface `SpecSource`)

**Các Renderer bổ sung:**
- Modal (đã giao) (centered dialog, dùng cho review tập trung)
- Overlay (modal toàn màn hình có backdrop) và inline badge (đánh dấu trực quan cạnh element) (vẫn hoãn lại)
- Renderer registry đã pluggable (interface `SpecRenderer`): tooltip + sidebar + modal đã hiện thực

**Hỗ trợ Safari:**
- Đóng gói extension cho Safari (đang chờ Apple làm rõ tính tương đương MV3 tính đến 2026-06)
- WXT tuyên bố hỗ trợ Safari, cần test + quy trình đóng gói

**AI-Assisted Capture (`specpin generate`):**
- Tích hợp LLM để soạn spec: chụp ảnh element, suy ra title/description/rules từ ngữ cảnh
- Lựa chọn model, thiết kế prompt, local vs cloud, quản lý key - tất cả chưa được chốt
- Lệnh stub đã tồn tại (`apps/cli/cmd/generate.go`), in ra "deferred to 1.1"

**Tối ưu hiệu năng:**
- Chuyển việc validate spec trước khi POST từ content script sang background SW (bỏ ~100 KB ajv khỏi content bundle, dời chi phí parse sang thread SW)
- Lazy-load renderer (code-split tooltip/sidebar/overlay, nạp khi dùng lần đầu)

**Đánh bóng UX:**
- Đóng gói web font (Inter, JetBrains Mono) dưới dạng asset `@font-face`; design system của UI được ship hiện tham chiếu chúng qua các fallback stack (`system-ui` / `ui-monospace`) nên không đảm bảo có typography theo branding khi máy thiếu font
- Cải thiện trực quan cho chế độ capture (chất lượng highlight, style form)
- UI tùy chỉnh phím tắt
- Cài đặt nâng cao cho trang options của extension

**Trải nghiệm Lập trình viên (Developer Experience):**
- Extension VSCode để soạn `.spec.json` (autocomplete schema, validation, preview)
- GitHub Action lint spec trong PR (validate tất cả `.specs/*.json` theo schema)
- Lệnh CLI `specpin validate` (kiểm tra schema offline, không cần serve)

## Khám phá Tương lai (Beyond 1.1, chưa cam kết)

**Tổng hợp spec đa repo (Multi-repo):**
- Tổng hợp spec từ nhiều repo (microservice, monorepo với các .specs/ riêng)
- Sidecar phục vụ hợp (union) các spec, extension fetch từ nhiều instance sidecar

**Phân tích spec (Spec analytics):**
- Theo dõi spec nào được xem, tần suất bao nhiêu, bởi ai (chỉ local, không telemetry)
- Nhận diện spec cũ kỹ (không được xem trong N tháng, gắn cờ để review)

**Tính năng cộng tác (Collaboration):**
- Bình luận trên spec (luồng review kiểu PR)
- Quy trình phê duyệt (spec cần được sign-off trước khi merge)
- Giải quyết xung đột (hai dev sửa cùng một spec, UI merge)

**Tích hợp với công cụ bên ngoài:**
- Liên kết issue Jira/Linear trong metadata của spec (click để mở ticket)
- Đồng bộ Notion/Confluence (hai chiều, spec phản chiếu các doc bên ngoài)
- Thông báo Slack khi spec thay đổi (kênh của team, opt-in)

**Hỗ trợ Mobile:**
- Plugin devtools React Native / Flutter (gắn spec vào element UI mobile)
- Quét mã QR để mở spec viewer trên thiết bị

**Versioning cho spec:**
- Theo dõi lịch sử spec (ai thay đổi gì, khi nào, vì sao)
- Chế độ xem diff giữa các phiên bản (giống Git blame cho spec)
- Rollback về phiên bản trước

**Template cho spec:**
- Điền sẵn các mẫu spec phổ biến (form validation, xử lý lỗi API, luồng auth)
- Template riêng cho team (định dạng acceptance criteria chung toàn công ty)

## Non-Goals (rõ ràng nằm ngoài phạm vi)

- **Sinh code từ spec** - Specpin là một lớp tri thức (knowledge layer), không phải code generator. Nó gắn doc vào các UI sẵn có, không tạo ra code ứng dụng.
- **SaaS backend** - local-first, Git-native, không khóa vào nhà cung cấp (no vendor lock-in). Sidecar chỉ chạy trên localhost.
- **Cộng tác đa người dùng thời gian thực** - không CRDT, không đồng bộ WebSocket ngoài việc reload qua SSE. Cộng tác thông qua Git PR.
- **Hỗ trợ ứng dụng mobile** (phase 1.1) - chỉ browser extension, mobile hoãn sang phần khám phá tương lai.
- **Sidecar hosted/cloud** - chỉ localhost trong MVP và 1.1, triển khai cloud hoãn sang phần khám phá tương lai.
- **Telemetry hoặc theo dõi sử dụng** - không analytics, không phone-home, không thu thập dữ liệu (local analytics trong phần khám phá tương lai, chỉ opt-in).

## Chiến lược Versioning

**Hiện tại**: v0.0.0 (pre-release, dogfooding nội bộ).

**Trước 1.0 (đã lên kế hoạch):**
- v0.1.0: bản release Phase 1 MVP (public lần đầu)
- v0.2.0: tính năng Phase 1.1 (hybrid scorer, nguồn FileSystem, Safari)
- v0.3.0+: thêm tính năng 1.1, đánh bóng, bugfix

**Tiêu chí 1.0 (chưa định nghĩa):**
- Hybrid fingerprint scorer được kiểm chứng trong production
- Hỗ trợ Safari được xác nhận
- 6+ tháng dogfooding không có bug Critical/High
- Tài liệu hoàn chỉnh (user guide, API reference, migration guide)
- Schema v1 ổn định (không có breaking change cho dòng 1.x)

**Sau 1.0:**
- Semantic versioning: MAJOR.MINOR.PATCH
- Breaking change (định dạng schema, API contract) -> bump MAJOR
- Tính năng mới (renderer, source, AI assist) -> bump MINOR
- Bugfix, hiệu năng, bảo mật -> bump PATCH

## Nhịp Release (chưa cam kết)

Dự kiến sau khi release public:
- **Minor releases**: mỗi 2-3 tháng (tính năng mới, không breaking)
- **Patch releases**: khi cần (hotfix, bảo mật, bug nghiêm trọng)
- **Major releases**: 12-18 tháng (breaking change, schema v2+)

## Phụ thuộc & Rủi ro (Dependencies & Risks)

**Tính ổn định của schema:**
- Rủi ro: breaking change cho định dạng v1.json làm vô hiệu các repo `.specs/` hiện có
- Giảm thiểu: schema v1 khóa lại sau 1.0, mọi release 1.x tương thích. v2 chỉ đi cùng major version bump và migration guide.

**Tính dễ vỡ của fingerprint:**
- Rủi ro: refactor phá vỡ match, spec trở thành mồ côi (orphaned)
- Giảm thiểu: hybrid weighted scorer ở 1.1, khuyến nghị thuộc tính `data-spec-id` cho các element quan trọng, cờ `needsReview` làm nổi các match mơ hồ.

**Thay đổi API của Extension:**
- Rủi ro: các thay đổi API manifest v3/v2 của Chrome/Firefox phá vỡ extension
- Giảm thiểu: WXT trừu tượng hóa khác biệt giữa các trình duyệt, theo dõi release note của Chrome/Firefox, test trên kênh beta.

**Schema drift giữa Go/TS:**
- Rủi ro: ajv và Go validator phân kỳ, chấp nhận các spec khác nhau
- Giảm thiểu: CI `make check-schema` + cross-validate các fixture qua cả hai, fail khi bất đồng.

**Xung đột port của Sidecar:**
- Rủi ro: port tự chọn đụng với các service localhost khác
- Giảm thiểu: tự chọn port trống (bind `:0`, đọc port được gán), retry khi thất bại, có sẵn override `--port`.

**Phình bundle size:**
- Rủi ro: content script vượt giới hạn kích thước của browser extension
- Giảm thiểu: hiện 450 KB dưới mục tiêu 500 KB, tối ưu 1.1 chuyển ajv sang SW (tiết kiệm ~100 KB).

## Nhật ký Quyết định (Decision Log)

| Ngày | Quyết định | Lý do |
|------|----------|-------|
| 2026-06-25 | Thu hẹp phạm vi MVP (hoãn nguồn FS/Manual, modal/overlay/badge, hybrid scorer, Safari, AI) | Giao end-to-end demo được nhanh hơn, kiểm chứng giá trị cốt lõi trước khi đánh bóng |
| 2026-06-25 | Ngôn ngữ CLI: Go (không phải Node) | Một binary tĩnh duy nhất, không phụ thuộc runtime, phù hợp cho localhost server hơn Bun/Deno |
| 2026-06-25 | Fingerprint: exact anchors + cssSelector trước, weighted scorer hoãn lại | MVP đủ cho demo, hybrid scorer cần corpus thực tế để tinh chỉnh |
| 2026-06-25 | Build extension: WXT | Trừu tượng hóa cross-browser (Chrome MV3 + Firefox MV2), hot-reload, DX hiện đại |
| 2026-06-25 | Test runner: Vitest (không phải node:test hay Jest) | Native với Vite, ghép tốt với WXT, story jsdom mạnh cho fingerprint-core |
| 2026-06-25 | Port sidecar: tự chọn port trống (không phải default cố định) | Tránh xung đột port lần chạy đầu, extension vốn đã đọc URL được dán |
| 2026-06-25 | Chế độ capture: chỉ thủ công (không AI assist trong MVP) | Giữ mọi công việc LLM ra khỏi MVP, không phụ thuộc model hay quản lý key |
| 2026-06-25 | License: Apache-2.0 | Quyết định khi hoàn thành Phase 1 (vốn là gate hoãn lại trong plan) |
| 2026-06-26 | Nội dung spec được localize là chỉ dạng object (`LocalizedString`), string phẳng không hợp lệ | Pre-release, không có corpus bên ngoài và không có cam kết tương thích; schema được sửa tại chỗ (vẫn `v1.json`, không fork `v2.json`, không bump version manifest). Một resolver đọc tất cả trường được localize |
| 2026-06-26 | Project empty-`domains` cần opt-in `applyToAllSites` rõ ràng | Một wildcard every-site im lặng sẽ rò rỉ spec của project vào các page không liên quan/kẻ tấn công; người dùng opt in per connection |
| 2026-06-26 | SW-suspend watch loss được sửa tổng quát (chia sẻ `reestablish()` cho 1 và N connection) | Cùng path phục vụ trường hợp single-connection, sửa một bug MV3 latent thay vì chỉ cái multi-connection mới |

## Tham chiếu (References)

- Plan: `plans/260625-1504-specpin-phase1-mvp/plan.md`
- Phase files: `plans/260625-1504-specpin-phase1-mvp/phase-*.md` (8 file)
- Code review: `plans/reports/from-code-reviewer-to-orchestrator-specpin-mvp-review-report.md`
- Architecture: `docs/system-architecture.md`
- Run guide: `docs/run-guide.md`
- Schema: `docs/schema-reference.md`
- Design system: `docs/design-system.md`
- Journal: `docs/journals/260625-specpin-phase1-mvp.md`
- Codebase summary: `docs/codebase-summary.md`
- Code standards: `docs/code-standards.md`
- PDR: `docs/project-overview-pdr.md`
