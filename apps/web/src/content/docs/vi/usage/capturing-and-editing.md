---
title: Ghi và sửa spec
description: Cách ghi spec mới và sửa spec hiện có ngay tại chỗ.
---

Specpin cho phép bạn soạn spec trực tiếp trên trang mà không cần rời trình duyệt.

## Ghi thủ công

Vào chế độ ghi, nhấp vào một phần tử và điền vào biểu mẫu.

1. Nhấp **+ Ghi spec** trong popup hoặc side panel, hoặc nhấn `Alt+Shift+C`.
2. Rê chuột qua trang. Một khung làm nổi bật xuất hiện xung quanh các phần tử khi bạn di chuyển.
3. Nhấp vào phần tử bạn muốn spec.
4. Biểu mẫu ghi mở ra. Điền các trường (xem bên dưới).
5. Nhấp **Lưu spec**.

Spec được ghi vào dự án đã chọn và xuất hiện ngay lập tức trên phần tử.

### Các trường biểu mẫu ghi

- **Ngôn ngữ**: Một hàng các tab (một tab cho mỗi locale, cộng với tab **+**). Nhấp vào một tab để soạn tiêu đề, mô tả và quy tắc cho ngôn ngữ đó. Chuyển tab để thêm bản dịch. Biểu mẫu giữ lại những gì bạn đã nhập cho mỗi ngôn ngữ.
- **Tiêu đề**: Nhãn ngắn (bắt buộc đối với ngôn ngữ mặc định).
- **Mô tả**: Phần tử này làm gì (bắt buộc đối với ngôn ngữ mặc định). Hỗ trợ Markdown.
- **Quy tắc nghiệp vụ**: Một quy tắc trên mỗi dòng (tùy chọn). Hỗ trợ Markdown (chỉ đánh dấu nội tuyến).
- **Thẻ**: Phân tách bằng dấu phẩy (tùy chọn, ví dụ: `auth, critical`).
- **Chế độ hiển thị**: Dùng mặc định của dự án, tooltip hoặc thanh bên.
- **Dự án đích**: Dự án nào để lưu vào. Với nhiều hơn một dự án ghi được phục vụ trang, chọn từ menu thả xuống. Với chính xác một, nó được chọn tự động. Với không có, ghi bị vô hiệu hóa với một lời giải thích.
- **Tệp đích**: Tệp `.spec.json` để ghi vào (được điền trước, có thể chỉnh sửa).

:::tip
Tab **+** cho phép bạn thêm ngôn ngữ mới. Nhập mã locale BCP-47 (ví dụ: `vi`, `ja`, `en-US`). Mỗi locale có tab riêng. Ngôn ngữ mặc định (từ manifest của dự án) yêu cầu tiêu đề và mô tả.
:::

## Thanh công cụ Markdown

Các trường **Mô tả** và **Quy tắc nghiệp vụ** có một thanh công cụ nhỏ với các nút chèn Markdown:

- **Thanh công cụ mô tả**: Đậm, Nghiêng, Liên kết, Danh sách dấu đầu dòng, Danh sách đánh số.
- **Thanh công cụ quy tắc nghiệp vụ**: Đậm, Nghiêng, Liên kết (mỗi quy tắc là một dòng, nên danh sách khối không áp dụng).

Nhấp vào một nút để chèn Markdown xung quanh lựa chọn của bạn. Nút **Liên kết** nhắc nhập URL.

## Soạn thảo đa ngôn ngữ

Chuyển đổi giữa các tab ngôn ngữ để soạn một spec trong nhiều locale. Biểu mẫu lưu trữ những gì bạn đã nhập cho mỗi ngôn ngữ khi bạn chuyển, vì vậy không có gì bị mất.

Ngôn ngữ mặc định (từ manifest của dự án) phải có tiêu đề và mô tả. Các ngôn ngữ khác là tùy chọn. Khi người dùng xem một spec bằng ngôn ngữ không có văn bản, nó sẽ rơi vào locale mặc định.

## Bộ chọn dự án đích

Với nhiều hơn một dự án ghi được phục vụ trang, menu thả xuống **Dự án đích** liệt kê chúng theo tên và loại (ví dụ: "CRM (cục bộ)" so với "My Sidecar (sidecar)"). Chọn cái bạn muốn lưu vào.

Với chính xác một dự án ghi được, không có bộ chọn nào hiển thị (dự án duy nhất được sử dụng). Với không có, ghi bị vô hiệu hóa và biểu mẫu giải thích rằng bạn cần tạo một dự án cục bộ hoặc kết nối sidecar trước.

## Sửa spec hiện có

Nhấp **Sửa** trên thẻ spec trong side panel, hoặc nhấp vào huy hiệu tooltip sau đó **Sửa spec** trong tooltip đã ghim.

Cùng một biểu mẫu mở ra, được điền trước với nội dung của spec cho mọi ngôn ngữ đã soạn. Thay đổi bất kỳ trường nào và nhấp **Lưu thay đổi**. Spec giữ `id` và nguồn gốc của nó (`createdBy`, `createdAt`, `source`); chỉ `updatedAt` được tăng lên.

Sửa ghi lại thông qua dự án sở hữu (sidecar hoặc cục bộ) và cập nhật trực tiếp trang.

## Liên kết lại phần tử (chỉ sửa)

Khi sửa một spec, bạn có thể trỏ nó vào một phần tử khác:

1. Nhấp **Liên kết lại phần tử** trong biểu mẫu sửa.
2. Biểu mẫu ẩn đi. Rê chuột qua trang và nhấp vào phần tử mới.
3. Biểu mẫu mở lại với các chỉnh sửa của bạn còn nguyên và fingerprint mới được áp dụng. Nhấp **Lưu thay đổi** để áp dụng.

## Menu nhấp chuột phải

Khi Specpin bật, menu nhấp chuột phải của trang có menu phụ **Specpin**:

- **Ghim spec vào phần tử này**: Ghi phần tử bạn nhấp chuột phải trực tiếp, bỏ qua bước chọn di chuột.
- **Xem spec ở đây**: Đóng khung phần tử khớp và hiển thị spec của nó trong tooltip, bất kể chế độ hiển thị của spec. Hiển thị thông báo ngắn khi không có spec ở đây.
- **Ghi spec (chọn phần tử)**: Vào chế độ chọn di chuột (giống như nút popup).
- **Tắt Specpin**: Tắt Specpin cho trang.

Menu phụ bị ẩn khi Specpin tắt. Bật lại từ popup hoặc nhấn `Alt+Shift+S`.

## Xuất spec (dự án cục bộ)

Dự án cục bộ có thể được xuất dưới dạng bundle `.specs.zip`:

1. Trong popup hoặc side panel, nhấp **Xuất** (góc trên bên phải). Nếu nhiều dự án phục vụ trang, một bộ chọn xuất hiện.
2. Trong trang Options, nhấp **Xuất** trên thẻ của dự án cục bộ.

Bundle chứa `manifest.json` cộng với một `*.spec.json` cho mỗi nhóm. Giải nén nó vào thư mục `.specs/` của repo, hoặc nhập lại các tệp thông qua bộ chọn nhiều tệp trong Options.

Dự án sidecar cũng hỗ trợ **Xuất** (bundle được lắp ráp từ cache đang chạy).
