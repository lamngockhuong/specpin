# Hướng dẫn chạy

> Bản tiếng Việt của `docs/run-guide.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Specpin gắn các business spec sống vào một UI đang chạy; nó **không** phải là code generator. Hướng dẫn này chạy trọn vòng từ đầu đến cuối: init sidecar, serve, load extension, kết nối, thấy spec render ra, và capture một spec mới.

## Yêu cầu trước

- Node >= 20, pnpm 10
- Go 1.26 (chỉ khi build sidecar từ source)
- Chrome hoặc Firefox

## 1. Build workspace

```bash
pnpm install
pnpm build
```

## 2. Cài đặt hoặc build sidecar

Cài CLI đã phát hành (tự tải binary khớp OS và CPU của bạn):

```bash
npm install -g @specpin/cli     # hoặc: pnpm add -g @specpin/cli, hoặc: npx @specpin/cli serve
```

Hoặc build từ source (cần Go 1.26):

```bash
cd apps/cli
make build        # syncs the embedded schema, produces bin/specpin
```

## 3. Chạy demo app (tùy chọn, để có sẵn một target)

```bash
pnpm --filter @specpin/demo-react-app dev   # http://localhost:3000
```

Demo là một Acme CRM nhiều màn hình nhỏ gọn (đăng nhập, dashboard, danh sách và chi tiết khách hàng, cài đặt, tạo giao dịch) và ship sẵn `examples/demo-react-app/.specs/` với các spec đã seed cho mọi màn hình. Đăng nhập với giá trị bất kỳ để vào các màn hình đã xác thực; điều hướng qua thanh nav trên cùng.

## 4. Khởi động sidecar trong một repo có thư mục `.specs/`

Trong một project mới, scaffold trước:

```bash
specpin init --project "My App" --domains localhost:3000
```

Rồi serve (chạy từ thư mục chứa `.specs/`, ví dụ demo app):

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

Nó in ra một connect URL và token:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

Port được chọn tự động; truyền `--port 5173` để cố định một port.

## 5. Load extension

```bash
pnpm --filter @specpin/extension build            # chrome-mv3 in .output/
pnpm --filter @specpin/extension build:firefox    # firefox-mv2 in .output/
```

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `apps/extension/.output/chrome-mv3`.
- Firefox: `about:debugging` -> This Firefox -> Load Temporary Add-on -> bất kỳ file nào trong `apps/extension/.output/firefox-mv2`.

## 6. Kết nối

Mở trang Options của extension (**Connected projects**), dán URL và token từ bước 4 vào form add, tùy chọn đặt tên cho nó, click **Test & add project**. Project xuất hiện trong danh sách với status, project name, spec count, và domains của nó. Mỗi kết nối có nút bật/tắt; một project bị tắt không phục vụ trang nào (spec của nó biến mất khỏi mọi nơi) và SSE watch của nó dừng, nhưng nó vẫn còn trong danh sách để có thể bật lại. Add thêm project bằng cách tương tự; **Edit**, **Remove** và **Reconnect** hoạt động per row. **Edit** mở form inline để đổi URL, label, hoặc token của project (để trống token nếu muốn giữ token hiện tại) và test lại kết nối khi save.

Một project mà manifest của nó không pin `domains` thì không hoạt động theo mặc định (spec của nó sẽ hiển thị trên mọi site nếu không). Row hiển thị một cảnh báo và checkbox **Apply to all sites**; chỉ tick nó nếu bạn muốn spec của project đó xuất hiện ở mọi nơi.

## 7. Xem spec render ra

Truy cập demo app (`http://localhost:3000`). Các spec đã match hiện ra dưới dạng tooltip trên element của chúng (badge chuyển sang màu amber khi một match cần review). Sửa một `.spec.json` trên đĩa và trang sẽ live-update qua SSE.

Popup liệt kê các spec cho trang hiện tại và toggle Specpin on/off. Góc trên bên phải có icon bánh răng cài đặt (mở trang Options), nút **+ New project** (tạo một dự án cục bộ hoặc kết nối sidecar ngay tại chỗ), và, khi có một dự án phục vụ trang, nút **Export** (tải về specs của một dự án dưới dạng `.specs.zip`; nếu nhiều dự án cùng phục vụ trang, nút mở một bộ chọn nhỏ để chọn một dự án). Export bao gồm cả dự án cục bộ (từ bundle đã lưu) và dự án sidecar đang kết nối (từ cache trực tiếp; export sidecar suy ra tên group từ tên file vì cache đã làm phẳng group). Các điều khiển chính (**+ Capture spec** và select chọn display mode) nằm ngay trên danh sách để luôn hiển thị mà không cần cuộn, với bộ chọn **Language** của spec ngay phía trên chúng. Mỗi dòng spec hiển thị một badge nguồn nhỏ (`sidecar` hoặc `manual`) đánh dấu spec đó đến từ nguồn nào. Một ô tìm kiếm bên trên danh sách lọc spec live theo title, file, và tag. Khi nhiều hơn một project phục vụ page, popup liệt kê từng matching project và renderer ghi caption từng spec với project của nó. Tắt Specpin cho trang sẽ thu gọn danh sách thành thông báo off và ẩn các điều khiển chỉ tác động lên nó (tìm kiếm, ngôn ngữ, capture, mode, bộ lọc); status, danh sách project, và icon bánh răng cài đặt vẫn giữ.

### Side panel (gắn cố định)

Các điều khiển tương tự cũng có ở dạng **side panel** luôn mở trong khi bạn duyệt web. Khác với popup, nó hiển thị description và business rules của từng spec ngay inline, và tự refresh khi bạn đổi tab hoặc điều hướng. Ô tìm kiếm cũng lọc theo description trong side panel. Mở nó từ link **Open as side panel** trong popup (Chrome) hoặc nút sidebar gốc của Firefox (**View -> Sidebar -> Specpin**). Để icon trên thanh công cụ mở side panel thay vì popup, đặt **Toolbar icon -> Open the side panel** trong trang Options (chỉ Chrome; trên Firefox icon trên thanh công cụ luôn mở popup).

## 8. Chuyển ngôn ngữ

Nội dung spec (title, description, business rules) được localize. Dropdown **Language** của popup đặt active locale và render lại tất cả display mode; header của side panel phản chiếu nó. Lựa chọn được lưu giữa các session. Một spec không có text cho locale được chọn sẽ fall back về `defaultLocale` của project, rồi đến bất kỳ locale nào có mặt. Dropdown cung cấp hợp (union) của `settings.locales` giữa các connected project.

## 9. Lọc spec theo tag, file, hoặc URL trang

Popup và side panel cung cấp bộ lọc theo facet: Tags, Files, và This page (URL pattern). Bỏ check một facet sẽ ẩn tất cả spec khớp ngay lập tức. Một override cá nhân (force-show hoặc force-hide) đồng bộ giữa các máy qua `chrome.storage.sync`. Side panel cũng cung cấp nút toggle con mắt per spec để kiểm soát chi tiết hơn. **Reset** xóa tất cả override cá nhân.

Admin team có thể đặt mặc định toàn project trong trang Options (mục **Team visibility** per kết nối): thêm các facet key (mỗi dòng một, ví dụ `tag:draft`, `file:login.spec.json`, `url:/admin/**`) để ẩn chúng với mọi người. Mặc định team được ghi vào `.specs/views.json` (commit vào Git) qua sidecar. Override cá nhân thắng mặc định team: một force-show cá nhân của `spec:<id>` là hard rescue (hiện spec đó ngay cả khi tag hoặc file của nó bị ẩn ở team). Cổng `url:` trang thắng mọi thứ (ẩn spec trên các trang không khớp glob). Trạng thái rỗng = tất cả hiển thị.

## 10. Capture một spec mới (với bản dịch)

Click **+ Capture spec** trong popup (hoặc nhấn `Alt+Shift+C`), click một element, rồi điền form. Form có một hàng **tab ngôn ngữ** (một tab mỗi locale, kèm một tab **+** để thêm): click một tab để soạn title/description/rules của ngôn ngữ đó, rồi chuyển tab để thêm bản dịch (việc chuyển tab giữ những gì bạn đã nhập). Ngôn ngữ mặc định yêu cầu title và description. Trường description và business rules có một **thanh công cụ Markdown** nhỏ (description: đậm / nghiêng / liên kết / dấu đầu dòng / đánh số; rules: đậm / nghiêng / liên kết); mỗi nút chèn Markdown vào textarea quanh vùng chọn của bạn. Bộ chọn **Save to** liệt kê mọi dự án ghi được phục vụ trang, gắn nhãn theo loại (`sidecar` hoặc `local`); chọn một (mục tiêu duy nhất sẽ được chọn tự động, và capture bị vô hiệu kèm giải thích khi không có dự án nào phục vụ trang). Khi save, spec được validate rồi ghi: mục tiêu sidecar ghi vào `.spec.json` đã chọn (pretty-printed) nên hiện trong `git diff`; mục tiêu cục bộ ghi vào `browser.storage.local` (giới hạn theo origin, không bao giờ là sidecar). Các spec đã capture mang `meta.source: "manual"`. Markdown đã soạn hiển thị thành văn bản có định dạng trong mọi display mode (xem [schema-reference](./schema-reference.md) cho tập con được hỗ trợ).

### Menu chuột phải

Khi Specpin đang bật, menu chuột phải của trang có submenu **Specpin** với bốn hành động: **Pin spec to this element** (capture trực tiếp element bạn vừa nhấp chuột phải, bỏ qua bước hover-pick), **Show spec here** (khung viền element đã match và ghim một tooltip hiện nội dung spec, bất kể chế độ hiển thị của spec; hiện thông báo ngắn khi chỗ đó không có spec), **Capture spec (pick element)** (chế độ hover-pick giống nút trong popup), và **Turn off Specpin**. Submenu bị ẩn khi Specpin tắt; bật lại từ popup hoặc `Alt+Shift+S`. Nhãn theo ngôn ngữ giao diện ở trang Options.

## 11. Sửa một spec sẵn có

Mở một spec để sửa từ một trong hai nơi: click badge tooltip để ghim nó rồi nhấn **Edit spec**, hoặc click **Edit** trên một spec card trong side panel. Cùng một form sẽ mở ra với nội dung của spec cho mọi ngôn ngữ đã nhập; đổi title, description, business rules, tags, hoặc display mode rồi nhấn **Save changes**. Spec giữ nguyên `id` và provenance (`createdBy`/`createdAt`/`source`); chỉ `updatedAt` được cập nhật. Thay đổi được ghi lại qua sidecar sở hữu spec và live-update trang qua SSE, giống như khi sửa trực tiếp `.spec.json` trên đĩa.

Để trỏ một spec sang element khác, click **Re-link element** trong form sửa, rồi click element mới trên trang; form mở lại với các chỉnh sửa của bạn còn nguyên và fingerprint mới được áp dụng khi save. Các spec cục bộ (Manual) giờ cũng sửa được theo cách tương tự; bản sửa ghi vào `browser.storage.local` thay vì một sidecar. (Side panel Edit điều khiển form trong trang, nên giữ panel gắn cạnh trang mà nó mô tả.)

## 12. Tour hướng dẫn (guide mode)

Một **guide** là một walkthrough theo từng bước đi qua các spec đã có sẵn trên một trang: nó lần lượt làm nổi bật (spotlight) từng element và hiện nội dung của spec đó trong một popover với **Back / Skip / Next** (bước cuối là **Done**), một bộ đếm bước, và điều khiển bàn phím `←` / `→` / `Esc`. Nó được khởi chạy theo yêu cầu và không thay thế việc render tooltip/sidebar/modal thông thường.

**Khởi chạy.** Popup và side panel có một mục **Guides**: click **Start guided tour** để đi qua mọi spec đã match theo thứ tự mặc định (không cần thiết lập), hoặc click **Start** cạnh một guide đã đặt tên để chạy các bước được biên soạn của nó. `Alt+Shift+G` khởi chạy tour mặc định từ bàn phím (nhấn lại để dừng). Từ popup, tour khởi chạy và popup đóng lại để trang không bị che; side panel vẫn mở.

**Biên soạn.** Click **+ New guide** (hoặc **Edit** trên một guide) để mở editor: đặt tên cho nó (và description tùy chọn), thêm các spec của trang làm các bước có thứ tự (dùng nút ↑ / ↓ để sắp lại, × để xóa), và chọn nơi lưu nó trong bộ chọn **Save to**:

- một dự án **sidecar** - được commit vào `.specs/guides.json` của repo đó và chia sẻ với team qua Git;
- một dự án **local** - lưu trong extension cạnh dự án cục bộ đó;
- **Personal** - riêng tư cho bạn, đồng bộ giữa các máy của bạn, không bao giờ ghi vào Git.

Để trống các bước để lưu một guide luôn đi qua mọi spec đã match theo thứ tự mặc định. Một bước mà spec của nó không còn trên trang sẽ bị gắn cờ trong editor (và bỏ qua khi khởi chạy). Xóa một guide từ cùng danh sách đó, hoặc quản lý các team guide của một kết nối (liệt kê + xóa) từ trang Options trong mục **Team guides**.

Một guide được dựng cho một trang phản ánh bất kỳ spec nào khớp với nó lúc khởi chạy; nếu một đồng đội thay đổi các spec giữa chừng tour, tour dừng lại gọn gàng và việc render thông thường trở lại.

## Phím tắt

| Phím tắt | Hành động |
|----------|-----------|
| `Alt+Shift+S` | toggle Specpin on/off |
| `Alt+Shift+M` | cycle display mode |
| `Alt+Shift+C` | toggle capture mode (`Esc` để hủy) |
| `Alt+Shift+G` | start / stop tour hướng dẫn mặc định (trong tour: `←` / `→` để chuyển bước, `Esc` để thoát) |

## Kết nối nhiều project cùng lúc

Một extension có thể phục vụ nhiều project. Chạy một sidecar per project trên port riêng của nó (mỗi cái in token riêng), và add từng cái trong Options:

```bash
# project A
cd /path/to/project-a && /path/to/bin/specpin serve --port 51001
# project B (terminal khác)
cd /path/to/project-b && /path/to/bin/specpin serve --port 51002
```

Để demo điều này với một demo app duy nhất, chạy hai sidecar trên hai thư mục `.specs/` khác nhau trên các port khác nhau; mỗi page chỉ hiển thị các spec của project(s) mà `domains` của nó khớp origin của nó.

## Phím tắt

| Phím tắt | Hành động |
|----------|-----------|
| `Alt+Shift+S` | toggle Specpin on/off |
| `Alt+Shift+M` | cycle display mode |
| `Alt+Shift+C` | toggle capture mode (`Esc` để hủy) |
| `Alt+Shift+G` | start / stop tour hướng dẫn mặc định (trong tour: `←` / `→` để chuyển bước, `Esc` để thoát) |

## Chế độ hiển thị

Spec hiển thị dưới dạng **tooltip** (xem nhanh khi hover), **sidebar** (danh sách cố định), hoặc **modal** (một panel kéo được, không chặn trang, liệt kê mọi spec trên trang). Modal mở ra ở giữa màn hình nhưng bạn có thể kéo nó bằng phần header tới bất kỳ vị trí nào, và trang phía sau vẫn tương tác được (không có lớp nền làm mờ) nên có thể giữ nó mở trong khi làm việc. Đổi bằng dropdown chế độ trong popup hoặc xoay vòng với `Alt+Shift+M`. `preferredDisplayMode` theo từng spec và `defaultDisplayMode` trong manifest vẫn áp dụng khi không ép chế độ.

Bạn có thể ẩn tạm sidebar (nút **x** của nó) hoặc modal (chỉ bằng nút **x** - phím `Esc` và click ra ngoài không còn đóng nó nữa). Bề mặt đã ẩn thu gọn thành một pill **Specpin** nhỏ ở góc dưới bên phải trang, hiển thị số spec khớp; click vào để mở lại. Kéo pill để di chuyển nó tới bất kỳ vị trí nào trên trang, và vị trí mới được ghi nhớ cho lần sau (tự kẹp lại trong vùng nhìn thấy nếu cửa sổ nhỏ hơn). Trạng thái đã ẩn vẫn giữ qua các lần render lại và điều hướng trong trang, và được xóa mỗi khi bạn chủ động chọn một chế độ (dropdown hoặc `Alt+Shift+M`).

## Dùng không cần sidecar (Manual import)

Để xem spec mà không chạy `specpin serve`, mở trang Options của extension và load chúng trong mục **Manual specs**. Có hai cách để import:

**Từ file (không cần tự ráp JSON).** Nhấn vào ô chọn file, chọn `manifest.json` cùng một hoặc nhiều file `*.spec.json` từ thư mục `.specs/`, rồi nhấn **Load from files**. Extension tự ráp và validate ngay trong trang.

**Từ bundle dán vào.** Dán một object JSON duy nhất theo dạng sau, rồi nhấn **Load pasted bundle**:

```json
{ "manifest": { …manifest.json… }, "files": { "login.spec.json": { …spec file… } } }
```

Để sinh ra bundle đó từ thư mục `.specs/` của một repo mà không cần tự ráp, dùng CLI:

```bash
specpin bundle --dir .specs            # in bundle JSON ra stdout (copy/paste hoặc pipe)
specpin bundle --dir .specs --out bundle.json   # ghi ra file thay vì stdout
```

`bundle` chỉ đọc và ráp; nó không validate (chạy `specpin validate` để kiểm schema, hoặc dựa vào validate ngay trong trang khi import). Cả hai cách đều validate theo schema trước khi lưu.

**Mỗi lần import sẽ thêm một batch.** Load một bundle (dán hoặc từ file) sẽ thêm nó như một batch mới thay vì thay thế batch trước đó, nên nhiều lần import cùng tồn tại. Nếu một import mới trùng với một import trước đó (cùng tên project) thì nó vẫn được load, kèm một thông báo không chặn nêu tên batch trước; trùng spec id giữa các batch trên cùng một site cũng được cảnh báo (chỉ batch khớp đầu tiên render/sửa mỗi id). Các batch đã load được liệt kê bên dưới các nút, mỗi lần import là một card, kèm các site mà batch được pin (`domains` trong manifest của batch, hoặc "all sites" khi batch không pin domain nào) hiển thị inline. Mỗi batch có **Export** (tải về `.specs.zip` của nó), **Rename** (đổi tên project và các site được pin), và **Remove**; **Clear all manual specs** xóa toàn bộ danh sách. Manual specs tồn tại qua các lần khởi động lại trình duyệt và được merge vào spec của page cùng với bất kỳ connected project nào mà `domains` của nó khớp page (manual spec dùng `domains` của manifest riêng của chúng; các spec id trùng nhau giữa các batch chỉ render một lần).

### Vòng tạo nội dung cục bộ (không cần sidecar)

Nguồn Manual giờ là một luồng tạo nội dung cục bộ đầy đủ, không chỉ là trình xem chỉ-đọc:

1. **Tạo** một dự án cục bộ từ popup hoặc side panel: **+ New project** -> *Local project*, đặt tên và (tùy chọn) các site nó áp dụng. Không có site và không bật **Apply to all sites** thì dự án không phục vụ trang nào (nên chưa có mục tiêu ghi) - hãy đặt một trong hai để capture vào nó.
2. **Capture / sửa** spec vào nó giống hệt một dự án sidecar (capture chọn nó trong bộ chọn **Save to**; sửa hoạt động tại chỗ). Việc ghi đi vào `browser.storage.local`, giới hạn theo origin của dự án, và được validate theo schema trước khi lưu.
3. **Export** dự án (nút **Export** ở popup/panel, hoặc **Export** per-batch trong Options) ra một `<project>.specs.zip` chứa `manifest.json` + một `*.spec.json` mỗi group. Giải nén vào thư mục `.specs/` của một repo, hoặc re-import các file qua bộ chọn nhiều file - vòng round-trip giữ nguyên tên group và nội dung spec, và `specpin serve` đọc được kết quả.

Các dự án tạo trong extension tính vào cùng giới hạn 50 batch như import và hiển thị nhãn provenance **Local** trong Options.

## Validate spec offline

`specpin validate` kiểm tra `manifest.json` và mọi `*.spec.json` theo schema mà không cần chạy server:

```bash
specpin validate --dir .specs
```

Exit code: `0` hợp lệ toàn bộ, `1` có spec không hợp lệ (cần sửa spec), `2` không chạy được (thiếu thư mục hoặc manifest). Lệnh cũng cảnh báo khi `manifest.specFiles` và các file `*.spec.json` trên đĩa không khớp; thêm `--strict-manifest` để biến drift đó thành lỗi thay vì cảnh báo.

## Lint spec trong CI

Dùng reusable action để fail các PR đưa vào spec không hợp lệ. Không cần Node toolchain; validator được build từ một ref Specpin đã pin (không phải PR của repo gọi), nên một PR độc hại không thể thay đổi logic validate:

```yaml
# .github/workflows/spec-lint.yml trong repo của bạn
on: [pull_request]
jobs:
  spec-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: lamngockhuong/specpin/.github/actions/spec-lint@v0.1.0  # pin vào release tag
        with:
          dir: .specs
```

Pin `@<tag>` (không dùng `@main`) để an toàn supply-chain khi đã có release tag.
