# Lộ trình Dự án

> Bản tiếng Việt của `docs/project-roadmap.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Specpin đã phát hành và đang được phát triển tích cực. Roadmap này ghi lại những gì đã ship và những gì dự kiến / đang cân nhắc làm tiếp.

## Bản phát hành đầu (2026-06-25)

Status: **DONE**. Bản end-to-end đầu tiên: đã implement, test và code-review. CI xanh. Bản review độc lập phát hiện 7 vấn đề (1 High, 4 Medium, 2 Low), tất cả High/Medium đã được giải quyết trước khi hoàn thành.

### Tính năng đã giao (Delivered Features)

**Core Infrastructure:**
- Khung monorepo (pnpm 11.9, Turborepo 2.10, Node >= 22, Go 1.26)
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

Phát hiện từ review độc lập:
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

## Sau bản phát hành đầu

Mục tiêu: độ bền (robustness), tính linh hoạt, đánh bóng. Chưa cam kết timeline.

**Đã ship website (2026-06-29)**: trang landing marketing công khai cùng một bộ tài liệu dành cho người dùng cuối viết mới (EN + VI + JA), dựng bằng Astro Starlight trong `apps/web`, hướng tới `specpin.ohnice.app` qua GitHub Pages. Bộ `docs/` trong repo vẫn là tài liệu cho lập trình viên/người đóng góp, tách biệt với nội dung người dùng cuối của website.

**Đã ship bản follow-up đầu tiên (2026-06-26)** trên nhánh `feat/spec-validate-cli-and-ci`:
- `specpin validate`: kiểm tra schema offline cho `.specs/` (exit 0 hợp lệ / 1 không hợp lệ / 2 không chạy được), chặn symlink trong store, cảnh báo drift của manifest.
- CI spec-lint: bước trong repo chạy trên demo specs + một composite action tái sử dụng, build validator từ ref đã pin (không phải PR của bên gọi).
- Manual spec source: hiển thị spec không cần sidecar bằng cách dán bundle `{ manifest, files }` đã validate trong Options; read-only, giới hạn kích thước, chặn prototype-pollution; controller chọn sidecar -> manual theo tính khả dụng.
- Modal renderer: hộp thoại giữa màn hình có bẫy focus liệt kê spec trên trang (chế độ hiển thị thứ ba), dọn dẹp bằng AbortController.

**Đã ship lát cắt thứ hai (2026-06-26)** trên nhánh `feat/i18n-specs-multi-project`:
- Multi-language specs: `title`/`description`/`businessRules` là `LocalizedString` chỉ dạng object (đánh key theo locale; string phẳng bị từ chối bởi cả hai validator). Runtime language toggle trong popup (được phản chiếu trong sidebar) với fallback `defaultLocale` -> first-present; các bản dịch được soạn per locale trong form capture. Các giá trị `description` bây giờ không rỗng.
- Multi-project display: một extension kết nối tới nhiều sidecar cùng lúc qua một `SidecarRegistry`; spec định tuyến tới từng page theo `domains` của project, được tag theo project. Các project empty-`domains` cần một opt-in `applyToAllSites` rõ ràng (không match mọi site một cách im lặng). Cô lập token per-connection, cô lập lỗi, reconnect được jitter, và một tổng quát SW-wake watch re-establish (cũng sửa trường hợp latent single-connection). Trang Options bây giờ là một connection manager (add/remove/reconnect, view per-tab popup, project labels trên spec).

**Đã ship giao diện side panel (2026-06-27)** trên nhánh `feat/extension-sidepanel-surface`:
- Side panel (`entrypoints/sidepanel/`) là lựa chọn gắn cố định thay cho popup: layout rộng full-height, hiển thị description + business rules của spec ngay inline, tự refresh khi activate tab / đổi URL / `SPECS_CHANGED`. Popup và side panel dùng chung một helper `fetchSurfaceState()`. WXT map một entrypoint duy nhất sang Chrome `side_panel` + Firefox `sidebar_action`. Một tùy chọn `defaultSurface` được lưu (Options) chọn giao diện mở khi click icon trên Chrome; Firefox giữ popup trên nút thanh công cụ và mở sidebar bằng nút bật/tắt sidebar sẵn có của trình duyệt.

**Đã ship spec visibility toggle + tooltip UX (2026-06-27)** trên nhánh `feat/spec-visibility-toggle`:
- Cải tiến tooltip renderer: sửa full-width (`min(360px, 90vw)`); click badge để ghim tip mở (mỗi lần một cái, nút đóng); hành động "Open in side panel" highlight card side-panel tương ứng (best-effort auto-open trên Chrome, Firefox giảm xuống chỉ highlight). Các message mới `OPEN_SPEC_IN_PANEL` (content sang background) và `HIGHLIGHT_SPEC` (background sang side panel).
- Mô hình facet thống nhất cho spec visibility: mỗi spec được các facet key `tag:<t>`, `file:<file>`, `spec:<id>`; `url:<glob>` là cổng cấp page. Một predicate `isVisible(spec, url, state)` trong `apps/extension/src/shared/visibility.ts` quyết định render. Path glob matcher: `*` = một segment, `**` = qua nhiều segment.
- Chuỗi đồng bộ hai lớp: `effectiveDisabled = (teamHidden union personalForceHide) minus personalForceShow`. Mặc định team từ `.specs/views.json` (commit vào Git, chia sẻ, soạn qua trang Options, ghi qua sidecar `PUT /views`). Ghi đè cá nhân trong `chrome.storage.sync` (cross-machine, ghi đè cá nhân được ưu tiên). `spec:<id>` force-show là một rescue cứng theo per-spec (được ưu tiên hơn tag/file hide); `url:` page gate được ưu tiên cao nhất. Trạng thái rỗng = tất cả hiển thị (tương thích ngược).
- Filter UI: checklist facet (Tags / Files / This page) trong popup + side panel; toggle mắt per-spec trong side panel; Reset xóa ghi đè cá nhân. Soạn team trên trang Options (per connection, editor dòng facet-key).
- Schema: entity `ViewsConfig` mới trong `packages/spec-schema/schema/v1.json` = `{ version: string, hidden: string[] }`. Type TS được sinh ra + validator `validateViews`; Go `ValidateViews`; fixture cross-validate tại `tests/fixtures/views/{valid,invalid}` trên cả ajv và Go.
- Sidecar: `GET /views` mới (trả về `.specs/views.json` hoặc mặc định rỗng `{version:"1.0",hidden:[]}` khi không có) và `PUT /views` (validate schema, atomic, pretty-print, confined `.specs/`). Watcher `.specs/` hiện có đã fire SSE khi ghi `views.json`.
- api-client: `SidecarClient.getViews()` / `putViews()`, type `ViewsConfig` được export.
- Message privileged mới: `SET_PERSONAL_VISIBILITY`, `SAVE_TEAM_VIEWS` (thêm vào `PRIVILEGED_MESSAGE_TYPES`). `OPEN_SPEC_IN_PANEL` là non-privileged (read-only, từ content script).

Dự kiến, chờ phản hồi sử dụng: nguồn FileSystem Access và extension VSCode.

**Đã ship theme có thể chọn bởi người dùng (2026-06-28)** trên nhánh `feat/extension-theme-and-i18n`:
- Tùy chọn theme (System / Light / Dark) qua trang Options. Trước đây dark chỉ tồn tại đằng sau `@media (prefers-color-scheme: dark)` (tự động, không có toggle). Giờ người dùng có thể force một theme. Generator phát ra bốn block selector trong `tokens.gen.css`: `:root` (shared + light), `:root[data-theme="dark"]` (forced dark), `:root[data-theme="light"]` (forced light), và `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="dark"]) { ... } }` (system default, chỉ áp dụng khi không có override). `tokens.ts` `scopeTokensToShadow()` đổi tất cả bốn dạng sang `:host(...)` cho Shadow DOM renderer. `src/shared/theme.ts` export `Theme`, `applyTheme(el, theme)`, `applyStoredTheme()`, `watchThemeChanges()`. `config.ts` có thêm `getTheme`/`setTheme` (key storage.local `specpin:theme`, mặc định `system`). Lan truyền trực tiếp: message `SET_THEME` + helper `broadcastToTabs()`; Options broadcast sang tất cả tab, các page phản ứng qua `storage.onChanged`. `theme` được thread vào `renderSession` và mỗi renderer áp dụng nó lên shadow host của nó. Forced theme có thể lóe qua System default trong một frame khi load (đọc storage bất đồng bộ, được chấp nhận).

**Đã ship i18n cho UI-chrome (EN + VI + JA) (2026-06-28)** trên cùng nhánh `feat/extension-theme-and-i18n`:
- Runtime `t(key, params)` tùy chỉnh trong `apps/extension/src/i18n/` (`index.ts` export `t`, `initI18n`, `plural`, `hydrateI18n`, `watchUiLocaleChanges`; `locales.ts` định nghĩa `SUPPORTED=["en","vi","ja"]`, `UiLocale`, `resolveUiLocale`; `messages/en.ts` là source of truth với 258 key; `messages/vi.ts` và `messages/ja.ts` được type theo `keyof Messages` để đảm bảo parity compile-time). Đây là một trục MỚI, ĐỘC LẬP với locale spec-content hiện có (`getLocale`/`setLocale`, `localize-spec.ts pickLocale`), cái đó không thay đổi. Ngôn ngữ UI-chrome = các nút/nhãn/banner của chính extension; locale spec-content = ngôn ngữ của text spec từ `.specs/`. Thứ tự resolution: stored `specpin:uiLocale` -> browser UI language -> "en". `config.ts` có thêm `getUiLocale`/`setUiLocale`. HTML tĩnh được địa phương hóa qua các attribute `data-i18n` / `data-i18n-placeholder` / `data-i18n-aria` / `data-i18n-title` / `data-i18n-html` được hydrate bởi `hydrateI18n`. Trang Options có một điều khiển Language (System default / English / Tiếng Việt / 日本語). Thay đổi broadcast `SET_UI_LOCALE` sang các tab và render lại tại chỗ qua `renderAll()`; popup/side panel đang mở render lại qua `watchUiLocaleChanges` (storage.onChanged). Ngoài phạm vi: localizing tên/mô tả manifest, RTL, định dạng số/ngày nhận biết locale, ngôn ngữ ngoài EN+VI+JA. Chuỗi lỗi SW background vẫn là tiếng Anh (không thuộc phạm vi i18n).

**Đã ship mở rộng vòng lặp authoring (2026-07-06)** trên nhánh `main`:
- Coverage mode (`Alt+Shift+U`): bật các marker "+" nét đứt trên mọi phần tử tương tác chưa có spec (button, link, input, các ARIA role dạng widget, handler onclick, contenteditable). Marker được định vị bằng badge-position solver, tạo kiểu trong Shadow DOM, tôn trọng reduced-motion. Trạng thái được lưu theo phiên. Hành động Ignore (cá nhân, theo origin) lưu trong `storage.sync` giúp bỏ qua các chỗ thiếu đã loại trên nhiều trình duyệt. Popup/side panel hiển thị dòng tóm tắt coverage ("N tương tác · M đã có spec · K còn thiếu") kèm nút "Ghi tất cả chỗ thiếu".
- Ghi hàng loạt: picker chọn nhiều (nhấp để bật/tắt, Enter để xác nhận) đưa vào một form dùng chung với tags/rules/status áp dụng cho mọi dòng, tiêu đề từng phần tử (tự suy ra, sửa được, đánh dấu khi trùng). Ghi N spec riêng vào một `.spec.json` cho mỗi route theo tuần tự; lỗi giữa chừng vẫn giữ các dòng đã lưu và để form mở cho thử lại.
- Template (dựng sẵn, không lưu bởi người dùng): "Kiểm tra biểu mẫu", "Xử lý lỗi API", "Luồng xác thực" chỉ điền vào các ô còn trống ở cả form ghi đơn và ghi hàng loạt; dịch theo ngôn ngữ giao diện.
- Clone ("Nhân bản sang phần tử"): chọn phần tử mới, form ghi mở ra với nội dung điền sẵn, spec mới nhận fingerprint mới + id mới + provenance được reset (status → draft, bỏ verifiedBy/reviewedAt/reviewedBy) để một nguồn đã approved không "rửa" bản sao chưa xem lại thành approved.

**Đã ship changelog hosted (2026-07-02)**:
- Website phục vụ một trang `/changelog` (`apps/web/src/pages/changelog.astro`, render qua `StarlightPage` + `marked`) đọc `apps/extension/CHANGELOG.md` tại thời điểm build, nên một bản phát hành extension sẽ hiện trên site sau lần deploy kế tiếp. `web-deploy.yml` thêm `apps/extension/CHANGELOG.md` vào bộ lọc `paths:` để một bản phát hành kích hoạt redeploy site.
- Extension liên kết tới nó: một link "What's New" trong thẻ Support & Feedback của trang Options (`options.changelog`, EN/VI/JA), cùng với tự động mở một tab mới khi có bản cập nhật đáng kể. Quyết định mở nằm trong `apps/extension/src/shared/whats-new.ts` (`shouldOpenChangelog`): trước 1.0 mọi bước tăng version đều mở (release-please phát ra các patch `0.0.x` cho tính năng thật); từ 1.0 trở đi chỉ mở khi bump minor/major. Được nối qua một listener `runtime.onInstalled` riêng (tách khỏi `initWorker` idempotent) đọc `previousVersion` và lưu `specpin:lastVersion`. Lần cài đầu không bao giờ mở.
- Phạm vi nguồn: chỉ changelog của extension (không có changelog CLI + spec-schema trên trang). Không có biến thể changelog địa phương hóa `/vi/` hay `/ja/` (nội dung changelog là tiếng Anh, sinh từ conventional commits).

**Đã ship các tính năng điều hướng cho người đọc (2026-07-02)** trên nhánh `feat/reader-discovery-navigation`:
- Deep-link chia sẻ spec: mỗi spec có thêm hành động "Copy link" (thẻ side-panel + tooltip đã ghim) sao chép `<pageUrl>#specpin=<specId>`. Mở URL đó sẽ cuộn tới + nháy sáng element và mở side panel với thẻ spec được làm nổi bật. Dự phòng nhẹ nhàng: id không xác định thì bỏ qua; spec mất liên kết (tồn tại nhưng element đã mất) sẽ mở thẻ + hiện thông báo "element không có trên trang này". Fragment ứng dụng cùng trang được giữ nguyên.
- Điều hướng xoay vòng bằng bàn phím: `Alt+Shift+N` xoay vòng focus qua các spec đã match và đang hiển thị trên trang, nháy sáng từng element và quay lại từ đầu. Tôn trọng reduced-motion. Bổ sung cho các tổ hợp phím hiện có `Alt+Shift+S/M/C/G`.
- Bản tóm tắt thay đổi: popup + side panel hiển thị "N thay đổi kể từ lần xem trước" kèm danh sách tiêu đề spec mới/đã sửa, với nút "Đánh dấu đã xem". Bản tóm tắt được tính từ snapshot hash nội dung theo từng dự án trong `storage.local` (title + description + business rules trên mọi locale). Lần xem đầu tiên hoặc dự án vừa kết nối được seed âm thầm (không gây nhiễu "tất cả đều mới").

**Lõi độ tin cậy matching (hybrid scorer + drift corpus) đã giao (2026-07-02)** trên nhánh `feat/matching-reliability-core`:
- Hybrid weighted scorer trong `packages/fingerprint-core/src/score.ts`: khi exact + unique-css thất bại, chấm điểm các hit của selector mơ hồ hoặc một tập candidate có giới hạn từ DOM thực theo text/labels/attrs/tag/cấu trúc/vị trí (trọng số chuẩn hóa trên các signal mà fingerprint mang theo). Các tầng thận trọng (HIGH (≥0.85) hiển thị với độ tin cậy cao, MID (0.6-0.85) hiển thị + `needsReview`, dưới đó là no-match) với biên độ top-2 (δ 0.1), không bao giờ ghi đè exact/css, và bỏ qua khi không có signal nội dung định danh. Thêm `strategy:"scored"` + breakdown `signals` tùy chọn vào `MatchResult` (bổ sung; caller hiện có không bị ảnh hưởng). Tập candidate có giới hạn (200) kèm số `considered` báo cáo; độ trễ được perf-test.
- Giao diện tầng scored: badge **Scored match** riêng biệt (độ tin cậy + gợi ý "vì sao match" theo signal nổi trội), MID hiển thị theo kiểu fuzzy mang tính cảnh báo; tóm tắt sức khỏe trang có thêm bucket `scored`; pill trên thẻ side-panel. Chuỗi EN+VI+JA.
- Drift corpus cục bộ (`apps/extension/src/shared/drift-corpus.ts`, opt-in mặc định TẮT, ring-buffer `storage.local` giới hạn 500): cặp re-pin supervised `(cũ→mới)` + một xác nhận "Correct", và snapshot passive các candidate fingerprint cho spec mất liên kết/MID (nhãn `chosenByScorer` tạm thời). Chỉ fingerprint, `textContent` được che (email + chuỗi số dài) lúc ghi; cửa sổ dedupe theo `(project,specId,pageUrl)` cho passive. Thẻ Options: toggle opt-in, số mục trực tiếp, export JSON (tải về cục bộ), xóa (kèm xác nhận). Message mới không đặc quyền `RECORD_DRIFT` / `RECORD_DRIFT_PASSIVE` (khởi từ content, background kiểm cổng opt-in). Không đổi schema/sidecar/`.specs/`.

**Lớp Provenance/Trust đã giao (2026-07-03)** trên nhánh `main`:
- Bốn trường schema tùy chọn, tương thích ngược: `links` (tham chiếu ticket/doc/PR do tác giả khai báo, ≤10, `http`/`https`), `verifiedBy` (đường dẫn test tương đối theo repo *khai báo* một spec, ≤20), và `status` (`draft`/`approved`/`deprecated`, vắng mặt = trung tính) trên `Spec`; `reviewedAt` + `reviewedBy` trên `SpecMeta`; `stalenessThresholdDays` (1-3650, mặc định lúc chạy 90) trên `ManifestSettings`. Một thay đổi schema được đồng bộ qua cả ajv + Go embed; một vòng lặp corpus manifest giờ cross-validate settings ở cả hai phía.
- Cả bốn giao diện reader (tooltip, sidebar, modal, side panel) render một khối provenance qua các helper HTML-string dùng chung (`shared/provenance.ts`): status badge, liên kết issue an toàn (đi qua sanitizer `classifyHref` sẵn có, mở tab mới với `rel="noopener noreferrer"`), một disclosure "linked tests" mang tính khai báo, và "reviewed {tương đối}" (nhận biết locale bằng `Intl.RelativeTimeFormat`) kèm chỉ báo stale khi quá ngưỡng theo từng project. Một spec không có provenance render giống hệt từng byte như trước.
- Ngưỡng staleness được phân giải + chặn khoảng **theo từng spec ở background** (`specsForOrigin`) và luồn qua `RenderMeta`, nên một trang nhiều project dùng cài đặt của chính project chứa mỗi spec; project local/manual dùng mặc định 90 ngày.
- Soạn thảo: capture/edit form có thêm input links (các dòng lặp lại được), verifiedBy (một đường dẫn/dòng), và status, cùng một hành động **Mark reviewed** đóng dấu `meta.reviewedAt`/`reviewedBy` và lưu qua đường `UPDATE_SPEC` không đặc quyền sẵn có (sidecar + local). `buildSpec` giờ spread toàn bộ `meta` trước đó (không clobber tín hiệu review) và ghi đè các trường bị xóa thay vì hồi sinh chúng. `reviewedBy` mặc định là token không-PII `createdBy` kèm cảnh báo lúc soạn.
- CI: `specpin validate` giờ fail khi một đường dẫn `verifiedBy` thiếu trong repo (một guard mới neo theo repo-root + cờ `--repo-root`; từ chối tuyệt đối/`..`/symlink-escape; bỏ qua kèm ghi chú khi không có working tree đọc được). Bật mặc định; chặn demo qua `ci.yml`.
- Mô hình tin cậy: provenance là **do tác giả khẳng định**; ranh giới toàn vẹn là việc review diff Git của `.specs/`, không phải message lúc chạy. Các thao tác ghi vẫn không đặc quyền; UI không bao giờ tuyên bố `status`/`reviewedBy` đã được xác minh, và `verifiedBy` luôn là "linked" (kiểm tra tồn tại), không bao giờ là "passed".

**Đánh số badge (opt-in) đã giao (2026-07-03)** trên nhánh `main`:
- Options có thêm ô chọn "Đánh số badge spec (hiện vị trí thay cho chữ S)" (mặc định TẮT; `config.ts` `getBadgeNumbering`/`setBadgeNumbering`, khóa storage.local `specpin:badgeNumbering`, xóa khóa khi tắt). Khi BẬT, badge tooltip trên trang hiển thị số theo thứ tự đọc bắt đầu từ 1 thay cho chữ "S" thương hiệu; số lớn nhất bằng tổng số badge tooltip trên trang (badge needsReview vẫn được đánh số và giữ màu vàng). Khi tắt thì giống hệt từng byte như trước.
- Số thứ tự được tính trong orchestrator (`renderSession` tách thành match/collect -> lượt tính ordinal -> render) dùng thứ tự tài liệu DOM (`compareDocumentPosition`) chỉ trên các match chế độ tooltip, rồi luồn tới renderer qua `RenderMeta.ordinal` (sự hiện diện của nó là tín hiệu "đang bật đánh số"; tooltip in nó thay cho "S"). Thứ tự DOM bằng thứ tự đọc trực quan cho hầu như mọi trang thực tế; layout bị CSS đảo/định vị tuyệt đối là khiếm khuyết chấp nhận được. Con số là chỉ số vị trí, không phải id ổn định (định danh spec không đổi).
- 1-9 giữ hình tròn 16px; từ 2 chữ số trở lên nở thành viên thuốc (`.badge.wide`, `width:auto`). `badge-position.ts` có thêm `width` theo từng badge để bộ giải vị trí/chồng lấn giữ đúng vùng chiếm chỗ (chiều cao vẫn 16px). Cập nhật trực tiếp qua broadcast mới `SET_BADGE_NUMBERING` (Options -> các tab), cùng đường với `SET_THEME`. Phạm vi: chỉ text của badge (không có "n / tổng" trong tip, side panel, hay reader-nav). i18n EN + VI + JA.

**Tùy chỉnh màu badge spec đã giao (2026-07-07)** trên nhánh `main`:
- Options có thêm ô chọn màu native "Màu badge spec" kèm nút **Đặt lại** (mặc định = màu teal thương hiệu `#2DD4BF`; `config.ts` `getBadgeColor`/`setBadgeColor`, khóa storage.local `specpin:badgeColor`, xóa khóa khi đặt lại). Toàn cục (một màu cho mọi trang), nên nằm cạnh các tùy chọn theme/đánh số badge. Cập nhật trực tiếp qua broadcast mới `SET_BADGE_COLOR` (Options -> các tab), cùng đường với `SET_THEME`.
- Màu được luồn nguyên vẹn trên `RenderMeta.badgeColor` (toàn cục theo phiên, giống `theme`). Renderer tooltip đặt `--sp-badge-bg` / `--sp-badge-fg` trên Shadow host của nó; `.badge` đọc `var(--sp-badge-bg, var(--sp-accent))` / `var(--sp-badge-fg, var(--sp-accent-on))`, nên khi chưa đặt thì giống hệt từng byte như trước. Màu ký tự được suy ra tự động từ luminance WCAG của nền (`shared/contrast.ts` `readableGlyph`: mực tối so với trắng). Giá trị được kiểm tra là `#rrggbb` (`isValidBadgeColor`) cả khi đọc storage lẫn khi renderer áp dụng, nên một giá trị bị sửa đổi sẽ rơi về màu token mặc định thay vì chèn vào CSS của shadow. Phạm vi: chỉ badge spec thường (quy tắc vàng `needsReview` và các marker coverage không đổi). i18n EN + VI + JA.

**Cổng CI governance (report + spec bắt buộc) đã giao (2026-07-03)** trên cùng nhánh `main`:
- `specpin report --dir .specs` kiểm tra sức khỏe spec (mặc định chỉ in, chỉ cảnh báo, exit 0): FRESHNESS (stale = `meta.reviewedAt` cũ hơn `settings.stalenessThresholdDays`, mặc định 90, never-reviewed không bao giờ stale), SPEC STATS (đếm theo status/file; đếm spec chứ không phải element, không có % coverage), REQUIRED-CHECK (mọi spec id trong `.specs/required.json` phải tồn tại, bỏ qua nếu không có file). Exit 2 = không chạy được. `--fail-on <conds>` (stale, draft-committed, missing-required, missing-verifiedby) chặn CI: exit 1 khi có vi phạm, exit 2 khi điều kiện không xác định. `--json` phát output có cấu trúc để parse.
- Thực thể `RequiredConfig`: `{ version: string, required: string[] }`, SSOT `packages/spec-schema/schema/v1.json`, export thành `validateRequired` + type `RequiredConfig` từ `@specpin/spec-schema`. Go `ValidateRequired`. Vòng lặp manifest corpus cross-validate settings; vòng lặp required-fixture cross-validate ở cả hai phía.
- CI: job Go trong `.github/workflows/ci.yml` chạy `specpin report --dir ../../examples/demo-react-app/.specs --fail-on missing-required` sau `validate`. Demo `.specs/` được bổ sung `required.json` (yêu cầu `login-submit-btn`, `dashboard-stat-revenue`). Composite action tái sử dụng `.github/actions/spec-lint/action.yml` được thêm input tùy chọn `report-fail-on` (mặc định rỗng = bỏ qua gate, tương thích ngược).

**Batch 2 polish đã giao (2026-07-07)** trên nhánh `main`:
- Bảng phím tắt: 6 chord của content script giờ nằm trong một bảng dùng chung (`content/chords.ts`) được cả key handler lẫn hai bề mặt UI đọc, nên không bao giờ lệch. Bảng phím tắt chỉ đọc mở bằng `Alt+Shift+?` (overlay Shadow DOM, đóng bằng Esc/backdrop/nhấn lại, focus-trap, tôn trọng reduced-motion) và cũng là một card ở **Options -> Shortcuts**. Mọi chord dùng nền `Alt+Shift` nên không đụng phím help phím-đơn của bất kỳ site nào (không có `?` đơn). Đây chỉ là tăng khả năng khám phá, không phải đổi phím (việc đó vẫn là hạng mục "keyboard shortcut customization UI" riêng).
- Onboarding lần đầu: một entrypoint `welcome` đã bản địa hóa mở đúng một lần ở lần cài đầu tiên (được canh bằng `specpin:welcomeSeen`), không bao giờ mở khi cập nhật hay dev reload, đi qua đúng đường `handleInstalled` sẵn có; loại trừ lẫn nhau với việc tự mở changelog. Chỉ người dùng tới Options + tài liệu.
- `llms.txt` cho docs: `apps/web/public/llms.txt` (định dạng llmstxt.org) lập chỉ mục docs site để trợ lý AI khám phá; tĩnh, tạo lại thủ công.

### Tính năng đã lên kế hoạch

**Các nguồn Spec bổ sung:**
- Manual import source (đã giao) (bundle `{ manifest, files }` read-only trong Options)
- Nguồn FileSystem Access API (browser hỏi quyền truy cập thư mục `.specs/`, không cần sidecar) (dự kiến)
- Source registry đã pluggable (interface `SpecSource`)

**Các Renderer bổ sung:**
- Modal (đã giao) (centered dialog, dùng cho review tập trung)
- Overlay và inline-badge - **đã bỏ vì trùng lặp** (xem Nhật ký Quyết định 2026-07-03): overlay trùng với modal đã ship và spotlight overlay của Guide mode; inline-badge trùng với badge element của tooltip. Enum `DisplayMode` giữ hai giá trị này ở dạng reserved (forward-compat, fall back về tooltip); không dự kiến làm renderer.
- Renderer registry đã pluggable (interface `SpecRenderer`): tooltip + sidebar + modal đã hiện thực

**Hỗ trợ Safari:**
- Đóng gói extension cho Safari (đang chờ Apple làm rõ tính tương đương MV3 tính đến 2026-06)
- WXT tuyên bố hỗ trợ Safari, cần test + quy trình đóng gói

**Soạn spec có hỗ trợ AI:**
- Đã ship (đường host-agent): một skill di động đóng gói trong `@specpin/cli` (`apps/cli/skill/`, truy cập qua unpkg) dạy một coding agent (Claude Code, Cursor, v.v.) soạn spec hợp lệ schema và điều khiển CLI. Host agent là người soạn; không thêm LLM vào CLI. Xem `docs/ai-authoring.md`. `apps/cli/cmd/generate.go` nay trỏ người dùng tới skill này.
- Dự kiến (LLM `specpin generate` phía CLI): một bộ sinh tích hợp chụp ảnh element và suy ra title/description/rules. Lựa chọn model, thiết kế prompt, local vs cloud, quản lý key vẫn chưa chốt; lệnh vẫn là stub.

**Tối ưu hiệu năng:**
- Chuyển việc validate spec trước khi POST từ content script sang background SW (bỏ ~100 KB ajv khỏi content bundle, dời chi phí parse sang thread SW)
- Lazy-load renderer (code-split tooltip/sidebar/modal, nạp khi dùng lần đầu)

**Đánh bóng UX:**
- Đóng gói font code JetBrains Mono dưới dạng asset `@font-face`; nó vẫn fallback về `ui-monospace` khi máy thiếu font. (Font UI Inter - **đã giao**: latin variable woff2 trong `public/fonts/`, nạp trên các trang qua `shared/inter-font.css` và đăng ký cấp document cho renderer shadow-DOM qua `shared/inter-font.ts`.)
- Cải thiện trực quan cho chế độ capture (chất lượng highlight, style form)
- UI tùy chỉnh phím tắt
- Cài đặt nâng cao cho trang options của extension

**Trải nghiệm Lập trình viên (Developer Experience):**
- Extension VSCode để soạn `.spec.json` (autocomplete schema, validation, preview)

## Khám phá Tương lai (chưa cam kết)

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
- **Hỗ trợ ứng dụng mobile** - chỉ browser extension; mobile là phần khám phá tương lai.
- **Sidecar hosted/cloud** - mặc định chỉ localhost (remote là tùy chọn qua reverse proxy HTTPS); dịch vụ cloud quản lý là phần khám phá tương lai.
- **Telemetry hoặc theo dõi sử dụng** - không analytics, không phone-home, không thu thập dữ liệu (local analytics trong phần khám phá tương lai, chỉ opt-in).

## Chiến lược Versioning

**Hiện tại**: v0.0.0 (pre-release, dogfooding nội bộ).

**Trước 1.0 (đã lên kế hoạch):**
- v0.1.0: bản release công khai đầu tiên
- v0.2.0: các tính năng dự kiến (hybrid scorer, nguồn FileSystem, Safari)
- v0.3.0+: thêm tính năng, đánh bóng, bugfix

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
- Rủi ro: refactor phá vỡ match, spec trở thành mất liên kết (orphaned)
- Giảm thiểu: hybrid weighted scorer dự kiến, khuyến nghị thuộc tính `data-spec-id` cho các element quan trọng, cờ `needsReview` làm nổi các match mơ hồ.

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
- Giảm thiểu: hiện 450 KB dưới mục tiêu 500 KB, một tối ưu dự kiến chuyển ajv sang SW (tiết kiệm ~100 KB).

## Nhật ký Quyết định (Decision Log)

| Ngày | Quyết định | Lý do |
|------|----------|-------|
| 2026-07-06 | Template dựng sẵn (không do người dùng tạo/lưu) | Template do người dùng tạo làm UI phức tạp (lưu, sửa, chia sẻ, đồng bộ). Bộ dựng sẵn cố định (Kiểm tra biểu mẫu / Xử lý lỗi API / Luồng xác thực) đủ cho trường hợp phổ biến; người dùng có thể tự lưu spec làm template khi cần |
| 2026-07-06 | Ignore-list cá nhân (storage.sync, không chia sẻ theo nhóm) | Ignore-list chia sẻ nhóm sẽ cần ghi qua sidecar + commit Git cho mỗi lần bỏ qua. `storage.sync` cá nhân là tức thì, theo từng người và có thể đảo ngược. Nhóm có thể đặt cổng coverage trong CI nếu cần siết chỗ thiếu |
| 2026-07-06 | Ghi hàng loạt lưu một .spec.json cho mỗi trang/route, không phải một tệp cho mỗi phần tử | Ghi nguyên tử theo tệp giảm phân mảnh spec. Spec của một trang thường thuộc cùng một nhóm logic (ví dụ `checkout.spec.json`); người dùng có thể tự tách nếu cần |
| 2026-07-06 | Coverage mode chỉ nhắm phần tử tương tác (không phải mọi phần tử) | Đánh dấu mọi node DOM sẽ gây nhiễu; phần tử tương tác mới là chỗ thiếu đáng xử lý (người dùng ghi được spec). Nội dung tĩnh tự nó đã rõ nghĩa |
| 2026-07-06 | Clone reset provenance về draft (status, verifiedBy, reviewedAt/reviewedBy) | Ngăn một nguồn đã approved lặng lẽ clone thành "approved" trên phần tử mới. Spec clone có thể mô tả cùng một pattern nhưng áp cho phần tử khác, nên cần xem lại |
| 2026-07-03 | Bỏ renderer overlay + inline-badge (giữ giá trị enum ở dạng reserved cho forward-compat) | Overlay trùng với modal đã ship + spotlight của Guide mode; inline-badge trùng với badge element của tooltip, không có giá trị riêng so với thứ đang ship |
| 2026-06-25 | Thu hẹp phạm vi bản phát hành đầu (hoãn nguồn FS/Manual, modal/overlay/badge, hybrid scorer, Safari, AI) | Giao end-to-end demo được nhanh hơn, kiểm chứng giá trị cốt lõi trước khi đánh bóng |
| 2026-06-25 | Ngôn ngữ CLI: Go (không phải Node) | Một binary tĩnh duy nhất, không phụ thuộc runtime, phù hợp cho localhost server hơn Bun/Deno |
| 2026-06-25 | Fingerprint: exact anchors + cssSelector trước, weighted scorer hoãn lại | Bản phát hành đầu đủ cho demo, hybrid scorer cần corpus thực tế để tinh chỉnh |
| 2026-06-25 | Build extension: WXT | Trừu tượng hóa cross-browser (Chrome MV3 + Firefox MV2), hot-reload, DX hiện đại |
| 2026-06-25 | Test runner: Vitest (không phải node:test hay Jest) | Native với Vite, ghép tốt với WXT, story jsdom mạnh cho fingerprint-core |
| 2026-06-25 | Port sidecar: tự chọn port trống (không phải default cố định) | Tránh xung đột port lần chạy đầu, extension vốn đã đọc URL được dán |
| 2026-06-25 | Chế độ capture: chỉ thủ công (không AI assist lúc ra mắt) | Giữ mọi công việc LLM ra khỏi bản phát hành đầu, không phụ thuộc model hay quản lý key |
| 2026-06-25 | License: Apache-2.0 | Quyết định tại bản phát hành đầu (vốn là gate hoãn lại trong plan) |
| 2026-06-26 | Nội dung spec được localize là chỉ dạng object (`LocalizedString`), string phẳng không hợp lệ | Pre-release, không có corpus bên ngoài và không có cam kết tương thích; schema được sửa tại chỗ (vẫn `v1.json`, không fork `v2.json`, không bump version manifest). Một resolver đọc tất cả trường được localize |
| 2026-06-26 | Project empty-`domains` cần opt-in `applyToAllSites` rõ ràng | Một wildcard every-site im lặng sẽ rò rỉ spec của project vào các page không liên quan/kẻ tấn công; người dùng opt in per connection |
| 2026-06-26 | SW-suspend watch loss được sửa tổng quát (chia sẻ `reestablish()` cho 1 và N connection) | Cùng path phục vụ trường hợp single-connection, sửa một bug MV3 latent thay vì chỉ cái multi-connection mới |

## Tham chiếu (References)

- Architecture: `docs/system-architecture.md`
- Run guide: `docs/run-guide.md`
- Schema: `docs/schema-reference.md`
- Design system: `docs/design-system.md`
- Codebase summary: `docs/codebase-summary.md`
- Code standards: `docs/code-standards.md`
- PDR: `docs/project-overview-pdr.md`
