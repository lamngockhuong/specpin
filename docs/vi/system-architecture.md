# Kiến trúc hệ thống Specpin

> Bản tiếng Việt của `docs/system-architecture.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Specpin gắn các business specification lên những element của một web UI đang chạy. Nó **không phải** là một spec-driven code generator: nó không tạo ra application code từ spec. Nó là một lớp tri thức (knowledge layer) Git-native, đính kèm tài liệu sống (living documentation) vào những interface bạn đã có sẵn.

## Components

```
.specs/ (consumer repo)
   |  read/write JSON
   v
specpin serve  ── Go sidecar ──  localhost HTTP + SSE (token-authenticated, 127.0.0.1 only)
   ^
   |  fetch() from the background service worker
   v
browser extension (WXT, MV3)
   - background SW: SidecarRegistry (N connections) + per-connection cache + SSE relay
   - content script: matchElement(fingerprint) -> render (tooltip / sidebar / modal)
   - popup + side panel + options: connection manager, locale toggle, on/off, capture
```

Extension cung cấp hai bề mặt điều khiển tương đương dùng chung messaging của background: **popup** (dropdown tạm thời) và **side panel** (`entrypoints/sidepanel/`, một trang gắn cố định hiển thị description + business rules của spec ngay inline và tự refresh khi đổi tab/điều hướng và khi có `SPECS_CHANGED`). Cả hai fetch qua một helper chung `fetchSurfaceState()`. WXT map một entrypoint `sidepanel` duy nhất sang Chrome `side_panel` và Firefox `sidebar_action`. Một tùy chọn `defaultSurface` được lưu quyết định click icon trên thanh công cụ mở popup hay side panel; background áp dụng nó trên Chrome qua `chrome.action.setPopup` + `sidePanel.setPanelBehavior` (Firefox giữ popup trên nút thanh công cụ và mở sidebar từ nút gốc của nó).

Dữ liệu tuân theo nguyên tắc one schema, two validators: JSON Schema (`packages/spec-schema/schema/v1.json`) là single source of truth. Phía TS validate bằng ajv; Go sidecar nhúng cùng file đó và validate bằng `santhosh-tekuri/jsonschema/v6`. CI cross-validate một fixture corpus dùng chung qua cả hai và fail nếu có drift. Điều này áp dụng cho tất cả schema entity: `Spec`, `SpecManifest` (phần `settings` của nó, gồm cả ràng buộc `stalenessThresholdDays`, được cross-validate bởi một vòng lặp corpus manifest riêng), `SpecFile`, `ViewsConfig`, và `GuidesConfig`. Ngoài vai trò SSOT cho validation, schema còn là public contract: được serve tại `https://specpin.ohnice.app/schema/v1.json` (chính là `$id`, copy vào build `apps/web`) và publish lên npm dưới tên `@specpin/spec-schema` (types + ajv validator + schema thô), nên consumer có autocomplete trong editor và validate bằng code.

Theme có thể chọn bởi người dùng: UI của extension hỗ trợ chế độ System / Light / Dark. Trước đây dark chỉ tồn tại đằng sau `@media (prefers-color-scheme: dark)`. Giờ người dùng có thể force một theme qua trang Options. Generator phát ra bốn block selector `:root...` trong `tokens.gen.css` (shared + light, forced dark, forced light, media query system default), và `tokens.ts` đổi tất cả các dạng sang `:host(...)` cho Shadow DOM renderer. Lựa chọn được lưu lại trong `specpin:theme`; "System" nghĩa là `data-theme` không có. Forced theme có thể nhấp nháy system default trong một frame khi load (được chấp nhận).

i18n cho UI-chrome: một runtime `t(key, params)` tùy chỉnh trong `apps/extension/src/i18n/` địa phương hóa các nút, nhãn và banner của chính extension (KHÔNG PHẢI ngôn ngữ spec-content, cái đó là một toggle riêng). Tiếng Anh, tiếng Việt, và tiếng Nhật được hỗ trợ (`SUPPORTED=["en","vi","ja"]`). Resolution: stored `specpin:uiLocale` -> browser UI language -> "en". Trang Options có một điều khiển Language (System default / English / Tiếng Việt / 日本語). Thay đổi broadcast `SET_UI_LOCALE` sang các tab; popup/side panel đang mở render lại qua `watchUiLocaleChanges` (storage.onChanged). HTML tĩnh được hydrate qua các attribute `data-i18n*`. Cái này độc lập với locale spec-content hiện có (`getLocale`/`setLocale`, `localize-spec.ts pickLocale`). Localizing manifest name/description, RTL, locale-aware number/date formatting, và các ngôn ngữ ngoài EN+VI+JA nằm ngoài phạm vi.

## Packages

| Path | Vai trò |
|------|------|
| `packages/spec-schema` | JSON Schema v1 (SSOT) + generated TS types + ajv validators |
| `packages/fingerprint-core` | `captureFingerprint` + `matchElement` không phụ thuộc framework (pure DOM) |
| `packages/api-client` | `SidecarClient` có kiểu (typed) trên HTTP contract của sidecar + SSE helper |
| `apps/cli` | Go sidecar: `init` + `serve` (CRUD, SSE, health) + `validate` + `report` (offline), localhost được hardened |
| `apps/extension` | WXT MV3 extension (Chrome + Firefox) |
| `examples/demo-react-app` | demo UI + `.specs/` đã seed sẵn |

## Element fingerprinting

Một fingerprint nắm bắt nhiều signal cho mỗi element (test-id anchors, aria, non-generated id, optimized cssSelector, xpath, domPath, text, whitelisted attributes, nearby labels, position, framework hint). Matching thử exact anchors trước (confidence 1.0), rồi đến một unique cssSelector (0.7); nếu cả hai thất bại nó chạy một **hybrid weighted scorer** (`strategy:"scored"`) trên các hit của selector mơ hồ hoặc một tập candidate có giới hạn lấy từ DOM sống, và chỉ khớp phần tử tốt nhất khi phần tử đó vượt ngưỡng cao và hơn phần á quân một biên độ. Scorer được thiết kế thận trọng (né false positive): không bao giờ ghi đè một hit exact/css, bỏ qua khi không có signal nội dung định danh, và gắn cờ `needsReview` cho các match độ tin cậy trung bình; dưới tầng trung bình nó gắn cờ `needsReview` mà không có element. Trọng số và ngưỡng nằm trong một bảng ở `packages/fingerprint-core/src/score.ts`. Một attribute `data-spec-id` trên các element quan trọng giúp việc matching trở nên chính xác một cách hết sức đơn giản.

Trước khi matching, render loop áp dụng `pageUrl` path glob (tùy chọn) của fingerprint (tự động điền lúc capture, có thể chỉnh): một spec chỉ render trên các route mà glob của nó bao phủ, nên một spec được pin ở màn hình này không bao giờ khớp sang màn hình khác có layout tạo ra selector trùng. Một spec không có `pageUrl` khớp trên mọi trang (tương thích ngược). Cùng phạm vi đó chặn danh sách "trang này" của popup / side panel (`GET_MATCHED_IDS`), giữ danh sách khớp với những gì thực sự render.

Signature của matcher và shape của `MatchResult` được giữ ổn định qua các tầng; tầng scored chỉ thêm `strategy:"scored"` và một breakdown `signals` tùy chọn theo từng signal (gợi ý "vì sao match"), nên các caller hiện có không bị ảnh hưởng.

### Corpus drift cho matching (cục bộ, opt-in)

Để tinh chỉnh scorer với drift thực tế, extension có thể thu thập một corpus huấn luyện cục bộ (`storage.local`, mặc định **TẮT**, ring-buffer có giới hạn, xuất + xóa được từ Options, không bao giờ tải lên). Hai nguồn: **supervised** — một lần re-pin ghi lại cặp fingerprint `(cũ → mới)` (ground truth); và **passive** — khi một spec trở nên mồ côi hoặc scored-trung-bình lúc match, nó chụp lại các candidate fingerprint mà scorer đã cân nhắc (nhãn `chosenByScorer` tạm thời, không bao giờ coi là sự thật). Chỉ fingerprint — không HTML — với `textContent` được che (email + chuỗi số dài) lúc ghi. Nằm ở `apps/extension/src/shared/drift-corpus.ts`.

## Multi-project registry

Background giữ một `SidecarRegistry`: một map của các sidecar connection độc lập, mỗi cái có URL riêng, bearer token riêng, spec cache riêng, và SSE watch riêng, cộng với nguồn cục bộ (Manual) do page sở hữu (một danh sách các batch có thể xóa, mỗi batch là một bundle đã validate riêng, không phải một slot đơn). Với bất kỳ page nào, `specsForOrigin(origin)` tổng hợp các spec của mọi connection mà `domains` của project nó bao phủ origin đó, gắn tag từng spec với connection id + tên project (id không bao giờ được dedupe giữa các project, vì hai project có thể chia sẻ một spec id), rồi thêm mọi batch cục bộ mà `domains` của nó bao phủ origin (mỗi cái gắn tag `manual:<batchId>` riêng để một lần sửa định tuyến đúng về batch đó; các spec id trùng nhau được dedupe giữa các batch, batch đầu thắng).

Nguồn cục bộ giờ **ghi được**, không chỉ là một slot import chỉ-đọc. Batch có thể được tạo trong extension (`CREATE_LOCAL_PROJECT`), capture vào, và sửa (`SAVE_SPEC`/`UPDATE_SPEC` rẽ nhánh theo `isLocalConnectionId` và ghi `storage.local` thay vì sidecar). Một lần ghi cục bộ bị giới hạn theo origin y như ghi sidecar (RT-SA7): background kiểm tra batch mục tiêu có phục vụ origin của trang theo cùng cổng opt-in `applyToAllSites` (`statusServesOrigin`, dùng chung bởi bộ chọn capture `GET_WRITE_TARGETS` và guard ghi), và re-validate spec bằng `validateSpec` trước khi lưu (validate của form trong trang chỉ là client-side). Storage vẫn là single writer: mọi mutation cục bộ chạy qua chuỗi `mutate()` của background trên các mutator state thuần (`createLocalBatch`/`upsertLocalSpec`/`renameLocalBatch`). Shape `.specs/` trên đĩa của một batch (`manifest.json` + một `*.spec.json` mỗi group) round-trip ra ngoài qua export zip STORE không phụ thuộc (`GET_EXPORT_BUNDLES` -> `bundleToFiles` + `zipStore`), nên một dự án cục bộ có thể commit vào `.specs/` của repo hoặc re-import.

- **Origin gate (ranh giới bảo mật).** Chỉ các connection khớp origin mới đóng góp spec. Một connection mà manifest của nó không pin `domains` **không** tự động khớp mọi site: nó chỉ khớp khi người dùng rõ ràng opt in (`applyToAllSites`); nếu không thì nó không hoạt động. Một connection bị tắt (trường `Connection.enabled` tùy chọn, undefined = enabled) không phục vụ trang nào; nút bật/tắt được gate tập trung tại `SidecarConnection.matchesOrigin` (cùng ranh giới với matching origin/domain) và khác biệt với công tắc bật/tắt toàn cục (toggle tất cả nguồn cùng lúc). SSE broadcast "có gì đó thay đổi" ping tất cả tab và chỉ là best-effort (không phải ranh giới); content script re-query `specsForOrigin`, cái đó mới là ranh giới.
- **Cô lập per-connection.** Một connection thất bại (sidecar không thể tiếp cận, manifest xấu) ghi lại lỗi của nó và đóng góp không spec; nó không bao giờ hủy tổng hợp cho các connection khác.
- **Vòng đời service-worker.** MV3 suspend worker và giết các SSE stream. Một `reestablish()` dùng chung xây dựng lại tất cả connection từ storage và khởi động lại watch của chúng; nó chạy lúc module eval và trên `onStartup` / `onInstalled` / một keepalive alarm, nên watch phục hồi cho một hoặc nhiều connection. Reconnect backoff được jitter per connection để tránh thundering herd.

## Localization

Nội dung business của spec (`title`, `description`, `businessRules`) được lưu dưới dạng object đánh key theo locale (`LocalizedString`); xem `docs/schema-reference.md`. Một resolver `resolveLocalized(value, locale, defaultLocale)` duy nhất (bảo vệ prototype-pollution) là người đọc duy nhất; renderer không bao giờ chạm vào raw object. Người xem chọn ngôn ngữ trong popup (được phản chiếu trong sidebar); lựa chọn được lưu lại và render lại tất cả display mode, fall back về `defaultLocale` rồi giá trị đầu tiên có mặt. Các bản dịch được soạn trong form capture/edit per locale.

## Spec Visibility Filtering

Một mô hình facet thống nhất kiểm soát spec nào sẽ render. Mỗi spec có các facet key: `tag:<t>` (một cho mỗi tag), `file:<file>`, `spec:<id>`. Cổng ở tầng page: `url:<glob>` (khớp path page hiện tại dùng `*` cho một segment, `**` cho nhiều segment). Một predicate `isVisible(spec, url, state)` trong `apps/extension/src/shared/visibility.ts` quyết định việc render.

Tầng đồng bộ hai lớp: `effectiveDisabled = (teamHidden union personalForceHide) minus personalForceShow`.

- **Team default** từ `.specs/views.json` (Git-commit, dùng chung). Được soạn qua trang Options của extension (per connection), ghi vào `.specs/views.json` qua sidecar `PUT /views` (schema-validate). Khi không có, sidecar trả về default rỗng `{ version: "1.0", hidden: [] }` qua `GET /views` (mọi spec đều visible).
- **Personal override** trong `chrome.storage.sync` (per profile trình duyệt, qua máy). Một personal force-show của `spec:<id>` là một hard rescue per-spec (thắng hide theo tag/file). Tag/file/url force-show chỉ bỏ hide key của chính nó. Cổng `url:` page thắng mọi thứ.

Trạng thái rỗng ở mọi nơi = mọi thứ visible (tương thích ngược). UI filter: facet checklist (Tags / Files / This page) trong popup + side panel; nút mắt per-spec trong side panel; Reset xóa các override cá nhân.

## Guide mode (onboarding tours)

Một **guide** là một walkthrough có thứ tự, được khởi chạy thủ công, đi qua các spec đã được pin vào trang hiện tại: nó làm nổi bật (spotlight) element của từng bước và hiện nội dung đã localize của spec đó trong một popover được neo (anchored) với Prev/Next/Skip/Done. Nó **không phải** là một `DisplayMode` (renderer hiện mọi spec đã match cùng một lúc; một guide là tuần tự trên một tập con đã được lọc theo trang và sắp thứ tự). `GuideController` (`content/guide.ts`) là một controller riêng ở tầng page, được khởi chạy theo yêu cầu, **tạm dừng** (suspend) phiên render đang active trong khi chạy và khôi phục nó khi thoát; một cờ `guideActive` ở tầng module gate `rerender()` để một sự kiện `SPECS_CHANGED` / theme / mode / locale ở background không thể dựng lại một phiên đè lên tour đang chạy. Nó sở hữu lớp spotlight overlay Shadow-DOM riêng (nó port kỹ thuật theo dõi rect từ `highlight.ts` thay vì gọi singleton tự-mờ-dần). Một thay đổi spec giữa chừng tour sẽ hard-stop guide; điều hướng SPA tháo dỡ nó. Khởi chạy chỉ thủ công: một mục "Start guide" trong popup + side panel, cùng `Alt+Shift+G` cho tour mặc định.

Guide tồn tại trong hai scope chia sẻ chung một shape `GuideDef`:

- **Team** - `.specs/guides.json` đã commit, được sidecar phục vụ (phản chiếu `views.json`), HOẶC lưu inline trên một dự án cục bộ (Manual). Đọc theo từng connection (trong cùng nhóm `reload()` với specs + views, nên một thay đổi chỉ-guide cũng refresh qua SSE).
- **Personal** - riêng tư cho người dùng trong `chrome.storage.sync`, đánh key theo một canonical origin (một ranh giới tin cậy per-user). Background suy ra read origin từ trusted sender cho một content script và chỉ tin một payload origin từ một extension page có đặc quyền, nên một content script không bao giờ có thể đọc personal guide của origin khác.

Background tổng hợp cả hai vào một danh sách được tag theo origin (`GET_GUIDES_FOR_ORIGIN`); các mutation (`SAVE_TEAM_GUIDE` định tuyến sidecar vs local, `SAVE_PERSONAL_GUIDE`, `DELETE_GUIDE`) là có đặc quyền, đọc lại live state trước khi ghi, và broadcast `SPECS_CHANGED` sẵn có. Một guide có `steps` rỗng fall back về mọi spec đã match theo thứ tự mặc định. Việc biên soạn (name, description, include/sắp thứ tự các bước, bộ chọn Save-to trên các mục tiêu sidecar/local/personal) nằm trong `shared/guide-editor.ts`; danh sách khởi chạy trong `shared/guide-section.ts`; Options quản lý các team guide của một connection (liệt kê + xóa).

## Security model (sidecar)

- Chỉ bind `127.0.0.1`; port được auto-pick trừ khi truyền `--port`.
- Mọi request đều yêu cầu `Authorization: Bearer <token>` (được in ra khi `serve`).
- CORS chỉ chấp nhận extension origin (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); các web origin bị từ chối.
- Việc ghi (write) bị giới hạn trong `.specs/` (có path-traversal guard), atomic, và được pretty-print để Git diff sạch.
- **Mô hình tin cậy multi-token.** Với N connection, extension lưu N localhost bearer token. Token ở trong background/extension storage: chúng không bao giờ được echo vào DOM của Options, không bao giờ được bao gồm trong `ConnectionStatus` (nên một truy vấn status không có đặc quyền không thể đọc chúng), và các message thay đổi connection là có đặc quyền (bị từ chối từ content script của web-page). Capture write chỉ được định tuyến tới một connection mà `domains` của nó bao phủ page origin.
- **Endpoint**: `GET /ping`, `GET /manifest`, `GET /specs`, `GET /specs/:id`, `POST /specs`, `PUT /specs/:id`, `DELETE /specs/:id`, `GET /views`, `PUT /views`, `GET /guides`, `PUT /guides`, `GET /events` (SSE). Tất cả ngoại trừ `/ping` yêu cầu bearer auth; `PUT /views` và `PUT /guides` validate payload theo schema `ViewsConfig` / `GuidesConfig` trên cả hai phía TS và Go.

## Design references

UI mockup cho các surface của extension (popup, options, sidebar, capture form)
cùng các color/font token dùng chung nằm trong `apps/extension/designs/`. Xem
`docs/design-system.md` để biết quy trình token.

## Deferred (post-MVP)

FileSystem Access source; overlay + inline-badge renderers; hybrid weighted fingerprint scoring; `specpin generate` (AI); đóng gói cho Safari. (Đã giao kể từ MVP: Manual import source, một luồng tạo nội dung cục bộ ghi được - tạo trong extension, capture, sửa, và export zip theo group - modal renderer, multi-language specs, và multi-project connections.)
