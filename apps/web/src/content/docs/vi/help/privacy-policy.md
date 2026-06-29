---
title: Chính sách bảo mật
description: Thực hành bảo mật và xử lý dữ liệu của Specpin. Ưu tiên cục bộ, không thu thập dữ liệu, không theo dõi, không dùng mã từ xa.
---

**Cập nhật lần cuối**: Ngày 29 tháng 6 năm 2026

Specpin cam kết bảo vệ quyền riêng tư của bạn. Chính sách này giải thích tiện ích trình duyệt thu thập (hoặc không thu thập) dữ liệu gì và cách sử dụng.

## Tóm tắt

- ✅ **Không thu thập dữ liệu cá nhân, dù mặc định hay bất kỳ lúc nào**
- ✅ **Không có yêu cầu mạng nào ngoài sidecar cục bộ của chính bạn trên `localhost`**
- ✅ **Không analytics, không theo dõi hành vi, không telemetry, không báo cáo lỗi**
- ✅ **Không dùng mã từ xa: tiện ích không tải và không chạy bất cứ gì từ mạng**
- ✅ **Mã nguồn mở và có thể kiểm tra**

## Thu thập dữ liệu

Specpin không thu thập, truyền, bán hay chia sẻ bất kỳ dữ liệu cá nhân nào. Không có dịch vụ cloud, không có endpoint analytics, không có telemetry. Mọi việc tiện ích làm đều diễn ra trên máy của bạn.

### Chúng tôi thu thập gì

Không gì cả. Specpin không gửi dữ liệu nào cho chúng tôi hay bất kỳ bên thứ ba nào. Kết nối mạng duy nhất nó thực hiện là tới một sidecar **do chính bạn chạy** trên `localhost` (xem [Hoạt động mạng](#hoạt-động-mạng)).

### Chúng tôi lưu cục bộ những gì

Specpin lưu các dữ liệu sau **chỉ trên thiết bị của bạn**, qua bộ nhớ của tiện ích trình duyệt:

| Loại dữ liệu | Vị trí lưu trữ | Mục đích | Đồng bộ? |
|--------------|----------------|----------|----------|
| Cài đặt kết nối (URL sidecar + bearer token, theo từng dự án) | `browser.storage` | Kết nối tới sidecar cục bộ của bạn | Không |
| Đặc tả của dự án cục bộ | `browser.storage` | Soạn và xem đặc tả khi không có sidecar đang chạy | Không |
| Tùy chọn (chủ đề, ngôn ngữ giao diện, chế độ hiển thị, bề mặt mặc định) | `browser.storage` | Ghi nhớ lựa chọn giao diện của bạn | Không |

Dữ liệu này không bao giờ rời khỏi thiết bị của bạn. Không có lưu trữ bên ngoài và không có dịch vụ cloud.

## Quyền trình duyệt

Specpin yêu cầu các quyền sau. Mỗi quyền chỉ dùng cho đúng mục đích được mô tả.

### `storage` - Lưu dữ liệu cục bộ

Lưu cài đặt kết nối, đặc tả dự án cục bộ và tùy chọn giao diện. Tất cả dữ liệu ở trên thiết bị của bạn.

### `activeTab` / `tabs` - Định tuyến đặc tả theo trang

Đọc origin của tab đang hoạt động để định tuyến đúng đặc tả của dự án tới từng trang, và chuyển tiếp các cập nhật đặc tả (bao gồm sự kiện làm mới trực tiếp) từ service worker nền tới content script của các tab khớp.

**Những gì nó KHÔNG làm**: gửi lịch sử duyệt web của bạn đi đâu, theo dõi các trang bạn truy cập, hay lưu lịch sử duyệt web.

### `alarms` - Giữ kết nối luôn sống

Chạy một alarm keepalive mỗi phút để service worker nền luôn sống nhằm duy trì kết nối làm mới trực tiếp (Server-Sent Events) tới sidecar cục bộ. Trình duyệt sẽ kết thúc service worker khi rảnh; alarm đánh thức nó để giữ luồng đặc tả luôn kết nối.

### `contextMenus` - Menu chuột phải

Thêm một menu con "Specpin" vào menu chuột phải của trang để truy cập nhanh (bật/tắt, bắt, chế độ hiển thị).

### `sidePanel` (chỉ Chrome) - Bề mặt side panel

Mở bề mặt Specpin trong side panel của Chrome bên cạnh trang. Firefox dùng `sidebar_action` tích hợp sẵn của nó.

### `host_permissions` - `http://127.0.0.1/*`, `http://localhost/*`

Cho phép service worker nền kết nối tới sidecar cục bộ qua HTTP và Server-Sent Events trên `localhost` để đọc `.specs/` và nhận cập nhật làm mới trực tiếp. Specpin **không** gửi yêu cầu nào tới bất kỳ máy chủ từ xa nào.

## Hoạt động mạng

Specpin chỉ kết nối tới một sidecar **do chính bạn chạy** (`specpin serve`) trên `localhost` (`127.0.0.1` / `localhost`). Nó giao tiếp qua HTTP và Server-Sent Events, xác thực bằng bearer token.

| Đích đến | Có dùng? |
|----------|----------|
| Sidecar cục bộ của bạn (`http://127.0.0.1:<port>`, `http://localhost:<port>`) | ✅ Chỉ khi bạn thêm kết nối |
| Dịch vụ analytics (Google Analytics, v.v.) | ❌ Không bao giờ |
| Báo cáo lỗi/crash (Sentry, v.v.) | ❌ Không bao giờ |
| Mạng quảng cáo | ❌ Không bao giờ |
| API hay CDN bên ngoài | ❌ Không bao giờ |
| Mã từ xa / script từ xa | ❌ Không bao giờ |

Sidecar cục bộ được làm cứng (hardened): chỉ lắng nghe `127.0.0.1`, yêu cầu xác thực bearer-token, chỉ chấp nhận origin của tiện ích trình duyệt qua CORS, và giới hạn mọi thao tác ghi trong thư mục `.specs/` của bạn. Xem [Bảo mật và quyền riêng tư](/vi/concepts/security-and-privacy/) để biết mô hình bảo mật đầy đủ của sidecar.

## Chia sẻ dữ liệu

Specpin **không** chia sẻ bất kỳ dữ liệu nào với bên thứ ba, nhà quảng cáo, nhà cung cấp analytics, hay tiện ích khác. Không có dữ liệu nào để chia sẻ, vì không có gì được thu thập.

## Đồng bộ trình duyệt

Specpin không dùng bộ nhớ đồng bộ của trình duyệt. Cài đặt kết nối, đặc tả cục bộ và tùy chọn của bạn được lưu trong bộ nhớ cục bộ của tiện ích trên thiết bị nơi bạn thiết lập, và không được đồng bộ qua các thiết bị.

## Lưu giữ và xóa dữ liệu

Toàn bộ dữ liệu của Specpin nằm trong bộ nhớ cục bộ của tiện ích trình duyệt cho đến khi bạn xóa.

**Để xóa toàn bộ dữ liệu của tiện ích:**

1. Mở trang tiện ích của trình duyệt (`chrome://extensions` hoặc `about:addons`).
2. Tìm Specpin và chọn **Xóa**.
3. Toàn bộ dữ liệu tiện ích lưu cục bộ được xóa ngay lập tức.

Bản thân các đặc tả của bạn là các tệp JSON thuần trong thư mục `.specs/` của repo và do bạn kiểm soát qua Git.

## Quyền riêng tư trẻ em

Specpin không thu thập bất kỳ dữ liệu nào từ bất kỳ ai, bao gồm trẻ em dưới 13 tuổi (hoặc độ tuổi tối thiểu tương đương trong khu vực pháp lý của bạn).

## Tính toàn vẹn mã

- **Mã nguồn mở**: toàn bộ mã nguồn tại [github.com/lamngockhuong/specpin](https://github.com/lamngockhuong/specpin)
- **Có thể kiểm tra**: bất kỳ ai cũng có thể xem xét mã
- **Không mã từ xa**: toàn bộ mã tiện ích được bundle và chạy cục bộ; không tải gì từ mạng
- **Giấy phép Apache-2.0**: tự do kiểm tra, sửa đổi và phân phối lại

## Thay đổi chính sách này

Chúng tôi có thể cập nhật chính sách này theo thời gian. Thay đổi sẽ được đăng trên trang này với ngày "Cập nhật lần cuối" mới và phản ánh trong GitHub repository. Thay đổi lớn sẽ được ghi chú trong release notes của GitHub và mô tả cập nhật tiện ích trên store.

## Tuân thủ

Specpin tuân thủ:

- Chính sách chương trình nhà phát triển của Chrome Web Store và Firefox Add-on
- General Data Protection Regulation (GDPR) - bằng cách không thu thập dữ liệu nào
- California Consumer Privacy Act (CCPA) - bằng cách không thu thập dữ liệu nào

Vì Specpin không thu thập bất kỳ dữ liệu cá nhân nào, không có dữ liệu nào để truy cập, export, sửa hay xóa ở phía chúng tôi. Tất cả dữ liệu ở trên thiết bị của bạn, hoàn toàn dưới quyền kiểm soát của bạn.

## Liên hệ

Câu hỏi hoặc lo ngại về quyền riêng tư?

- **Email**: hi@ohnice.app
- **GitHub Issues**: [github.com/lamngockhuong/specpin/issues](https://github.com/lamngockhuong/specpin/issues)
- **GitHub Discussions**: [github.com/lamngockhuong/specpin/discussions](https://github.com/lamngockhuong/specpin/discussions)

---

**Tóm lại**: Specpin là tiện ích ưu tiên quyền riêng tư, ưu tiên cục bộ. Dữ liệu của bạn ở trên thiết bị của bạn - chúng tôi không thu thập gì, không gửi gì, không theo dõi gì. Kết nối mạng duy nhất nó thực hiện là tới một sidecar do chính bạn chạy trên `localhost`.
