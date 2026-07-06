---
title: Giới thiệu
description: Specpin là gì và cách nó gắn các spec nghiệp vụ hệ thống lên giao diện web đang chạy của bạn.
---

Specpin gắn các đặc tả nghiệp vụ (quy tắc, mô tả, tiêu chí nghiệm thu) trực tiếp lên các phần tử của giao diện web đang chạy, sau đó hiển thị chúng trong trình duyệt khi bạn di chuột hoặc duyệt trang.

## Nó giải quyết vấn đề gì?

Tài liệu trôi xa khỏi mã nguồn sẽ chỉ còn là nhiễu. Specpin giữ cho các spec luôn cập nhật bằng cách ghim chúng vào chính giao diện. Các spec tồn tại qua việc tái cấu trúc, được phiên bản hóa cùng mã nguồn trong Git, và xuất hiện chính xác ở nơi bạn cần chúng.

## Nó là gì

- **Tiện ích mở rộng trình duyệt** khớp các spec với các phần tử DOM thông qua fingerprint ổn định (test-id, aria, selector, xpath, văn bản, vị trí).
- **Sidecar Go** (`specpin serve`) phục vụ thư mục `.specs/` của bạn qua localhost xác thực bằng token, với live-reload qua SSE.
- **Lớp kiến thức Git-native** tồn tại dưới dạng JSON trong repo của bạn, có thể xem xét qua PR, so sánh diff, phiên bản hóa.
- **Không phụ thuộc framework** vì việc khớp xảy ra trên DOM thuần túy.

## Nó KHÔNG phải là gì

Specpin **không phải** là công cụ sinh mã từ spec. Nó không liên quan gì đến GitHub Spec Kit / OpenSpec. Nó không sinh ra bất kỳ mã ứng dụng nào. Nó là một lớp kiến thức ghim tài liệu luôn cập nhật lên giao diện bạn đã có.

## Những gì bạn cần

Để sử dụng Specpin, bạn cần ít nhất một dự án:

- **Dự án sidecar**: một repo có thư mục `.specs/`, được phục vụ qua `specpin serve` (Git-native, có thể xem xét, chia sẻ nhóm).
- **Dự án cục bộ**: các spec lưu trong `browser.storage.local`, được tạo trực tiếp trong tiện ích mở rộng (cá nhân, di động, có thể xuất dưới dạng `.specs.zip`).

## Bước tiếp theo

- [Cài đặt tiện ích mở rộng](/vi/guide/install/)
- [Bắt đầu với kết nối đầu tiên](/vi/guide/getting-started/)
