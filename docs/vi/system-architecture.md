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

Dữ liệu tuân theo nguyên tắc one schema, two validators: JSON Schema được publish (`packages/spec-schema/schema/v1.json`) là single source of truth. Phía TS validate bằng ajv; Go sidecar nhúng cùng file đó và validate bằng `santhosh-tekuri/jsonschema/v6`. CI cross-validate một fixture corpus dùng chung qua cả hai và fail nếu có drift. Điều này áp dụng cho tất cả schema entity: `Spec`, `SpecManifest`, `SpecFile`, và `ViewsConfig`.

## Packages

| Path | Vai trò |
|------|------|
| `packages/spec-schema` | JSON Schema v1 (SSOT) + generated TS types + ajv validators |
| `packages/fingerprint-core` | `captureFingerprint` + `matchElement` không phụ thuộc framework (pure DOM) |
| `packages/api-client` | `SidecarClient` có kiểu (typed) trên HTTP contract của sidecar + SSE helper |
| `apps/cli` | Go sidecar: `init` + `serve` (CRUD, SSE, health), localhost được hardened |
| `apps/extension` | WXT MV3 extension (Chrome + Firefox) |
| `examples/demo-react-app` | demo UI + `.specs/` đã seed sẵn |

## Element fingerprinting

Một fingerprint nắm bắt nhiều signal cho mỗi element (test-id anchors, aria, non-generated id, optimized cssSelector, xpath, domPath, text, whitelisted attributes, nearby labels, position, framework hint). Matching (MVP) thử exact anchors trước (confidence 1.0), rồi đến một unique cssSelector (0.7), nếu không thì gắn cờ `needsReview`. Một attribute `data-spec-id` trên các element quan trọng giúp việc matching trở nên chính xác một cách hết sức đơn giản.

Signature của matcher và shape của `MatchResult` được giữ ổn định để hybrid weighted scorer (đang được hoãn lại) có thể được lắp vào sau mà không phá vỡ caller.

## Multi-project registry

Background giữ một `SidecarRegistry`: một map của các sidecar connection độc lập, mỗi cái có URL riêng, bearer token riêng, spec cache riêng, và SSE watch riêng, cộng với nguồn Manual-import do page sở hữu. Với bất kỳ page nào, `specsForOrigin(origin)` tổng hợp các spec của mọi connection mà `domains` của project nó bao phủ origin đó, gắn tag từng spec với connection id + tên project (id không bao giờ được dedupe giữa các project, vì hai project có thể chia sẻ một spec id).

- **Origin gate (ranh giới bảo mật).** Chỉ các connection khớp origin mới đóng góp spec. Một connection mà manifest của nó không pin `domains` **không** tự động khớp mọi site: nó chỉ khớp khi người dùng rõ ràng opt in (`applyToAllSites`); nếu không thì nó không hoạt động. SSE broadcast "có gì đó thay đổi" ping tất cả tab và chỉ là best-effort (không phải ranh giới); content script re-query `specsForOrigin`, cái đó mới là ranh giới.
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

## Security model (sidecar)

- Chỉ bind `127.0.0.1`; port được auto-pick trừ khi truyền `--port`.
- Mọi request đều yêu cầu `Authorization: Bearer <token>` (được in ra khi `serve`).
- CORS chỉ chấp nhận extension origin (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); các web origin bị từ chối.
- Việc ghi (write) bị giới hạn trong `.specs/` (có path-traversal guard), atomic, và được pretty-print để Git diff sạch.
- **Mô hình tin cậy multi-token.** Với N connection, extension lưu N localhost bearer token. Token ở trong background/extension storage: chúng không bao giờ được echo vào DOM của Options, không bao giờ được bao gồm trong `ConnectionStatus` (nên một truy vấn status không có đặc quyền không thể đọc chúng), và các message thay đổi connection là có đặc quyền (bị từ chối từ content script của web-page). Capture write chỉ được định tuyến tới một connection mà `domains` của nó bao phủ page origin.
- **Endpoint**: `GET /ping`, `GET /manifest`, `GET /specs`, `GET /specs/:id`, `POST /specs`, `PUT /specs/:id`, `DELETE /specs/:id`, `GET /views`, `PUT /views`, `GET /events` (SSE). Tất cả ngoại trừ `/ping` yêu cầu bearer auth; `PUT /views` validate payload theo schema `ViewsConfig` trên cả hai phía TS và Go.

## Design references

UI mockup cho các surface của extension (popup, options, sidebar, capture form)
cùng các color/font token dùng chung nằm trong `apps/extension/designs/`. Xem
`docs/design-system.md` để biết quy trình token.

## Deferred (post-MVP)

FileSystem Access source; overlay + inline-badge renderers; hybrid weighted fingerprint scoring; `specpin generate` (AI); đóng gói cho Safari. (Đã giao kể từ MVP: Manual import source, modal renderer, multi-language specs, và multi-project connections.)
