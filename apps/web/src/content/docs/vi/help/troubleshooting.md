---
title: Xử Lý Sự Cố
description: Các vấn đề thường gặp và cách khắc phục cho Specpin, cùng một FAQ ngắn.
---

Trang này bao gồm các vấn đề thường gặp khi sử dụng Specpin và cách khắc phục chúng.

## Vấn Đề Kết Nối

### Extension hiển thị "Mất kết nối (sidecar)"

**Nguyên nhân:** Sidecar không chạy, hoặc extension không thể tiếp cận nó.

**Khắc phục:**

1. Đảm bảo `specpin serve` đang chạy trong thư mục dự án (thư mục có `.specs/`).
2. Kiểm tra URL trong extension khớp với URL được in (ví dụ: `http://127.0.0.1:51234`).
3. Kiểm tra token trong extension khớp với token được in. Token thay đổi mỗi lần bạn khởi động lại `specpin serve`.
4. Nếu cổng thay đổi (tự động chọn khi khởi động lại), cập nhật URL trong trang Options của extension.
5. Click **Kết nối lại** trong trang Options để kiểm tra kết nối.

### Extension hiển thị "Chưa cấu hình"

**Nguyên nhân:** Chưa có dự án nào được kết nối, hoặc không có dự án nào phục vụ origin của trang này.

**Khắc phục:**

1. Mở trang Options của extension.
2. Thêm một kết nối: dán URL và token được in bởi `specpin serve`.
3. Nếu `domains` của dự án trong `.specs/manifest.json` không bao gồm origin của trang hiện tại, dự án sẽ không phục vụ trang đó. Sửa `manifest.json` để thêm domain, hoặc bật **Áp dụng cho mọi trang** trong trang Options (chỉ nếu bạn muốn đặc tả của dự án này trên mọi trang).

### "Không có dự án cho trang này"

**Nguyên nhân:** Bạn đã cấu hình kết nối, nhưng không có kết nối nào phục vụ trang hiện tại (`domains` của chúng không khớp).

**Khắc phục:**

1. Ở trạng thái này popup hiển thị lời mời **+ New project** (side panel hiển thị hai bước ngắn). Nhấp vào đó để tạo một dự án cục bộ hoặc kết nối sidecar cho trang này.
2. Hoặc kiểm tra `.specs/manifest.json` trong dự án và thêm domain của trang hiện tại (ví dụ: `localhost:3000`, `example.com`) vào mảng `domains`.
3. Hoặc bật **Áp dụng cho mọi trang** cho dự án đó trong trang Options (dùng thận trọng: đặc tả sẽ xuất hiện trên mọi trang bạn truy cập).

### Kiểm tra kết nối thất bại với lỗi CORS hoặc origin

**Nguyên nhân:** Sidecar từ chối request từ origin web. Chỉ origin của browser extension được phép.

**Khắc phục:** Đây là hành vi mong đợi. Bạn chỉ có thể kết nối từ browser extension, không phải từ một trang web. Đảm bảo bạn đang dán URL và token vào trang Options của extension, không phải vào browser console hoặc một form web.

## Đặc Tả Không Xuất Hiện

### "Không có spec cho trang này."

**Nguyên nhân có thể:**

1. **Specpin đang tắt.** Popup hiển thị một panel **Specpin đang tắt** kèm số spec đang bị ẩn ở đây. Bật nó với công tắc trong popup hoặc nhấn `Alt+Shift+S`.
2. **Dự án bị tắt.** Kiểm tra trang Options và đảm bảo dự án có **Đang bật** bên cạnh nó. Click công tắc để bật.
3. **`domains` của dự án không khớp với trang.** Xem [Vấn Đề Kết Nối](#vấn-đề-kết-nối) ở trên.
4. **Đặc tả bị ẩn bởi bộ lọc.** Kiểm tra phần **Bộ lọc** trong popup hoặc side panel. Bỏ chọn bất kỳ bộ lọc nào có thể đang ẩn đặc tả. Click **Đặt lại** để xóa ghi đè cá nhân.
5. **Đặc tả bị ẩn bởi mặc định của nhóm.** Nếu dự án có cài đặt hiển thị nhóm trong `.specs/views.json`, đặc tả khớp với các facet đó bị ẩn mặc định. Ghi đè cá nhân có thể hiện chúng (click biểu tượng mắt trong side panel hoặc bỏ chọn facet trong phần Bộ lọc).

### Đặc tả hiển thị trong danh sách nhưng không hiển thị trên trang

**Nguyên nhân có thể:**

1. **Chế độ hiển thị được đặt thành một bề mặt đã đóng.** Nếu bạn đóng sidebar hoặc modal, nó sẽ thu gọn thành một viên nhỏ ở góc dưới bên phải. Click viên để mở lại.
2. **Phần tử chưa có trên trang.** Một số phần tử chỉ xuất hiện sau tương tác của người dùng (modal, dropdown, phần lazy-loaded). Di chuyển hoặc tương tác để hiện phần tử, và đặc tả sẽ hiển thị.
3. **Đặc tả được đánh dấu "Cần xem lại."** Extension không thể khớp phần tử một cách tin cậy. Xem [Đặc Tả Không Khớp](#đặc-tả-không-khớp) bên dưới.

## Đặc Tả Không Khớp

### Một đặc tả hiển thị huy hiệu "Cần xem lại"

**Nguyên nhân:** Phần tử thay đổi (refactor, xóa, di chuyển), và extension không thể tìm thấy kết quả khớp tin cậy.

**Khắc phục:**

1. Click đặc tả trong popup hoặc side panel, rồi click **Sửa spec**.
2. Click **Liên kết lại phần tử**.
3. Click vào đúng phần tử trên trang.
4. Click **Lưu thay đổi**.

Extension sẽ capture một fingerprint mới và lưu lại vào `.specs/`. Đặc tả giờ sẽ khớp lại.

### Nhiều đặc tả khớp cùng một phần tử

**Nguyên nhân:** Hai đặc tả có fingerprint chồng chéo (ví dụ: cả hai đều trỏ tới cùng `data-testid`).

**Khắc phục:**

1. Kiểm tra file đặc tả trong `.specs/` và xác nhận cái nào đúng.
2. Xóa hoặc cập nhật đặc tả không chính xác.
3. Với các phần tử quan trọng, thêm thuộc tính `data-spec-id` duy nhất trong source code:
   ```html
   <button data-spec-id="submit-order">Gửi</button>
   ```
   Rồi cập nhật fingerprint của đặc tả để dùng thuộc tính đó (click **Liên kết lại phần tử** trong form sửa).

## Vấn Đề Extension

### Extension không tải trong Chrome

**Khắc phục:**

1. Build extension: `pnpm --filter @specpin/extension build` (tạo ra `.output/chrome-mv3`).
2. Truy cập `chrome://extensions`, bật **Developer mode**, click **Load unpacked**, và chọn `apps/extension/.output/chrome-mv3`.
3. Nếu extension đã được tải, click biểu tượng refresh bên cạnh nó sau khi rebuild.

### Extension không tải trong Firefox

**Khắc phục:**

1. Build extension: `pnpm --filter @specpin/extension build:firefox` (tạo ra `.output/firefox-mv2`).
2. Truy cập `about:debugging`, click **This Firefox**, click **Load Temporary Add-on**, và chọn bất kỳ file nào trong `apps/extension/.output/firefox-mv2`.
3. Temporary add-on bị xóa khi Firefox đóng. Bạn phải tải lại chúng mỗi phiên.

### Menu chuột phải không hiển thị submenu Specpin

**Nguyên nhân:** Specpin đang tắt.

**Khắc phục:** Bật Specpin từ popup hoặc nhấn `Alt+Shift+S`. Submenu chuột phải chỉ xuất hiện khi Specpin đang bật.

## Vấn Đề Sidecar

### `specpin serve` in ra "address already in use"

**Nguyên nhân:** Một tiến trình khác đang dùng cổng, hoặc một `specpin serve` trước đó vẫn đang chạy.

**Khắc phục:**

1. Kill tiến trình trước (tìm nó bằng `lsof -i :<port>` hoặc `netstat -ano | findstr :<port>` trên Windows, rồi kill PID).
2. Hoặc dùng một cổng khác: `specpin serve --port 5173`.

### Sidecar crash hoặc treo

**Nguyên nhân:** Thư mục `.specs/` bị hỏng, hoặc một file đặc tả không hợp lệ.

**Khắc phục:**

1. Chạy `specpin validate --dir .specs` để kiểm tra lỗi schema.
2. Sửa bất kỳ đặc tả không hợp lệ nào được báo bởi `validate`.
3. Khởi động lại `specpin serve`.

### Token được in bởi `specpin serve` không hoạt động

**Nguyên nhân:** Token được sao chép không chính xác, hoặc một token cũ vẫn còn trong cài đặt extension.

**Khắc phục:**

1. Sao chép toàn bộ token được in bởi `specpin serve` (nó là một chuỗi hex dài).
2. Mở trang Options của extension, click **Sửa** bên cạnh kết nối, dán token mới, và click **Lưu thay đổi**.
3. Token thay đổi mỗi lần bạn khởi động lại `specpin serve`. Cập nhật nó trong extension sau mỗi lần khởi động lại.

## Vấn Đề Capture và Sửa

### "Không có dự án ghi được phục vụ trang này"

**Nguyên nhân:** Không có dự án nào được kết nối (sidecar hoặc cục bộ) có `domains` khớp với trang hiện tại.

**Khắc phục:**

1. Thêm origin của trang vào `domains` của một dự án trong `.specs/manifest.json`, hoặc bật **Áp dụng cho mọi trang** cho một dự án cục bộ trong trang Options.
2. Hoặc tạo một dự án cục bộ mới từ popup: click **+ Dự án mới** -> **Dự án cục bộ**, đặt tên, và thêm domain của trang hiện tại.

### Capture hoặc sửa lưu nhưng trang không refresh

**Nguyên nhân:** Live-reload (SSE) không được kết nối, hoặc sidecar không gửi sự kiện `SPECS_CHANGED`.

**Khắc phục:**

1. Kiểm tra `specpin serve` đang chạy và extension đã kết nối.
2. Refresh trang thủ công để xem đặc tả đã cập nhật.
3. Nếu điều này xảy ra thường xuyên, kiểm tra browser console để tìm lỗi SSE.

## FAQ

### Dữ liệu của tôi có được gửi đi đâu không?

Không gửi cho chúng tôi. Specpin ưu tiên cục bộ: theo mặc định sidecar bind tới `127.0.0.1` và extension kết nối qua localhost. Nếu bạn chọn dùng sidecar từ xa, đặc tả chỉ đi tới máy chủ đó - một máy do chính bạn chạy. Không có server nào do Specpin vận hành nhìn thấy đặc tả hoặc trang của bạn. Xem [Bảo Mật và Quyền Riêng Tư](/vi/concepts/security-and-privacy/) để biết chi tiết đầy đủ.

### Tôi có cần CLI để dùng Specpin không?

Chỉ khi bạn muốn phục vụ đặc tả từ thư mục `.specs/` của một repository. CLI (`specpin serve`) mở các đặc tả đó qua localhost. Nếu bạn chỉ dùng **dự án cục bộ** (tạo trong extension và lưu trong browser storage), bạn không cần CLI chút nào.

### Sự khác biệt giữa hỗ trợ Chrome và Firefox là gì?

Extension hoạt động trên cả hai trình duyệt với sự khác biệt nhỏ:

- **Chrome:** Hỗ trợ cả popup và side panel. Bạn có thể chọn cái nào mở khi bạn click biểu tượng thanh công cụ (trang Options -> **Biểu tượng thanh công cụ**).
- **Firefox:** Biểu tượng thanh công cụ luôn mở popup. Side panel được mở từ nút chuyển sidebar của chính Firefox (**View -> Sidebar -> Specpin**).

### Tại sao token cứ thay đổi?

Theo mặc định, token thay đổi mỗi lần bạn khởi động lại `specpin serve`. Đây là thiết kế cho bảo mật: nếu một token bị rò rỉ, nó trở nên không hợp lệ khi sidecar khởi động lại. Cập nhật token trong trang Options của extension sau mỗi lần khởi động lại. Với một sidecar chạy lâu dài hoặc dùng chung, hãy ghim một token ổn định bằng `--token <secret>` (hoặc biến môi trường `SPECPIN_TOKEN`) để việc khởi động lại không làm ngắt kết nối mọi người.

### Tôi có thể dùng Specpin mà không cần Git không?

Có. Đặc tả được lưu dưới dạng file JSON trong `.specs/`, nhưng bạn không cần commit chúng vào Git. Bạn có thể soạn và xem đặc tả mà không cần version control. Tuy nhiên, quản lý phiên bản đặc tả trong Git (và review thay đổi qua pull request) là quy trình làm việc được khuyến nghị.

### Tôi có thể kết nối tới một sidecar trên máy khác không?

Có. Chạy sidecar trên máy từ xa phía sau một reverse proxy HTTPS (giữ nó trên loopback với proxy đặt cùng máy, hoặc dùng `--host` cùng firewall), ghim một `--token` ổn định, và kết nối extension tới URL `https://` của proxy. Kết nối từ xa bắt buộc dùng HTTPS - `http://` thuần tới máy chủ từ xa sẽ bị chặn. Xem [Phục vụ trên máy từ xa](/vi/sidecar/cli/) để biết chi tiết.

### Tôi có thể nhận trợ giúp ở đâu?

- **Báo lỗi:** [GitHub Issues](https://github.com/lamngockhuong/specpin/issues)
- **Đặt câu hỏi:** [GitHub Discussions](https://github.com/lamngockhuong/specpin/discussions)
