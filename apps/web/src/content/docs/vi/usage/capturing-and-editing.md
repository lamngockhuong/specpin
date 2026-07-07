---
title: Ghi và sửa spec
description: Cách ghi spec mới và sửa spec hiện có ngay tại chỗ.
---

Specpin cho phép bạn soạn spec trực tiếp trên trang mà không cần rời trình duyệt.

## Ghi thủ công

Vào chế độ ghi, nhấp vào một phần tử và điền vào biểu mẫu.

1. Nhấp **+ Ghi spec** trong popup hoặc side panel, hoặc nhấn `Alt+Shift+C`.
2. Rê chuột qua trang. Một khung làm nổi bật xuất hiện xung quanh các phần tử khi bạn di chuyển. Một HUD nhỏ ở giữa phía dưới màn hình hiển thị hướng dẫn.
3. Nhấp vào phần tử bạn muốn gắn spec.
4. Biểu mẫu ghi mở ra. Điền các trường (xem bên dưới).
5. Nhấp **Lưu spec**. Biểu mẫu đóng bằng icon **X** trên phần đầu modal (góc trên bên phải) hoặc bằng phím **Escape**. Click ra ngoài modal không còn đóng biểu mẫu nữa.

Spec được ghi vào dự án đã chọn và xuất hiện ngay lập tức trên phần tử.

### Các trường biểu mẫu ghi

- **Ngôn ngữ**: Một hàng các tab (một tab cho mỗi locale, cộng với tab **+**). Nhấp vào một tab để soạn tiêu đề, mô tả và quy tắc cho ngôn ngữ đó. Chuyển tab để thêm bản dịch. Biểu mẫu giữ lại những gì bạn đã nhập cho mỗi ngôn ngữ.
- **Tiêu đề**: Nhãn ngắn (bắt buộc đối với ngôn ngữ mặc định).
- **Mô tả**: Phần tử này làm gì (bắt buộc đối với ngôn ngữ mặc định). Hỗ trợ Markdown.
- **Quy tắc nghiệp vụ**: Một quy tắc trên mỗi dòng (tùy chọn). Hỗ trợ Markdown (chỉ đánh dấu nội tuyến).
- **Thẻ**: Phân tách bằng dấu phẩy (tùy chọn, ví dụ: `auth, critical`).
- **Trạng thái**: Trạng thái vòng đời - draft, approved, hoặc deprecated (tùy chọn; để trống cho trung tính).
- **Liên kết**: Các tham chiếu do tác giả khai báo tới ticket, tài liệu hoặc PR liên quan (tùy chọn). Mỗi liên kết gồm một nhãn cùng một URL `http`/`https`.
- **Test liên kết**: Các đường dẫn test tương đối so với repo khai báo spec này (tùy chọn). Đây là các liên kết *được khai báo*, không phải kết quả test - Specpin kiểm tra các đường dẫn tồn tại khi chạy `specpin validate`, nhưng không bao giờ chạy chúng.
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

Mở menu **⋯** trên thẻ spec ở side panel rồi chọn **Sửa**, hoặc nhấp vào huy hiệu tooltip sau đó **Sửa spec** trong tooltip đã ghim.

Cùng một biểu mẫu mở ra, được điền trước với nội dung của spec cho mọi ngôn ngữ đã soạn. Thay đổi bất kỳ trường nào và nhấp **Lưu thay đổi**. Spec giữ `id` và nguồn gốc của nó (`createdBy`, `createdAt`, `source`); chỉ `updatedAt` được tăng lên.

Sửa ghi lại thông qua dự án sở hữu (sidecar hoặc cục bộ) và cập nhật trang tức thời.

## Đánh dấu đã review

Biểu mẫu sửa có hành động **Đánh dấu đã review** đóng dấu ngày review của spec (`reviewedAt`) và một token người review (`reviewedBy`). Nhập một **token không chứa PII** - một cái tên hoặc handle, không phải email - vì nó được commit vào Git và bao gồm trong các bản export; biểu mẫu cảnh báo bạn điều này. Ngày review điều khiển chỉ báo **cũ** trên spec đã render một khi vượt qua ngưỡng cũ của dự án.

## Liên kết lại phần tử (chỉ sửa)

Khi sửa một spec, bạn có thể trỏ nó vào một phần tử khác:

1. Nhấp **Liên kết lại phần tử** trong biểu mẫu sửa.
2. Biểu mẫu ẩn đi. HUD bộ chọn phần tử xuất hiện ở giữa phía dưới. Rê chuột qua trang và nhấp vào phần tử mới.
3. Biểu mẫu mở lại với các chỉnh sửa của bạn còn nguyên và fingerprint mới được áp dụng. Nhấp **Lưu thay đổi** để áp dụng.

## Menu nhấp chuột phải

Khi Specpin bật, menu nhấp chuột phải của trang có menu phụ **Specpin**:

- **Ghim spec vào phần tử này**: Ghi phần tử bạn nhấp chuột phải trực tiếp, bỏ qua bước chọn di chuột.
- **Xem spec ở đây**: Đóng khung phần tử khớp và hiển thị spec của nó trong tooltip, bất kể chế độ hiển thị của spec. Hiển thị thông báo ngắn khi không có spec ở đây.
- **Ghi spec (chọn phần tử)**: Vào chế độ chọn di chuột (giống như nút popup).
- **Tắt Specpin**: Tắt Specpin cho trang.

Menu phụ bị ẩn khi Specpin tắt. Bật lại từ popup hoặc nhấn `Alt+Shift+S`.

## Ghi hàng loạt

Ghi nhiều spec cùng một lúc trong một luồng công việc.

### Bắt đầu ghi hàng loạt

1. Nhấp **Ghi hàng loạt** trong popup hoặc side panel (cạnh nút "+ Ghi spec").
2. Hoặc, từ chế độ coverage (xem "Chế độ coverage" trong [Xem Spec](/vi/usage/viewing-specs/)), nhấp **"Ghi tất cả gap (N)"** để tải trước các element chưa được ghi.

### Bộ chọn multi-select

1. Các element xuất hiện với highlight khi bạn di chuyển con trỏ. Một HUD trên màn hình ở giữa phía dưới hiển thị số lượng đang chọn ("N đã chọn") và các nút **Xong** / **Hủy**.
2. Nhấp element để toggle chúng vào/ra khỏi lựa chọn. Mỗi element đã chọn nhận một viền xanh lá cây cố định.
3. Nút **Xong** bị vô hiệu hóa cho đến khi chọn ít nhất một element. Nhấn **Enter** hoặc click **Xong** để xác nhận và chuyển tới biểu mẫu. Nhấn **Esc** hoặc click **Hủy** để hủy và quay lại trang.

### Biểu mẫu ghi hàng loạt

Sau khi chọn element, biểu mẫu ghi mở ra với:

1. **Trường dùng chung** ở trên: tag, quy tắc nghiệp vụ, trạng thái, và (nếu nhiều dự án phục vụ trang) bộ chọn dự án; nếu không thì là tệp đích.
2. Một **danh sách per-element** bên dưới: một dòng cho mỗi element đã chọn.
   - **Tiêu đề** (tự động suy ra từ text hiển thị → aria-label → title attr → placeholder → humanized tag/role, có thể sửa inline).
   - Nút xóa (×) để loại bỏ dòng đó.
   - Các dòng có tiêu đề trùng lặp bị cờ để bạn có thể phân biệt.
3. Các trường dùng chung được áp dụng vào tất cả spec. Description của mỗi dòng được điền sẵn từ tiêu đề của nó (ghi hàng loạt thu thập tiêu đề, không phải description riêng). Biểu mẫu hàng loạt đóng bằng icon **X** trên phần đầu modal hoặc **Escape**. Click ra ngoài modal không còn đóng biểu mẫu nữa.

### Lưu bản ghi hàng loạt

Nhấp **Lưu spec** để ghi tất cả dòng dưới dạng các spec riêng vào một tệp `.spec.json` dùng chung (được tổ chức theo page/route).

Nếu một lần ghi thất bại giữa đường, biểu mẫu vẫn mở và đánh dấu dòng nào thành công và dòng nào cần thử lại. Các dòng đã thành công được giữ lại trong tệp; bạn có thể sửa các vấn đề và gửi lại các dòng còn lại.

## Mẫu

Cả biểu mẫu ghi element đơn lẻ và ghi hàng loạt đều có menu thả xuống **"Bắt đầu từ mẫu"**.

Các mẫu tích sẵn gồm:

- **Form validation**: Điền sẵn tag, quy tắc nghiệp vụ, và trạng thái tối ưu cho spec form validation.
- **API error handling**: Điền sẵn cho các spec xử lý lỗi.
- **Auth flow**: Điền sẵn cho các spec liên quan xác thực.

Chọn một mẫu điền sẵn **chỉ các trường trống**. Nó không bao giờ ghi đè text bạn đã nhập. Không có dialog xác nhận. Mẫu được cố định trong UI và localize theo ngôn ngữ giao diện extension của bạn.

## Nhân bản sang element

Khi xem một spec bạn có thể sửa (badge tooltip hoặc thẻ side panel), hành động **Nhân bản sang element** xuất hiện. Trên thẻ side panel, nút này nằm trong menu **⋯** với nhãn **Nhân bản**.

1. Nhấp **Nhân bản sang element**.
2. Bộ chọn element xuất hiện (cùng với HUD trên màn hình để hướng dẫn). Nhấp element mới trên trang.
3. Biểu mẫu ghi mở ra, được điền sẵn với nội dung spec nguồn: tiêu đề, mô tả, quy tắc nghiệp vụ, và tag.
4. Spec nhân bản nhận:
   - Một **fingerprint mới** (khớp với element mới).
   - Một `id` mới (suy ra lại từ tiêu đề khi lưu).
   - **Provenance được đặt lại**: status trở thành `draft`, và metadata review (`verifiedBy`, `reviewedAt`, `reviewedBy`) bị xóa.

Điều này đảm bảo một spec nguồn approved không bao giờ im lặng sao chép thành "approved" trên một element mới: spec nhân bản luôn bắt đầu là draft và yêu cầu re-review.

## Xuất spec (dự án cục bộ)

Dự án cục bộ có thể được xuất dưới dạng bundle `.specs.zip`:

1. Trong popup hoặc side panel, nhấp **Xuất** (góc trên bên phải). Nếu nhiều dự án phục vụ trang, một bộ chọn xuất hiện.
2. Trong trang Options, nhấp **Xuất** trên thẻ của dự án cục bộ.

Bundle chứa `manifest.json` cộng với một `*.spec.json` cho mỗi nhóm, và bất kỳ file config `.specs/` nào có nội dung: `guides.json`, `views.json`, và (chỉ dự án cục bộ) `required.json`. File config rỗng sẽ được bỏ qua. Giải nén nó vào thư mục `.specs/` của repo, hoặc nhập lại các tệp thông qua bộ chọn nhiều tệp trong Options - vòng round-trip giữ được cả guide và view, không chỉ spec.

Dự án sidecar cũng hỗ trợ **Xuất** (bundle được lắp ráp từ cache đang chạy).
