# Chrome Web Store Listing

> Reference for the Chrome Web Store "Store listing" + "Privacy practices" tabs.
> Dashboard: <https://chrome.google.com/webstore/devconsole>

## English (en)

**Name:**
Specpin

**Summary:**
Pin living business specs onto the elements of your running web UI. Git-native, local-first, framework-agnostic.

**Description:**
Specpin attaches business specifications (rules, descriptions, acceptance criteria) directly onto the elements of a running web UI, then renders them in-browser as you hover or browse.

It is NOT a spec-driven code generator: it generates no application code. It is a knowledge layer that pins living, Git-versioned documentation onto the interface you already have. Specs live as JSON in your repo's `.specs/` directory and are served to the extension by a small local Go sidecar over token-authenticated localhost. Nothing leaves your machine.

Features:

- Pin specs onto live elements: resilient multi-signal fingerprint matching (test-id, aria, selector, xpath, text, position) so specs survive refactors.

- Three display modes: tooltip, side panel, and a draggable modal renderer. Switch with one click or Alt+Shift+M.

- Manual capture: click an element and author a spec in place, no leaving the page. Toggle capture with Alt+Shift+C.

- Writable local projects: edit, capture, create, and group-zip export specs, even without a running sidecar.

- Multi-project connections: one extension serves many projects at once, routed to each page by origin, with per-project enable/disable.

- Side panel surface: open Specpin in Chrome's side panel with inline spec detail and live auto-refresh.

- Spec search: live client-side filter by title, file, tags, and description.

- Multi-language spec content: locale-keyed strings with an in-browser language toggle and a tabbed per-locale editor.

- Markdown-formatted specs: descriptions and business rules carry a safe Markdown subset (bold, italic, links, lists), authored via a toolbar and rendered across every surface.

- User-selectable theme: System / Light / Dark, with dual-theme design tokens.

- Bilingual interface (EN + VI), independent from the spec content language.

Secure by default: the sidecar binds 127.0.0.1 only, uses bearer-token auth, accepts only extension-origin CORS, and guards writes against path traversal. Open-source, built with Manifest V3. No data collection, no tracking, no remote code.

**Category:**
Developer Tools

---

## Vietnamese (vi)

**Name (Tên):**
Specpin

**Summary (Thông tin tóm tắt):**
Ghim đặc tả nghiệp vụ sống lên các phần tử của giao diện web đang chạy. Git-native, ưu tiên cục bộ, không phụ thuộc framework.

**Description (Mô tả):**
Specpin gắn đặc tả nghiệp vụ (quy tắc, mô tả, tiêu chí chấp nhận) trực tiếp lên các phần tử của một giao diện web đang chạy, rồi hiển thị chúng ngay trong trình duyệt khi bạn rê chuột hoặc duyệt trang.

Specpin KHÔNG phải công cụ sinh code từ đặc tả: nó không tạo ra mã ứng dụng nào. Đây là một lớp tri thức ghim tài liệu sống, được quản lý phiên bản bằng Git, lên chính giao diện bạn đang có. Đặc tả nằm dưới dạng JSON trong thư mục `.specs/` của repo và được phục vụ cho tiện ích bởi một sidecar Go cục bộ nhỏ qua localhost có xác thực token. Không có gì rời khỏi máy của bạn.

Tính năng:

- Ghim đặc tả lên phần tử sống: đối sánh vân tay đa tín hiệu bền bỉ (test-id, aria, selector, xpath, văn bản, vị trí) để đặc tả vẫn khớp sau khi refactor.

- Ba chế độ hiển thị: tooltip, side panel, và modal kéo thả được. Chuyển đổi bằng một cú nhấp hoặc Alt+Shift+M.

- Bắt thủ công (Manual capture): nhấp vào một phần tử và soạn đặc tả ngay tại chỗ, không cần rời trang. Bật/tắt chế độ bắt bằng Alt+Shift+C.

- Dự án cục bộ có thể ghi: chỉnh sửa, bắt, tạo mới và xuất đặc tả theo nhóm dạng zip, kể cả khi không có sidecar đang chạy.

- Kết nối nhiều dự án: một tiện ích phục vụ nhiều dự án cùng lúc, định tuyến tới từng trang theo origin, kèm bật/tắt riêng cho từng dự án.

- Bề mặt side panel: mở Specpin trong side panel của Chrome với chi tiết đặc tả nội tuyến và tự động làm mới trực tiếp.

- Tìm kiếm đặc tả: lọc phía client theo tiêu đề, tệp, thẻ và mô tả.

- Nội dung đặc tả đa ngôn ngữ: chuỗi theo locale với công tắc đổi ngôn ngữ trong trình duyệt và trình soạn theo tab cho từng locale.

- Đặc tả định dạng Markdown: mô tả và quy tắc nghiệp vụ hỗ trợ một tập con Markdown an toàn (đậm, nghiêng, liên kết, danh sách), soạn qua thanh công cụ và hiển thị trên mọi bề mặt.

- Chủ đề do người dùng chọn: Theo hệ thống / Sáng / Tối, với design token hai chủ đề.

- Giao diện song ngữ (EN + VI), độc lập với ngôn ngữ nội dung đặc tả.

An toàn theo mặc định: sidecar chỉ lắng nghe 127.0.0.1, dùng xác thực bearer-token, chỉ chấp nhận CORS từ origin của tiện ích, và chống path traversal khi ghi. Mã nguồn mở, xây dựng với Manifest V3. Không thu thập dữ liệu, không theo dõi, không dùng mã từ xa.

**Category (Loại):**
Developer Tools (Công cụ dành cho nhà phát triển)

---

## Additional Fields (Các trường bổ sung)

**Official URL (URL chính thức):**
<https://specpin.ohnice.app>

**Homepage URL (URL trang chủ):**
<https://github.com/lamngockhuong/specpin>

**Support URL (URL hỗ trợ):**
<https://github.com/lamngockhuong/specpin/issues>

**Mature content (Nội dung người lớn):**
Off (Tắt)

---

## Privacy (Quyền riêng tư)

### Single Purpose (Mục đích duy nhất)

Match Git-versioned business specifications from a local sidecar (or local projects) against the elements of the current page and render them in-browser.

### Permission Justifications (Lý do yêu cầu quyền)

**storage:**
Store connection settings (sidecar URL + bearer token per project), local project specs, and user preferences (theme, interface language, display mode, default surface). No sync of personal data.

**activeTab / tabs:**
Determine the active tab's origin to route the correct project's specs to each page, and relay spec updates (including live SSE reload events) from the background service worker to the content scripts of matching tabs.

**alarms:**
Run a one-minute keepalive alarm so the background service worker stays alive to maintain the live-reload (SSE) connection to the local sidecar.

**contextMenus:**
Provide a right-click "Specpin" submenu on the page for quick actions (toggle, capture, display mode).

**sidePanel:**
Open the Specpin surface in Chrome's side panel for an inline, persistent spec browser alongside the page.

**host_permissions - http://127.0.0.1/* , http://localhost/* :**
Connect from the background service worker to the local Go sidecar over localhost HTTP + SSE to read `.specs/` and receive live-reload updates. Specpin makes no requests to any remote host.

### Remote Code (Có phải bạn đang dùng mã từ xa không?)

No. The extension executes no remote code and loads no remote scripts. It communicates only with a user-run sidecar on localhost (127.0.0.1 / localhost); all spec data stays on the user's machine.

### Data Usage (Sử dụng dữ liệu)

Extension does NOT collect or use any of the following:

- [ ] Thông tin nhận dạng cá nhân
- [ ] Thông tin sức khỏe
- [ ] Thông tin thanh toán và tài chính
- [ ] Thông tin xác thực
- [ ] Thông tin liên lạc cá nhân
- [ ] Thông tin vị trí
- [ ] Lịch sử duyệt web
- [ ] Hoạt động của người dùng
- [ ] Nội dung trang web

Check all 3 certifications:

- [x] Tôi không bán hoặc chuyển dữ liệu người dùng cho bên thứ ba, ngoại trừ những trường hợp sử dụng đã được phê duyệt
- [x] Tôi không sử dụng hoặc chuyển dữ liệu người dùng cho các mục đích không liên quan đến mục đích duy nhất của tiện ích
- [x] Tôi không sử dụng hoặc chuyển dữ liệu người dùng để xác định khả năng thanh toán nợ hoặc phục vụ mục đích cho vay

### Privacy Policy URL (Chính sách quyền riêng tư)

<https://specpin.ohnice.app/help/privacy-policy/>

---

## What you need to prepare before submitting (Cần chuẩn bị trước khi nộp)

Text fields above are ready to paste. The items below are NOT in this repo yet and you must prepare them manually:

- [ ] **Developer account**: a Chrome Web Store developer account (one-time 5 USD registration fee). Verify the publisher email.
- [ ] **Packaged build**: `pnpm --filter @specpin/extension zip` (or `build` -> `.output/chrome-mv3`) to produce the upload ZIP. Bump the manifest `version` from `0.0.0` to `0.1.0` before zipping (the planned first release).
- [ ] **Store icon**: 128x128 PNG (already have `apps/extension/public/icon/128.png`).
- [ ] **Screenshots**: at least 1, ideally 5. Size **1280x800** or 640x400 PNG/JPEG (1280x800 recommended). See the [Screenshot shot list](#screenshot-shot-list) below.
- [ ] **Promo tile (optional but recommended)**: small 440x280 PNG.
- [ ] **Privacy policy live**: deploy the website so <https://specpin.ohnice.app/help/privacy-policy/> resolves before submitting (the URL above must be reachable at review time).
- [ ] **Single-purpose + permission justifications**: paste from the Privacy section above into the "Privacy practices" tab.
- [ ] **Verify the publisher contact email** shown in the developer console.

---

## Screenshot shot list

Shared list for both stores. Capture at **1280x800** (downscale to 640x400 if a store needs the smaller size). Use the bundled demo app (`pnpm --filter @specpin/demo-react-app dev` -> <http://localhost:3000>, ships seeded `.specs/`) so real specs render. Run the sidecar (`specpin serve`) and connect first. Suggested order (first shot is the store's primary tile, make it the strongest):

1. **Spec rendered on a page (tooltip).** Demo app open, hover an element so a tooltip spec shows on its element. The money shot: proves "specs pinned onto a live UI."
   - Caption: "Living specs pinned onto your real UI elements."
2. **Modal renderer + side panel together.** A draggable modal open over the demo app with the Chrome side panel showing the spec list/detail alongside.
   - Caption: "Read specs your way: tooltip, side panel, or draggable modal."
3. **Manual capture in progress.** Capture mode active (Alt+Shift+C), an element highlighted, the capture form open with title/description (show the Markdown toolbar + locale tabs).
   - Caption: "Click any element and author a spec in place. No leaving the page."
4. **Popup - multi-project connections.** The toolbar popup showing connected projects (sidecar + a local project), per-project enable toggles, display-mode select.
   - Caption: "Connect many projects at once, routed to each page by origin."
5. **Options page.** The wide Options page showing theme (System/Light/Dark), interface language (EN/VI), default surface, and Support & Feedback links.
   - Caption: "Yours to tune: themes, bilingual UI, and per-project control."

Notes:
- For Firefox screenshots, swap shot 2's "side panel" for Firefox's **sidebar** (same content, native surface).
- Prefer Dark or Light consistently across the set; do not mix per shot.
- `apps/extension/designs/overview.png` shows the light/dark UI and can seed shots 4-5 but must be re-exported at an accepted dimension (it is not 1280x800).
- Keep any visible spec text generic/non-confidential (the demo seed data is safe).
