# Tổng quan dự án Specpin & PDR

> Bản tiếng Việt của `docs/project-overview-pdr.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

## Vấn đề

Các team kỹ thuật mất ngữ cảnh giữa việc code làm gì (implementation) và tại sao nó làm vậy (business rule, acceptance criteria, edge case). Spec nằm rải rác trên Jira, Confluence, Notion, các thread Slack, hoặc bị chôn vùi trong những PR đã cũ. Developer phải reverse-engineer ý định từ code, nhân viên support phải escalate thay vì kiểm tra spec, và những thay đổi về sản phẩm bỏ lại các quyết định cũ không còn dấu vết, không có audit trail nào.

Các giải pháp hiện có thì hoặc sinh code từ spec (coupling chặt, dễ vỡ) hoặc tài liệu hóa code sau khi đã ship (cũ kỹ, lệch pha). Không giải pháp nào giữ được tri thức business gắn liền với chính interface đang chạy.

## Specpin là gì (và KHÔNG phải là gì)

Specpin pin các business specification (rule, mô tả, acceptance criteria) trực tiếp lên các element của một web UI đang chạy. Nó **KHÔNG phải là một spec-driven code generator** (không liên quan tới GitHub Spec Kit / OpenSpec). Nó không sinh ra application code từ spec. Nó là một lớp tri thức gắn tài liệu luôn cập nhật, được version hóa bằng Git, vào những interface bạn đã có sẵn. Interface vốn đã biết mọi thứ nằm ở đâu; Specpin trao cho nó một trí nhớ.

Spec tồn tại dưới dạng JSON bên trong thư mục `.specs/` của repo consumer, được liên kết tới các element thông qua những fingerprint bền bỉ, và render ngay trong trình duyệt qua các display mode dạng pluggable (tooltip, sidebar, modal). Mọi thứ đều local-first và Git-native: được version hóa, review qua PR, và diff được.

## Người dùng mục tiêu

- **Frontend developer** kiểm tra business rule trong lúc implement một form hoặc debug logic validation.
- **QA engineer** xác minh acceptance criteria trực tiếp trên UI đang chạy mà không phải lục tìm trong các ticket.
- **Product manager** rà soát các tính năng đã ship so với ý định ban đầu, viết spec mới ngay trên interface.
- **Team support** hiểu hành vi của các edge case mà không cần escalate lên team kỹ thuật.
- **Thành viên mới** học các domain rule bằng cách khám phá UI đang chạy với ngữ cảnh đính kèm.

## Mục tiêu

1. **Lớp spec zero-drift**: spec nằm trong cùng repo với code, version cùng nhau, review cùng nhau qua PR.
2. **Authoring lấy interface làm gốc**: capture spec bằng cách click vào element mục tiêu trên UI đang chạy, không phải đoán CSS selector hay viết tài liệu trừu tượng.
3. **Render dạng pluggable**: tooltip (xem nhanh), sidebar (đọc tập trung), modal (review tập trung). Hiện ship tooltip, sidebar, và modal kéo thả được.
4. **Matching bền bỉ**: fingerprint sống sót qua các đợt refactor. Các anchor exact (test-id, aria, data-spec-id) match trước; hybrid weighted scoring làm fallback khi layout thay đổi.
5. **Local-first, Git-native**: không backend SaaS, không tường auth, không bị khóa vào nhà cung cấp. Sidecar chạy trên localhost, spec diff sạch trong Git.

## Tính năng chính

- **Go sidecar CLI**: `specpin init` scaffold ra `.specs/manifest.json`, `specpin serve` expose spec store qua localhost HTTP + SSE có xác thực token để live-reload.
- **Browser extension (WXT, MV3)**: hỗ trợ Chrome + Firefox. Background SW kết nối tới sidecar, content script match fingerprint và render spec.
- **Renderer**: tooltip (hover để xem nhanh), sidebar (panel đọc/ghi cố định), và modal kéo thả được.
- **Manual capture mode**: click một element, điền form (title, description, rule), lưu vào `.specs/`.
- **Fingerprinting bền bỉ**: thử lần lượt test-id anchor, aria, id không phải sinh tự động, cssSelector duy nhất, xpath. Làm fallback sang hybrid weighted scorer khi exact/css match fail. Đánh dấu `needsReview` khi mơ hồ. Thuộc tính `data-spec-id` đảm bảo match exact.
- **JSON Schema v1**: single source of truth cho định dạng spec. Được validate phía client (ajv) và phía server (Go jsonschema). CI cross-validate cả hai.
- **Demo app**: ví dụ React 19 + Vite với `.specs/` đã seed sẵn để dùng thử tức thì.

## Non-Goals (dự kiến / đang cân nhắc)

- Capture có AI hỗ trợ (`specpin generate`) - giữ mọi công việc LLM ra ngoài extension và CLI.
- Source adapter dùng FileSystem Access API - hiện sidecar + dự án cục bộ ghi được đã đủ cho việc authoring.
- Đóng gói Safari - Chrome và Firefox đã có; Safari hoãn lại.
- Các renderer overlay và inline-badge - **đã bỏ vì trùng lặp**: overlay trùng với modal + spotlight của Guide mode, inline-badge trùng với badge của tooltip. Giá trị enum vẫn giữ reserved; hiện đã ship tooltip, sidebar, và modal.

## Ranh giới phạm vi

**Trong phạm vi:**
- Workflow phát triển local (serve + extension trên localhost).
- Cộng tác qua Git (review thay đổi spec qua PR).
- Đọc + ghi spec qua extension trên bất kỳ trang web nào mà sidecar phục vụ.
- Phím tắt cho capture mode (Ctrl+Shift+C để toggle).

**Ngoài phạm vi:**
- Cộng tác real-time đa người dùng (không CRDT, không WebSocket sync ngoài việc SSE reload).
- Sidecar hosted/cloud (mặc định chỉ localhost; remote là tùy chọn qua reverse proxy HTTPS).
- Phân tích spec, theo dõi usage, hay telemetry.
- Tích hợp với công cụ bên ngoài (Jira, Linear, Notion) - workflow Git thuần.
- Hỗ trợ ứng dụng mobile (chỉ browser extension).

## Tiêu chí thành công

**Đã đạt:**
- [ ] Demo được end-to-end: serve demo app, load extension, thấy các spec đã seed render ra (tooltip + sidebar).
- [ ] Capture spec mới qua form thủ công, lưu vào `.specs/`, xác minh việc ghi + SSE reload.
- [ ] Schema được validate ở cả client (ajv) và server (Go), CI cross-validate các fixture.
- [ ] Extension build cho Chrome (MV3) + Firefox (MV2).
- [ ] Bảo mật sidecar: bind 127.0.0.1, token auth, CORS giới hạn ở các extension origin, path-traversal guard, không cho web origin truy cập.
- [ ] CI xanh: lint, typecheck, test (TS + Go), build (workspace + sidecar), kiểm tra schema drift.

**Dự kiến / đang cân nhắc:**
- Source FileSystem Access để import các spec sẵn có.
- Đóng gói Safari.
- `specpin generate` (authoring spec có AI hỗ trợ).

## Tóm tắt kiến trúc

Luồng local-first ba tầng:

```
.specs/ (consumer repo, Git-versioned JSON)
   |
   v
specpin serve (Go sidecar, localhost HTTP+SSE, token-auth, 127.0.0.1 only)
   |
   v
browser extension (WXT MV3, Chrome+Firefox)
   - background SW: SidecarClient + spec cache + SSE relay
   - content script: matchElement(fingerprint) -> render(tooltip|sidebar)
   - popup/options: connection config, on/off toggle, capture trigger
```

Một schema, hai validator: `packages/spec-schema/schema/v1.json` là SSOT. Phía TS validate bằng ajv. Go sidecar embed một bản copy tại `apps/cli/internal/schema/v1.json`, đồng bộ qua `make sync-schema`, validate bằng `santhosh-tekuri/jsonschema/v6`. CI cross-validate cả hai trên một bộ fixture dùng chung và fail nếu có drift.

## Yêu cầu phi chức năng

- **Hiệu năng**: bundle content script của extension < 500 KB chưa nén (hiện ~450 KB với ajv). Fingerprint match < 50ms mỗi element (hiện < 10ms với các anchor exact). Độ trễ render < 100ms sau khi match.
- **Bảo mật**: sidecar chỉ bind 127.0.0.1, tự chọn port trống, yêu cầu Bearer token trên mọi request, CORS chỉ chấp nhận các extension origin (`chrome-extension://`, `moz-extension://`), từ chối các web origin, có path-traversal guard khi ghi, không truy cập mạng bên ngoài.
- **Tương thích**: Node >= 22, pnpm 11, Go 1.26, Chrome 120+ (MV3), Firefox 115+ (MV2 compat). Fingerprinting thuần DOM (không coupling với framework).
- **Khả năng bảo trì**: TypeScript strict mode + noUncheckedIndexedAccess. Biome (lint + format). Các file sinh tự động (`*.gen.*`) không bao giờ chỉnh tay. Monorepo điều phối bằng Turborepo. Vitest cho mọi package TS, testing bằng Go stdlib cho CLI.
- **License**: Apache-2.0.

## Rủi ro & biện pháp giảm thiểu

| Rủi ro | Tác động | Biện pháp giảm thiểu | Trạng thái |
|--------|----------|----------------------|------------|
| Schema drift giữa Go/TS (hai validator) | Critical | CI `make check-schema` + cross-validate fixture qua cả hai | Implemented |
| Fingerprint dễ vỡ khi refactor | High | Ưu tiên các anchor exact (test-id, aria, data-spec-id); hybrid scorer đã ship (weights tuning tiếp tục) với drift corpus opt-in cục bộ | Shipped |
| Bundle content-script của extension phình to | Medium | Validator ajv (~100 KB) nằm trong content script; cân nhắc chuyển validation sang SW về sau | Accepted |
| Xung đột port khi dev nhiều project | Low | Tự chọn port trống trừ khi có override --port | Implemented |
| Rò rỉ spec cross-origin sang subdomain nhái | High | Chỉ match subdomain dạng host-exact hoặc theo ranh giới label; có regression test | Fixed |

## Câu hỏi chưa giải quyết

1. **Tuning hybrid fingerprint scorer**: WEIGHTS table trong `packages/fingerprint-core/src/score.ts` là điểm tuning duy nhất (signal weight và confidence threshold); v1 scorer đã ship và hoạt động, nhưng weight cần tuning dogfood từ dữ liệu refactor thực tế từ production.
2. **UX cấp quyền FileSystem Access API**: prompt người dùng cấp quyền truy cập thư mục `.specs/` thế nào mà không phá vỡ capture flow? Dự kiến.
3. **Timeline đóng gói Safari**: mức độ parity MV3 chưa rõ tính tới 2026-06. Chờ Apple làm rõ.
4. **Capture có AI hỗ trợ (`specpin generate`)**: model nào, prompt dạng gì, local hay cloud, quản lý key ra sao? Dự kiến; chưa chốt quyết định nào.

## Tài liệu tham khảo

- Architecture: `docs/system-architecture.md`
- Run guide: `docs/run-guide.md`
- Schema: `docs/schema-reference.md`
- Design system: `docs/design-system.md`
