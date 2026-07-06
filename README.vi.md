🇬🇧 [English](README.md) • 🇻🇳 **Tiếng Việt** • 🇯🇵 [日本語](README.ja.md)

<p align="center">
  <img src="apps/extension/designs/specpin-icon.png" alt="Specpin" width="112" height="112" />
</p>

<h1 align="center">Specpin</h1>

<p align="center">
  Ghim đặc tả nghiệp vụ hệ thống lên các phần tử trên giao diện web đang chạy.<br>
  Gắn liền với Git, ưu tiên cục bộ, không phụ thuộc framework. <strong>Không sinh code.</strong>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn">
    <img src="https://img.shields.io/chrome-web-store/v/kkfmoieoahdjneagognaoedggkiiolkn?label=chrome&style=flat-square&logo=googlechrome&logoColor=white&color=4285F4" alt="Chrome Web Store Version">
  </a>
  <a href="https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn">
    <img src="https://img.shields.io/chrome-web-store/users/kkfmoieoahdjneagognaoedggkiiolkn?style=flat-square&color=2DD4BF" alt="Chrome Web Store Users">
  </a>
  <a href="https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn">
    <img src="https://img.shields.io/chrome-web-store/rating/kkfmoieoahdjneagognaoedggkiiolkn?style=flat-square&color=facc15" alt="Chrome Web Store Rating">
  </a>
  <a href="https://github.com/lamngockhuong/specpin/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/lamngockhuong/specpin/ci.yml?style=flat-square&label=CI&color=2DD4BF&logo=githubactions&logoColor=white" alt="CI">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/lamngockhuong/specpin?style=flat-square&color=2DD4BF" alt="Apache-2.0 License">
  </a>
  <a href="https://github.com/lamngockhuong/specpin/stargazers">
    <img src="https://img.shields.io/github/stars/lamngockhuong/specpin?style=flat-square&color=f59e0b" alt="GitHub Stars">
  </a>
  <img src="https://img.shields.io/badge/Node-%E2%89%A522-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node >= 22">
  <img src="https://img.shields.io/badge/Go-1.26-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go 1.26">
  <img src="https://img.shields.io/badge/MV3-Chrome%20%2B%20Firefox-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome + Firefox">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn">
    <img src="https://img.shields.io/badge/Cài_từ-Chrome_Web_Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Cài từ Chrome Web Store">
  </a>
  <img src="https://img.shields.io/badge/Firefox_Add--ons-Sắp_có-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Firefox Add-ons - Sắp có">
</p>

<p align="center">
  <a href="https://specpin.ohnice.app/vi/">Website</a> •
  <a href="#bắt-đầu-nhanh">Bắt đầu nhanh</a> •
  <a href="#tính-năng">Tính năng</a> •
  <a href="#cách-hoạt-động">Cách hoạt động</a> •
  <a href="#tài-liệu">Tài liệu</a> •
  <a href="README.md">English</a>
</p>

<p align="center">
  <img src="apps/extension/store-assets/readme-hero.png" alt="Specpin: một spec được ghim lên phần tử UI đang chạy, kèm side panel liệt kê mọi spec trên trang" width="760" />
</p>

---

## Specpin là gì?

Specpin gắn **đặc tả nghiệp vụ** (quy tắc, mô tả, tiêu chí nghiệm thu) trực tiếp lên các phần tử của một web UI *đang chạy*, rồi hiển thị chúng ngay trong trình duyệt khi bạn rê chuột hoặc duyệt trang.

Specpin **không phải** công cụ sinh code từ đặc tả (không liên quan tới GitHub Spec Kit / OpenSpec): nó không sinh ra bất kỳ code ứng dụng nào. Đây là một lớp tri thức ghim tài liệu luôn cập nhật, được quản lý phiên bản bằng Git, lên đúng giao diện bạn đã có sẵn. Giao diện vốn đã biết mọi thứ nằm ở đâu; Specpin trao cho nó một bộ nhớ.

- **Gắn liền với Git.** Đặc tả được lưu dưới dạng JSON trong thư mục `.specs/` của repo: có phiên bản, review được qua PR, và xem diff được.
- **Ưu tiên cục bộ.** Một sidecar Go nhỏ phục vụ đặc tả qua API localhost có xác thực token; theo mặc định không có gì rời khỏi máy của bạn. Các nhóm có thể tùy chọn chạy chính sidecar đó trên máy chủ của riêng họ phía sau một reverse proxy HTTPS (xem hướng dẫn chạy).
- **Liên kết bền bỉ.** Phần tử được khớp bằng fingerprint đa tín hiệu (test-id, aria, selector, xpath, text, vị trí), nên đặc tả vẫn sống sót qua các đợt refactor.
- **Không phụ thuộc framework.** Khớp thuần DOM nên chạy trên mọi trang hoặc framework.

## Cách hoạt động

```
.specs/ (trong repo của bạn)  -->  specpin serve (sidecar Go, localhost HTTP + SSE)  -->  extension trình duyệt (khớp + hiển thị)
```

1. `specpin init` tạo khung `.specs/manifest.json` trong repo của bạn.
2. `specpin serve` mở `.specs/` qua API HTTP localhost có xác thực token kèm live-reload (SSE).
3. Extension trình duyệt kết nối tới sidecar, khớp fingerprint của từng đặc tả với DOM đang chạy, rồi hiển thị đặc tả lên đúng phần tử.

## Cài đặt extension

Cài Specpin cho Chrome từ **[Chrome Web Store](https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn)**. Ghim nó lên thanh công cụ để truy cập nhanh.

Firefox Add-ons sắp có. Trong lúc chờ, người dùng Firefox có thể build từ mã nguồn và nạp dạng unpacked (xem [hướng dẫn chạy](./docs/vi/run-guide.md)).

## Cài đặt CLI

Sidecar là một file binary độc lập. Cách dễ nhất là qua npm, nó tự tải binary
khớp với OS và CPU của bạn:

```bash
npm install -g @specpin/cli     # hoặc: pnpm add -g @specpin/cli
specpin --version

# hoặc chạy không cần cài:
npx @specpin/cli serve
```

Muốn lấy binary thô? Tải `specpin-<os>-<arch>` từ
[bản phát hành CLI mới nhất](https://github.com/lamngockhuong/specpin/releases?q=cli),
hoặc build từ source: `cd apps/cli && make build`.

## Bắt đầu nhanh

```bash
# 1. Cài đặt CLI
npm install -g @specpin/cli

# 2. Trong repo dự án của bạn: tạo khung và phục vụ đặc tả
specpin init                   # tạo .specs/manifest.json
specpin serve                  # in ra URL localhost + bearer token

# 3. Cài extension và kết nối
#    Chrome:  cài từ Chrome Web Store (link ở trên)
#    Firefox: build unpacked (AMO sắp có) -> pnpm --filter @specpin/extension build:firefox
```

Dán URL + token vừa in vào phần cài đặt kết nối của extension, mở ứng dụng của bạn, và đặc tả sẽ hiển thị trên đúng phần tử. Xem **[`docs/vi/run-guide.md`](./docs/vi/run-guide.md)** để biết toàn bộ vòng lặp init -> serve -> nạp -> kết nối -> hiển thị -> capture, hoặc thử ngay với **[ứng dụng demo](./examples/demo-react-app)** đi kèm:

```bash
pnpm --filter @specpin/demo-react-app dev   # http://localhost:3000, có sẵn .specs/ mẫu
```

### Soạn spec bằng AI

Để một coding agent soạn spec giúp bạn. Một skill đóng gói trong `@specpin/cli` (truy cập tại `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`) dạy Claude Code, Cursor và các agent tương tự soạn `.specs/` hợp lệ schema và chạy `specpin validate`. Xem **[`docs/vi/ai-authoring.md`](./docs/vi/ai-authoring.md)**.

## Tính năng

- **Ghim đặc tả lên phần tử đang chạy** - khớp fingerprint bền bỉ (test-id, aria, selector, xpath, text, vị trí)
- **Khớp có chấm điểm tin cậy** - bộ chấm điểm hybrid có trọng số dự phòng khi anchor chính xác thất bại, với các mức tin cậy, gợi ý "vì sao khớp", và tín hiệu cần-review
- **Ba chế độ hiển thị** - tooltip, sidebar, và modal kéo thả được
- **Capture thủ công** - click vào một phần tử và soạn đặc tả ngay tại chỗ, không cần rời trang
- **Xoá spec tại chỗ** - xoá một spec ghi được từ tooltip hoặc side panel sau một hộp xác nhận nguy hiểm (spec sidecar khôi phục từ Git; spec cục bộ từ storage)
- **Dự án cục bộ ghi được** - sửa, capture, tạo mới, và export nhóm dạng zip mà không cần sidecar đang chạy
- **Kết nối nhiều dự án** - một extension phục vụ nhiều dự án cùng lúc, định tuyến tới từng trang theo origin
- **Bật/tắt theo từng dự án** - đóng/mở từng kết nối độc lập với công tắc bật/tắt toàn cục
- **Bề mặt side panel** - mở Specpin trong side panel của Chrome / sidebar của Firefox, kèm chi tiết đặc tả inline
- **Guide mode** - tour onboarding theo spec ở hai phạm vi team + cá nhân, với spotlight overlay, popover được neo, và phím tắt
- **Điều hướng người đọc** - deep-link chia sẻ spec, phím tắt duyệt vòng qua các spec trên trang, và digest "N thay đổi kể từ lần xem trước"
- **Tìm kiếm đặc tả** - lọc phía client theo thời gian thực dựa trên tiêu đề, file, tag và mô tả
- **Lọc spec** - ẩn/hiện spec theo tag, file, hoặc trang qua checklist facet; mặc định team (`views.json` commit vào repo) cùng override cá nhân
- **Huy hiệu nguồn** - nhận biết nhanh đặc tả đến từ sidecar hay từ batch cục bộ
- **Nội dung đặc tả đa ngôn ngữ** - chuỗi theo locale với công tắc đổi ngôn ngữ ngay trong trình duyệt và trình soạn thảo theo từng locale dạng tab
- **Đặc tả định dạng Markdown** - mô tả và quy tắc nghiệp vụ mang một tập con Markdown an toàn (đậm, nghiêng, liên kết, danh sách), soạn qua thanh công cụ và hiển thị trên mọi bề mặt
- **Tự chọn giao diện** - System / Light / Dark, design token hai chế độ
- **i18n cho giao diện** - tiếng Anh + tiếng Việt + tiếng Nhật, độc lập với ngôn ngữ nội dung đặc tả
- **Hỗ trợ & Phản hồi** - liên kết một chạm từ trang Tùy chọn tới GitHub Issues và Discussions của dự án
- **Soạn spec bằng AI** - một skill đóng gói trong `@specpin/cli` dạy coding agent (Claude Code, Cursor, v.v.) soạn spec hợp lệ schema và điều khiển CLI; bản thân CLI không có LLM
- **Nguồn gốc & tin cậy** - status tùy chọn (draft / approved / deprecated), link issue/PR, test liên kết (`verifiedBy`), và độ tươi review kèm chỉ báo cũ (stale)
- **Kiểm tra offline** - `specpin validate` + spec-lint trong CI để giữ `.specs/` luôn hợp lệ
- **Quản trị sức khỏe spec** - `specpin report` kiểm tra độ tươi, thống kê, và spec bắt buộc, với `--fail-on` để gate CI
- **An toàn mặc định** - sidecar mặc định bind `127.0.0.1` (remote là tùy chọn qua reverse proxy HTTPS), xác thực bearer-token, CORS chỉ chấp nhận origin của extension, ghi file có chặn path-traversal, ghi nhiều-người tuần tự hóa

## Cấu trúc monorepo

```text
specpin/
├── apps/
│   ├── extension/            # Extension WXT MV3 đa trình duyệt (Chrome + Firefox)
│   └── cli/                  # Binary sidecar Go: init + serve
├── packages/
│   ├── spec-schema/          # JSON Schema v1 (SSOT) + TS types sinh ra + validators
│   ├── fingerprint-core/     # capture + match không phụ thuộc framework (chỉ DOM)
│   └── api-client/           # TS client có kiểu cho hợp đồng HTTP của sidecar
├── examples/
│   └── demo-react-app/       # app mẫu + .specs/ có sẵn để dùng thử Specpin
└── docs/                     # kiến trúc, hướng dẫn chạy, tham chiếu schema
```

## Bộ công cụ

- Node >= 22, pnpm 11, Turborepo
- Go 1.26 (sidecar CLI)
- Vitest (mọi package TS), Biome (lint + format)

## Script trong workspace

```bash
pnpm install          # cài deps cho workspace
pnpm build            # turbo run build trên toàn bộ packages
pnpm test             # turbo run test (vitest theo từng package)
pnpm lint             # biome check . (lint + format + sắp xếp import)
pnpm typecheck        # tsc --noEmit theo từng package
pnpm schema-validate  # cross-validate bộ fixture
```

Một package hoặc một test đơn lẻ:

```bash
pnpm --filter @specpin/fingerprint-core test
pnpm --filter @specpin/fingerprint-core exec vitest run -t "match"
```

Sidecar Go (trong `apps/cli`):

```bash
make build          # sync-schema rồi go build -> bin/specpin
make check-schema   # cổng CI: fail nếu schema nhúng bị lệch
go test ./...
```

## Tài liệu

> Bản dịch tiếng Việt của các tài liệu nằm trong [`docs/vi/`](./docs/vi/). Tiếng Anh là nguồn chuẩn (source of truth).

- [`docs/vi/project-overview-pdr.md`](./docs/vi/project-overview-pdr.md) - tổng quan sản phẩm, vấn đề, mục tiêu, PDR
- [`docs/vi/system-architecture.md`](./docs/vi/system-architecture.md) - thành phần, package, fingerprinting, mô hình bảo mật
- [`docs/vi/codebase-summary.md`](./docs/vi/codebase-summary.md) - tóm tắt theo từng package, file chính, trách nhiệm
- [`docs/vi/run-guide.md`](./docs/vi/run-guide.md) - toàn bộ vòng lặp end-to-end (init -> serve -> nạp -> kết nối -> hiển thị -> capture)
- [`docs/vi/ai-authoring.md`](./docs/vi/ai-authoring.md) - soạn spec bằng coding agent qua skill `@specpin/cli` đóng gói
- [`docs/vi/schema-reference.md`](./docs/vi/schema-reference.md) - định dạng đặc tả v1
- [`docs/vi/code-standards.md`](./docs/vi/code-standards.md) - quy ước TS/Go, cấu hình công cụ, quản lý schema
- [`docs/vi/design-system.md`](./docs/vi/design-system.md) - mockup giao diện extension + quy trình token màu/font dùng chung
- [`docs/vi/project-roadmap.md`](./docs/vi/project-roadmap.md) - các tính năng đã có + tính năng dự kiến

## Đóng góp

Xem [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md). Trước khi mở PR, chạy đầy đủ cổng kiểm tra:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm schema-validate
cd apps/cli && make check-schema && go test ./...
```

## Trạng thái

Specpin đã phát hành và có mặt trên [Chrome Web Store](https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn); Firefox Add-ons sắp có. Đang tiếp tục phát triển. Xem [`docs/vi/project-roadmap.md`](./docs/vi/project-roadmap.md) để biết năng lực đã ship, việc dự kiến, và nhật ký quyết định.

## Tài trợ

Nếu Specpin hữu ích với bạn, hãy cân nhắc hỗ trợ quá trình phát triển:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub_Sponsors-Support-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/lamngockhuong)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-Support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/lamngockhuong)
[![MoMo](https://img.shields.io/badge/MoMo-Support-ae2070)](https://me.momo.vn/khuong)

## Dự án khác

- [TabRest](https://github.com/lamngockhuong/tabrest) - Extension Chrome tự động unload các tab không hoạt động để giải phóng bộ nhớ
- [GitHub Flex](https://github.com/lamngockhuong/github-flex) - Extension đa trình duyệt nâng cấp giao diện GitHub với các tính năng tăng năng suất
- [Termote](https://github.com/lamngockhuong/termote) - Điều khiển từ xa các CLI (Claude Code, GitHub Copilot, mọi terminal) từ mobile/desktop qua PWA

## Giấy phép

[Apache-2.0](./LICENSE).
