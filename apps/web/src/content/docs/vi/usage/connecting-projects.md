---
title: Kết nối dự án
description: Cách kết nối Specpin với dự án qua sidecar hoặc dự án cục bộ.
---

Specpin kết nối với dự án theo hai cách: kết nối **Sidecar** (một instance `specpin serve` đang chạy) hoặc **Dự án cục bộ** (spec lưu trong trình duyệt).

## Thêm dự án mới

Mở popup Specpin hoặc side panel, rồi nhấp vào biểu tượng bánh răng (góc trên bên phải) hoặc nút **+ Dự án mới**. Bạn sẽ thấy hai lựa chọn:

### Kết nối sidecar

Kết nối tới một instance `specpin serve` đang chạy.

1. Chạy `specpin serve` trong thư mục dự án của bạn (xem [CLI](/vi/sidecar/cli/) để biết chi tiết). Nó in ra URL và token:
   ```
   Specpin sidecar running.
     URL:     http://127.0.0.1:51234
     Token:   2da0480c...
   ```
2. Trong extension, chọn **Sidecar**.
3. Dán **URL sidecar** (ví dụ: `http://127.0.0.1:51234`).
4. Thêm **Nhãn** (tùy chọn, ví dụ: "Acme CRM").
5. Dán **Token**.
6. Nhấp **Kiểm tra & thêm dự án**. Nếu kết nối thành công, dự án sẽ xuất hiện trong danh sách trang Options.

URL có thể là địa chỉ localhost (`http://127.0.0.1:<port>` hoặc `http://localhost:<port>`) hoặc một sidecar **từ xa** qua HTTPS (ví dụ `https://specs.example.com`). Sidecar từ xa bắt buộc dùng `https://` - `http://` thuần tới máy chủ từ xa sẽ bị từ chối. Một máy chủ chỉ có IP, không có domain vẫn dùng được: dùng `https://<ip>` với chứng chỉ có SAN là IP đó (qua CA nội bộ), hoặc một SSH tunnel về `http://localhost:<port>`. Khi bạn thêm một kết nối từ xa, trình duyệt sẽ hỏi quyền truy cập máy chủ đó; hãy chấp nhận để kết nối. Xóa kết nối sẽ thu hồi quyền đó. Xem [Phục vụ trên máy từ xa](/vi/sidecar/cli/) để chạy sidecar phía sau một reverse proxy.

:::tip
Mỗi sidecar chạy trên một cổng riêng. Để phục vụ nhiều dự án cùng lúc, chạy `specpin serve --port 51001` trong dự án A và `specpin serve --port 51002` trong dự án B, sau đó thêm cả hai kết nối với token riêng của chúng.
:::

:::note
Nếu một đồng đội thay đổi một spec trong khi bạn đang sửa cùng dự án, thao tác lưu của bạn sẽ bị từ chối kèm thông báo "đã thay đổi ở nơi khác" và dự án được tải lại - hãy xem lại và lưu lại. Điều này ngăn một thao tác ghi âm thầm đè lên thao tác khác.
:::

### Dự án cục bộ

Tạo dự án mà không cần sidecar. Spec được lưu trong `browser.storage.local` và có thể xuất dưới dạng `.specs.zip`.

1. Chọn **Dự án cục bộ**.
2. Nhập **Tên dự án**.
3. (Tùy chọn) Nhập **Tên miền** (phân tách bằng dấu phẩy, ví dụ: `localhost:3000, example.com`).
4. Nếu bạn để trống Tên miền và không chọn **Áp dụng cho mọi trang**, dự án sẽ không phục vụ trang nào (bạn có thể thêm tên miền sau).
5. Nhấp **Tạo**.

Dự án cục bộ xuất hiện trong popup và side panel khi một trang khớp với tên miền của chúng. Bạn có thể capture và sửa spec giống như dự án sidecar.

## Định tuyến nhiều dự án

Một extension có thể phục vụ nhiều dự án. Spec chỉ hiển thị trên trang nếu `domains` trong manifest của dự án bao gồm origin của trang đó. Một dự án không ghim tên miền nào sẽ không hoạt động theo mặc định (nếu không, spec của nó sẽ xuất hiện ở mọi nơi). Chọn **Áp dụng cho mọi trang** trong cài đặt kết nối để bật nó.

## Bật/tắt theo từng dự án

Mỗi kết nối trong trang Options có công tắc **Đang bật** / **Đang tắt**. Tắt một dự án sẽ ẩn spec của nó ở mọi nơi và dừng theo dõi SSE, nhưng vẫn giữ kết nối trong danh sách để bạn có thể bật lại sau.

Khi Specpin bị tắt cho trang (công tắc toàn cục), tất cả dự án đều bị bỏ qua. Công tắc theo từng dự án hoạt động độc lập với bật/tắt toàn cục.

## Quản lý kết nối

Mở trang Options của extension (nhấp vào biểu tượng bánh răng từ popup hoặc side panel).

- **Sửa**: Thay đổi URL, nhãn hoặc token. Để trống trường token để giữ token hiện tại. Nhấp **Lưu thay đổi** sau khi sửa.
- **Kết nối lại**: Kiểm tra kết nối lại nếu sidecar khởi động lại hoặc token đã thay đổi.
- **Xóa**: Xóa kết nối. Hộp thoại xác nhận sẽ xuất hiện trước.

Dự án cục bộ hiển thị hành động **Đổi tên** (thay đổi tên dự án và tên miền) và hành động **Xuất** (tải xuống `.specs.zip` chứa spec của dự án). Dự án sidecar cũng hiển thị **Xuất** (tạo bundle từ cache đang chạy).

Đối với dự án cục bộ, trang Options hiển thị nhãn nguồn **Cục bộ** và liệt kê các trang đã ghim (hoặc "mọi trang" khi không ghim tên miền nào).
