---
title: Cài đặt
description: Cách tùy chỉnh giao diện và hành vi của Specpin.
---

Mở trang Options từ popup hoặc side panel (nhấp vào biểu tượng bánh răng ở góc trên bên phải).

## Giao diện

Các cài đặt này kiểm soát giao diện của chính Specpin. Chúng áp dụng cho mọi giao diện của Specpin (popup, side panel, options và tooltip/thanh bên/hộp thoại hiển thị trong trang).

### Chế độ hiển thị

Chọn cách Specpin hiển thị:

- **Theo hệ thống**: Theo tùy chọn sáng/tối của hệ điều hành của bạn.
- **Sáng**: Luôn dùng chế độ sáng.
- **Tối**: Luôn dùng chế độ tối.

Chế độ hiển thị thay đổi ngay lập tức trên mọi giao diện Specpin đang mở.

### Đánh số badge

Mặc định tắt. Khi bật, mỗi badge tooltip trên trang hiển thị một số theo thứ tự đọc thay cho chữ "S": badge trên-trái nhất là `1`, và số lớn nhất bằng số spec màn hình đang có. Đây là cách nhanh để đếm và định vị các spec trên một trang.

Con số là vị trí, không phải định danh: thêm hoặc xóa một spec sẽ đánh số lại các spec phía sau (giống số dòng). Nó chỉ áp dụng cho badge tooltip trên trang, và cập nhật ngay trên các tab đang mở khi bạn bật/tắt.

### Màu badge

Chọn màu cho badge spec trên trang để hợp với bảng màu của website hoặc để ảnh chụp màn hình gọn hơn. Mặc định là màu teal thương hiệu của Specpin; **Đặt lại** đưa về màu này. Ký tự trên badge (chữ "S" hoặc số) tự chuyển giữa tông tối và sáng để luôn dễ đọc trên màu bạn chọn.

Màu này áp dụng toàn cục (một lựa chọn cho mọi trang) và cập nhật ngay trên các tab đang mở. Nó chỉ đổi màu badge spec thường: badge vàng "cần xem lại" giữ nguyên màu cảnh báo, và các marker coverage không đổi.

### Ngôn ngữ

Chọn ngôn ngữ cho UI của Specpin:

- **Theo hệ thống**: Sử dụng ngôn ngữ UI của trình duyệt của bạn (rơi vào tiếng Anh nếu không có).
- **English**: Ép UI tiếng Anh.
- **Tiếng Việt**: Ép UI tiếng Việt.
- **日本語**: Ép UI tiếng Nhật.

Cài đặt này độc lập với ngôn ngữ nội dung spec (menu thả xuống **Ngôn ngữ** trong popup và side panel). Thay đổi ngôn ngữ UI không thay đổi ngôn ngữ mà spec hiển thị.

## Biểu tượng thanh công cụ (chỉ Chrome)

Trên Chrome, bạn có thể chọn điều gì xảy ra khi bạn nhấp vào biểu tượng Specpin trên thanh công cụ:

- **Mở popup**: Hành vi mặc định.
- **Mở thanh bên**: Nhấp vào biểu tượng để mở side panel trực tiếp.

:::note
Trên Firefox, biểu tượng thanh công cụ luôn mở popup. Mở side panel từ **View -> Sidebar -> Specpin** thay thế.
:::

## Hỗ trợ & Phản hồi

Trang Options có các liên kết đến GitHub của dự án:

- **Báo lỗi**: Mở trang GitHub Issues.
- **Đặt câu hỏi**: Mở trang GitHub Discussions.

Sử dụng chúng để báo lỗi, yêu cầu tính năng hoặc yêu cầu trợ giúp.

## Phím tắt

Các phím tắt này hoạt động trên bất kỳ trang nào khi Specpin được tải:

| Phím tắt | Hành động |
|----------|-----------|
| `Alt+Shift+S` | Bật/tắt Specpin |
| `Alt+Shift+M` | Chuyển chế độ hiển thị (tooltip -> thanh bên -> hộp thoại) |
| `Alt+Shift+C` | Vào chế độ ghi (`Esc` hủy) |
| `Alt+Shift+N` | Xoay vòng qua các spec đã khớp (nháy sáng từng cái, quay lại từ đầu) |
| `Alt+Shift+G` | Bắt đầu / dừng tour hướng dẫn mặc định |

Phím tắt luôn hoạt động. Bạn không thể tùy chỉnh chúng từ trang Options (sử dụng cài đặt phím tắt extension của trình duyệt nếu bạn cần thay đổi chúng).

## Cài đặt theo từng dự án

Mỗi dự án đã kết nối trong trang Options có hàng riêng với các điều khiển sau:

- **Công tắc Bật/Tắt**: Bật hoặc tắt dự án mà không xóa nó.
- **Sửa**: Thay đổi URL, nhãn hoặc token (sidecar) hoặc tên và tên miền (cục bộ).
- **Kết nối lại**: Kiểm tra kết nối sidecar lại (chỉ sidecar).
- **Xuất**: Tải xuống `.specs.zip` chứa spec của dự án (cục bộ và sidecar).
- **Đổi tên**: Thay đổi tên dự án và tên miền (chỉ cục bộ).
- **Xóa**: Xóa kết nối.

Xem [Kết nối dự án](/vi/usage/connecting-projects/) để biết chi tiết.

## Spec thủ công (không cần sidecar)

Trong trang Options, mục **Spec** có tab **Thủ công** nơi bạn có thể nhập spec mà không cần chạy `specpin serve`. Tải spec từ tệp (chọn cả thư mục `.specs/`: `manifest.json`, một hoặc nhiều `*.spec.json`, và bất kỳ tệp nào trong số `guides.json` / `views.json` / `required.json`) hoặc dán bundle JSON. `guides.json` được import sẽ hiển thị như team guide và `views.json` sẽ ẩn các facet của nó, đúng như một sidecar; `required.json` được chấp nhận và lưu lại nhưng hiện chưa có tác dụng gì trong extension (đây là checklist coverage chỉ dành cho CLI). Bạn cũng có thể chọn tệp `<project>.specs.zip` đã export hoặc một thư mục được nén bằng công cụ bất kỳ: cả zip không nén (STORE) lẫn zip đã nén (DEFLATE) đều nhập lại trực tiếp; tệp zip hỏng sẽ báo lỗi rõ ràng.

Mỗi lần nhập sẽ thêm một batch. Các batch đã tải xuất hiện bên dưới các nút, một thẻ cho mỗi lần nhập, với các hành động **Xuất**, **Đổi tên** và **Xóa**. Nhấp **Xóa tất cả spec thủ công** để làm trống danh sách.

Xem [Hướng dẫn chạy](/vi/guide/getting-started/) để biết hình dạng bundle JSON và lệnh `specpin bundle`.
