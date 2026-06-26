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
   - background SW: SidecarClient + spec cache + SSE relay
   - content script: matchElement(fingerprint) -> render (tooltip / sidebar)
   - popup + options: connection config, on/off, capture
```

Dữ liệu tuân theo nguyên tắc one schema, two validators: JSON Schema được publish (`packages/spec-schema/schema/v1.json`) là single source of truth. Phía TS validate bằng ajv; Go sidecar nhúng cùng file đó và validate bằng `santhosh-tekuri/jsonschema/v6`. CI cross-validate một fixture corpus dùng chung qua cả hai và fail nếu có drift.

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

## Security model (sidecar)

- Chỉ bind `127.0.0.1`; port được auto-pick trừ khi truyền `--port`.
- Mọi request đều yêu cầu `Authorization: Bearer <token>` (được in ra khi `serve`).
- CORS chỉ chấp nhận extension origin (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); các web origin bị từ chối.
- Việc ghi (write) bị giới hạn trong `.specs/` (có path-traversal guard), atomic, và được pretty-print để Git diff sạch.

## Design references

UI mockup cho các surface của extension (popup, options, sidebar, capture form)
cùng các color/font token dùng chung nằm trong `apps/extension/designs/`. Xem
`docs/design-system.md` để biết quy trình token.

## Deferred (post-MVP)

Các source FileSystem Access + Manual import; các renderer overlay/modal/inline-badge; hybrid weighted fingerprint scoring; `specpin generate` (AI); đóng gói cho Safari.
