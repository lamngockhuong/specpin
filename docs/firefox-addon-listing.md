# Firefox Add-on Listing - Describe Add-on

> Reference for the Firefox Developer Hub "Submit a New Add-on" form.
> URL: <https://addons.mozilla.org/en-US/developers/>

---

## Add-on URL

`https://addons.mozilla.org/en-US/firefox/addon/specpin/`

---

## Description

### English (en)

Specpin attaches business specifications (rules, descriptions, acceptance criteria) directly onto the elements of a running web UI, then renders them in-browser as you hover or browse.

It is NOT a spec-driven code generator: it generates no application code. It is a knowledge layer that pins living, Git-versioned documentation onto the interface you already have. Specs live as JSON in your repo's `.specs/` directory and are served to the add-on by a small local Go sidecar over token-authenticated localhost. Nothing leaves your machine.

Features:

• Pin specs onto live elements: resilient multi-signal fingerprint matching (test-id, aria, selector, xpath, text, position) so specs survive refactors.

• Three display modes: tooltip, sidebar, and a draggable modal renderer. Switch with one click or Alt+Shift+M.

• Manual capture: click an element and author a spec in place, no leaving the page. Toggle capture with Alt+Shift+C.

• Writable local projects: edit, capture, create, and group-zip export specs, even without a running sidecar.

• Multi-project connections: one add-on serves many projects at once, routed to each page by origin, with per-project enable/disable.

• Sidebar surface: open Specpin in Firefox's sidebar with inline spec detail and live auto-refresh.

• Spec search: live client-side filter by title, file, tags, and description.

• Multi-language spec content: locale-keyed strings with an in-browser language toggle and a tabbed per-locale editor.

• Markdown-formatted specs: descriptions and business rules carry a safe Markdown subset (bold, italic, links, lists), authored via a toolbar and rendered across every surface.

• User-selectable theme: System / Light / Dark, with dual-theme design tokens.

• Bilingual interface (EN + VI), independent from the spec content language.

Secure by default: the sidecar binds 127.0.0.1 only, uses bearer-token auth, accepts only extension-origin CORS, and guards writes against path traversal. Open-source. No data collection, no tracking, no remote code.

### Vietnamese (vi)

Specpin gắn đặc tả nghiệp vụ (quy tắc, mô tả, tiêu chí chấp nhận) trực tiếp lên các phần tử của một giao diện web đang chạy, rồi hiển thị chúng ngay trong trình duyệt khi bạn rê chuột hoặc duyệt trang.

Specpin KHÔNG phải công cụ sinh code từ đặc tả: nó không tạo ra mã ứng dụng nào. Đây là một lớp tri thức ghim tài liệu sống, được quản lý phiên bản bằng Git, lên chính giao diện bạn đang có. Đặc tả nằm dưới dạng JSON trong thư mục `.specs/` của repo và được phục vụ cho tiện ích bởi một sidecar Go cục bộ nhỏ qua localhost có xác thực token. Không có gì rời khỏi máy của bạn.

Tính năng:

• Ghim đặc tả lên phần tử sống: đối sánh vân tay đa tín hiệu bền bỉ (test-id, aria, selector, xpath, văn bản, vị trí) để đặc tả vẫn khớp sau khi refactor.

• Ba chế độ hiển thị: tooltip, sidebar, và modal kéo thả được. Chuyển đổi bằng một cú nhấp hoặc Alt+Shift+M.

• Bắt thủ công (Manual capture): nhấp vào một phần tử và soạn đặc tả ngay tại chỗ, không cần rời trang. Bật/tắt chế độ bắt bằng Alt+Shift+C.

• Dự án cục bộ có thể ghi: chỉnh sửa, bắt, tạo mới và xuất đặc tả theo nhóm dạng zip, kể cả khi không có sidecar đang chạy.

• Kết nối nhiều dự án: một tiện ích phục vụ nhiều dự án cùng lúc, định tuyến tới từng trang theo origin, kèm bật/tắt riêng cho từng dự án.

• Bề mặt sidebar: mở Specpin trong sidebar của Firefox với chi tiết đặc tả nội tuyến và tự động làm mới trực tiếp.

• Tìm kiếm đặc tả: lọc phía client theo tiêu đề, tệp, thẻ và mô tả.

• Nội dung đặc tả đa ngôn ngữ: chuỗi theo locale với công tắc đổi ngôn ngữ trong trình duyệt và trình soạn theo tab cho từng locale.

• Đặc tả định dạng Markdown: mô tả và quy tắc nghiệp vụ hỗ trợ một tập con Markdown an toàn (đậm, nghiêng, liên kết, danh sách), soạn qua thanh công cụ và hiển thị trên mọi bề mặt.

• Chủ đề do người dùng chọn: Theo hệ thống / Sáng / Tối, với design token hai chủ đề.

• Giao diện song ngữ (EN + VI), độc lập với ngôn ngữ nội dung đặc tả.

An toàn theo mặc định: sidecar chỉ lắng nghe 127.0.0.1, dùng xác thực bearer-token, chỉ chấp nhận CORS từ origin của tiện ích, và chống path traversal khi ghi. Mã nguồn mở. Không thu thập dữ liệu, không theo dõi, không dùng mã từ xa.

---

## This add-on requires payment

**No** (unchecked)

---

## Categories

Select up to 2:

- [x] **Web Development**
- [ ] Other

---

## Support email

_(optional - leave blank or use personal email)_

---

## Support URL

```
https://github.com/lamngockhuong/specpin/issues
```

---

## License

**Apache License 2.0**

---

## This Add-on has a Privacy Policy

**Yes** (checked)

Privacy Policy URL:

```
https://specpin.ohnice.app/help/privacy-policy/
```

---

## Summary (if separate field)

> Pin living business specs onto the elements of your running web UI. Git-native, local-first, framework-agnostic.

---

## Notes for Firefox review (Notes to reviewer)

> Specpin connects only to a user-run local sidecar on localhost (127.0.0.1 / localhost) over HTTP + Server-Sent Events; it makes no remote network requests and executes no remote code. To exercise the add-on:
>
> 1. Build and run the Go sidecar (`apps/cli`: `make build` then `specpin serve`), which prints a localhost URL + bearer token.
> 2. Open the add-on options, add a connection with that URL + token.
> 3. Open the bundled demo app (`examples/demo-react-app`, http://localhost:3000) and specs render on their elements.
>
> The add-on is also usable offline via local projects (no sidecar), which exercises the storage-backed authoring path.

---

## What you need to prepare before submitting (Cần chuẩn bị trước khi nộp)

Text fields above are ready to paste. The items below are NOT in this repo yet and you must prepare them manually:

- [ ] **Developer account**: a Firefox Add-on Developer Hub account (free). Verify the account email.
- [ ] **Packaged build**: `pnpm --filter @specpin/extension build:firefox` -> `.output/firefox-mv2`, then `pnpm --filter @specpin/extension zip` for the Firefox target. Bump the manifest `version` from `0.0.0` to `0.1.0` before zipping (the planned first release).
- [ ] **Source code submission**: AMO requires reviewable source for any build step. Provide the repo (or a source ZIP) plus build instructions: `pnpm install && pnpm --filter @specpin/extension build:firefox`. Note the pnpm/Turbo monorepo and Node >= 20.
- [ ] **Stable add-on ID**: already set (`specpin@ohnice.app` via `browser_specific_settings.gecko.id` in `wxt.config.ts`). Keep it stable across releases.
- [ ] **Screenshots**: at least 1, ideally 5. Use the [Screenshot shot list](./chrome-web-store-listing.md#screenshot-shot-list) in the Chrome listing doc (for Firefox, swap the side panel for Firefox's sidebar).
- [ ] **Icon**: 128x128 PNG (already have `apps/extension/public/icon/128.png`).
- [ ] **Privacy policy live**: deploy the website so <https://specpin.ohnice.app/help/privacy-policy/> resolves before submitting.
- [ ] **Permission justifications**: Firefox may ask why each permission is needed at review; reuse the justifications from `docs/chrome-web-store-listing.md` (Privacy section).
