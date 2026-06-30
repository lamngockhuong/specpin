---
title: Cách Hoạt Động
description: Hiểu kiến trúc ba tầng của Specpin và cách đặc tả giữ liên kết với phần tử UI qua các lần refactor.
---

Specpin gắn đặc tả nghiệp vụ lên phần tử UI đang chạy thông qua hệ thống ba tầng: một kho đặc tả được quản lý phiên bản bằng Git, một sidecar server cục bộ, và một extension trình duyệt khớp và hiển thị đặc tả.

## Luồng Ba Tầng

```
.specs/ (trong repo của bạn) -> specpin serve (sidecar Go) -> extension trình duyệt
```

1. **Đặc tả của bạn nằm trong `.specs/`** dưới dạng file JSON trong repo dự án. Chúng được quản lý phiên bản bằng Git, review được qua pull request, và xem diff được như bất kỳ code nào khác.

2. **`specpin serve` mở chúng ra** qua HTTP (xác thực token, live-reload qua Server-Sent Events). Sidecar là một binary Go nhỏ, theo mặc định bind tới `127.0.0.1` trên một cổng tự động chọn; không có gì rời khỏi máy của bạn trừ khi bạn chọn dùng sidecar từ xa (HTTPS qua reverse proxy của riêng bạn).

3. **Extension trình duyệt kết nối** tới sidecar, tải đặc tả của bạn, khớp từng đặc tả với một phần tử DOM trên trang, và hiển thị nó (dạng tooltip, sidebar, hoặc modal). Khi bạn sửa một file đặc tả trên đĩa, trang sẽ tự động refresh.

## Đặc Tả Giữ Liên Kết Với Phần Tử Như Thế Nào

Mỗi đặc tả lưu một **fingerprint** với nhiều tín hiệu về phần tử đích của nó:

- Thuộc tính `data-spec-id` (nếu có, khớp chính xác)
- `data-testid` và các mẫu test-id khác
- Thuộc tính ARIA (role, label, describedby)
- Thuộc tính `id` không được sinh tự động
- CSS selector tối ưu hóa
- XPath
- Nội dung text
- Vị trí trên trang
- Gợi ý theo framework

Khi bạn mở một trang, extension đi qua DOM và cố khớp fingerprint của từng đặc tả. Nó kiểm tra các anchor chính xác trước (`data-spec-id`, test-id ổn định, aria), rồi fallback sang một CSS selector duy nhất. Nếu không tìm thấy kết quả khớp có độ tin cậy cao, đặc tả sẽ được gắn cờ **Cần xem lại** để bạn xác nhận hoặc liên kết lại thủ công.

Cách tiếp cận đa tín hiệu này nghĩa là đặc tả vẫn sống sót qua các đợt refactor. Nếu bạn đổi tên CSS class nhưng giữ nguyên `data-testid`, đặc tả vẫn tìm được phần tử của nó. Nếu bạn thay đổi cả hai nhưng aria-label vẫn giữ nguyên, việc khớp vẫn hoạt động.

### Thêm Thuộc Tính `data-spec-id`

Với các phần tử quan trọng (button, input, navigation item), thêm thuộc tính `data-spec-id` vào source code:

```html
<button data-spec-id="submit-order">Gửi Đơn Hàng</button>
```

Extension sẽ khớp đặc tả này chính xác, bất kể điều gì khác thay đổi. Đây là anchor đáng tin cậy nhất.

## Điều Gì Xảy Ra Khi Một Kết Quả Khớp Cần Xem Lại

Nếu extension không thể khớp đặc tả một cách tin cậy, nó sẽ đánh dấu **Cần xem lại**. Điều này xảy ra khi:

- Phần tử bị xóa hoặc refactor mạnh.
- Nhiều phần tử hiện khớp với fingerprint (mơ hồ).
- Chỉ còn các tín hiệu yếu (vị trí, text một phần).

Bạn sẽ thấy đặc tả trong danh sách của extension với huy hiệu màu vàng. Click **Sửa spec**, rồi **Liên kết lại phần tử**, và click vào đúng phần tử trên trang. Extension sẽ capture một fingerprint mới và lưu lại vào thư mục `.specs/` của bạn. Đặc tả giờ đã được khớp lại.

## Ưu Tiên Cục Bộ, Riêng Tư

Theo mặc định, tất cả dữ liệu đặc tả chỉ chạy qua máy cục bộ của bạn. Sidecar bind tới `127.0.0.1` và yêu cầu bearer token (được in ra khi bạn chạy `specpin serve`). Extension tải đặc tả qua HTTP localhost, và các thao tác ghi quay lại thư mục `.specs/` của bạn dưới dạng file JSON được format đẹp. Không có dịch vụ nào do Specpin vận hành nhìn thấy đặc tả hoặc trang của bạn; sidecar từ xa, nếu bạn chọn dùng, là một máy chủ do chính bạn vận hành. Xem [Bảo Mật và Quyền Riêng Tư](/vi/concepts/security-and-privacy/) để biết chi tiết đầy đủ.
