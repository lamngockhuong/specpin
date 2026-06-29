---
title: Bảo mật và quyền riêng tư
description: Cách Specpin giữ đặc tả và hoạt động duyệt web của bạn riêng tư thông qua hoạt động chỉ trên localhost và xác thực token.
---

Specpin được thiết kế ưu tiên cục bộ. Đặc tả của bạn không bao giờ rời khỏi máy của bạn, và sidecar server được cứng hóa để chỉ chấp nhận kết nối từ extension trình duyệt của bạn.

## Kiến Trúc Ưu Tiên Cục Bộ

Tất cả dữ liệu chạy qua máy cục bộ của bạn:

1. **Đặc tả nằm trong repository của bạn** dưới dạng file `.specs/*.json`. Chúng được quản lý phiên bản bằng Git như bất kỳ source code nào.
2. **Sidecar (`specpin serve`) chỉ bind tới `127.0.0.1`.** Nó lắng nghe trên localhost, trên một cổng tự động chọn (hoặc một cổng bạn chỉ định bằng `--port`). Không có lưu lượng từ bên ngoài có thể tiếp cận nó.
3. **Extension trình duyệt tải đặc tả qua HTTP localhost.** Nó kết nối tới `http://127.0.0.1:<port>` bằng một bearer token.
4. **Các thao tác ghi quay lại `.specs/` trên đĩa.** Khi bạn capture hoặc sửa một đặc tả, extension gửi nó tới sidecar, sidecar ghi một file JSON được format đẹp một cách nguyên tử. Thay đổi xuất hiện trong `git diff` ngay lập tức.

Không có thành phần Specpin nào gửi dữ liệu tới một server bên ngoài. Không có dịch vụ cloud, không có telemetry, không có analytics. Mọi thứ đều ở trên máy của bạn.

## Mô Hình Bảo Mật Sidecar

Sidecar được cứng hóa để ngăn truy cập trái phép:

### Bind Localhost

Sidecar bind tới `127.0.0.1`, không phải `0.0.0.0`. Chỉ các tiến trình trên máy của bạn có thể tiếp cận nó. Cổng được tự động chọn từ các cổng cao khả dụng trừ khi bạn ghi đè bằng `--port`.

### Xác Thực Bearer Token

Mỗi request (trừ health check) yêu cầu header `Authorization: Bearer <token>`. Token được in ra khi bạn chạy `specpin serve`:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

Sao chép token và dán vào phần cài đặt kết nối của extension. Extension lưu nó một cách an toàn trong background service worker và gửi kèm nó với mỗi request. Không có token đúng, tất cả request sẽ bị từ chối với `401 Unauthorized`.

:::caution
Token được in trong terminal của bạn. Nếu ai đó có quyền truy cập vật lý hoặc từ xa vào máy của bạn nhìn thấy output terminal, họ có thể kết nối tới sidecar trong khi nó đang chạy. Đối xử với token như một mật khẩu. Token thay đổi mỗi lần bạn khởi động lại `specpin serve`.
:::

### CORS: Chỉ Origin Extension

Sidecar chỉ chấp nhận request từ origin của browser extension:

- `chrome-extension://*`
- `moz-extension://*`
- `safari-web-extension://*`

Các trang web (ngay cả trên `localhost`) bị từ chối. Điều này ngăn một website độc hại đánh cắp đặc tả của bạn hoặc ghi đặc tả giả vào repository của bạn, ngay cả khi kẻ tấn công biết token của bạn.

### Chặn Path Traversal

Tất cả file write bị giới hạn trong thư mục `.specs/`. Sidecar xác thực mọi đường dẫn file để ngăn tấn công path-traversal (ví dụ: `../../etc/passwd`). Nó sẽ từ chối bất kỳ request nào cố gắng ghi bên ngoài `.specs/`.

### Ghi Nguyên Tử, Được Format Đẹp

Các thao tác ghi spec là nguyên tử: sidecar ghi vào một file tạm, xác thực JSON, rồi đổi tên nó vào chỗ. Nếu tiến trình crash giữa chừng ghi, thư mục `.specs/` của bạn không bao giờ bị để lại ở trạng thái hỏng. Tất cả JSON được format đẹp để `git diff` vẫn dễ đọc.

## Bảo Mật Extension

Extension trình duyệt được build dưới dạng Manifest V3 extension (Chrome) và Manifest V2 (Firefox) với các thực hành bảo mật tốt nhất:

- **Token ở trong background service worker.** Trang Options của extension không bao giờ echo token vào DOM. Các query trạng thái kết nối không thể làm rò rỉ token.
- **Content script được sandbox.** Content script của extension (chạy trên các trang web) không thể thay đổi kết nối hoặc đọc token. Chỉ các message đặc quyền từ popup, side panel, hoặc options page mới có thể thay đổi cài đặt kết nối.
- **Các thao tác ghi bị giới hạn origin.** Khi bạn capture một spec, extension kiểm tra rằng `domains` của dự án đích bao phủ origin của trang hiện tại. Một kết nối sidecar phục vụ `localhost:3000` sẽ không chấp nhận capture từ `example.com`.

## Dự Án Cục Bộ (Manual Specs)

Extension hỗ trợ **dự án cục bộ**: đặc tả được lưu trong extension storage của trình duyệt (`browser.storage.local`) thay vì một sidecar. Dự án cục bộ bị giới hạn origin: đặc tả cho `localhost:3000` được cô lập khỏi đặc tả cho `example.com`. Đặc tả cục bộ có thể được export dưới dạng bundle `.specs.zip` và commit vào một repository, hoặc import lại vào máy khác.

Dự án cục bộ riêng tư với browser profile của bạn và không bao giờ được đồng bộ lên cloud trừ khi bạn export và chia sẻ file `.specs.zip` một cách rõ ràng.

## Mô Hình Tin Cậy Đa Dự Án

Bạn có thể kết nối extension tới nhiều instance sidecar (ví dụ: một instance cho mỗi dự án). Mỗi kết nối có URL và token riêng. Token được lưu riêng biệt và không bao giờ được chia sẻ giữa các dự án. Một token bị xâm phạm của một dự án không ảnh hưởng tới các dự án khác.

## Dữ Liệu Được Lưu Ở Đâu

| Dữ liệu | Vị trí | Được chia sẻ? |
|---------|--------|---------------|
| Đặc tả (dự án sidecar) | `.specs/*.json` trong repo của bạn | Qua Git (bạn kiểm soát) |
| Đặc tả (dự án cục bộ) | `browser.storage.local` | Không (chỉ browser profile) |
| URL và token kết nối | Extension background (in-memory + `browser.storage.local`) | Không |
| Tùy chọn giao diện (theme, language) | `browser.storage.local` | Không |
| Ghi đè hiển thị cá nhân | `browser.storage.sync` | Qua các trình duyệt đã đăng nhập của bạn (qua browser sync) |

## Câu Hỏi Thường Gặp

**Dữ liệu của tôi có được gửi đi đâu không?**  
Không. Tất cả dữ liệu đặc tả chỉ chạy qua máy cục bộ của bạn. Sidecar bind tới `127.0.0.1`, và extension kết nối tới nó qua localhost. Không có server bên ngoài.

**Một website có thể đọc đặc tả của tôi không?**  
Không. Sidecar từ chối request từ origin web (qua CORS). Chỉ browser extension mới có thể tải đặc tả.

**Điều gì xảy ra nếu ai đó nhìn thấy terminal của tôi có token?**  
Họ có thể kết nối tới sidecar trong khi nó đang chạy và đọc hoặc ghi đặc tả trong dự án đó. Token thay đổi mỗi lần bạn khởi động lại `specpin serve`. Đừng để terminal hiển thị trong screen share hoặc máy không khóa.

**Dự án cục bộ có được đồng bộ lên cloud không?**  
Không. Dự án cục bộ được lưu trong `browser.storage.local`, riêng tư với browser profile của bạn. Chúng không được đồng bộ trừ khi bạn export chúng dưới dạng `.specs.zip` và chia sẻ file một cách thủ công.

**Tôi có thể dùng Specpin trên một remote server không?**  
Không trực tiếp. Sidecar chỉ bind tới `127.0.0.1`. Nếu bạn cần phục vụ đặc tả từ một máy từ xa, bạn cần thiết lập một SSH tunnel hoặc một reverse proxy với lớp xác thực của riêng bạn. Điều này không được hỗ trợ chính thức.
