---
title: Xem spec
description: Cách xem, tìm kiếm và lọc spec trên trang.
---

Khi một dự án được kết nối, spec sẽ xuất hiện trên các phần tử khớp.

## Bật/tắt Specpin

Nhấp vào công tắc ở đầu popup, hoặc nhấn `Alt+Shift+S`. Khi Specpin tắt, spec sẽ biến mất khỏi trang. Cài đặt này được duy trì qua các phiên.

## Chế độ hiển thị

Spec được hiển thị theo một trong ba chế độ:

- **Tooltip**: Một huy hiệu nhỏ trên mỗi phần tử. Rê chuột để xem nhanh spec. Nhấp vào huy hiệu để ghim tooltip mở (với hành động **Sửa spec** và **Mở trong thanh bên**).
- **Thanh bên**: Một bảng liên tục liệt kê tất cả spec trên trang. Xuất hiện ở phía bên phải của trang. Nhấp nút **x** để đóng (mở lại bằng một nút Specpin nhỏ ở góc dưới bên phải).
- **Hộp thoại**: Một bảng kéo thả được hiển thị tất cả spec. Mở ở giữa, kéo tiêu đề để di chuyển. Nhấp nút **x** để đóng.

Chuyển chế độ bằng menu thả xuống **Chế độ hiển thị** trong popup hoặc side panel, hoặc nhấn `Alt+Shift+M` để chuyển đổi qua chúng.

Mỗi spec có thể ghi đè mặc định bằng `preferredDisplayMode` riêng của nó. Menu thả xuống hiển thị **Theo từng spec** khi không có chế độ nào bị ép buộc.

## Xoay vòng qua các spec đã khớp

Nhấn `Alt+Shift+N` để di chuyển giữa các spec khớp trên trang hiện tại: mỗi lần nhấn sẽ cuộn tới và nháy sáng ngắn phần tử của spec tiếp theo, rồi quay lại spec đầu tiên sau spec cuối. Nó tôn trọng thiết lập giảm chuyển động của bạn.

## Side panel (Chrome và Firefox)

**Side panel** là một bề mặt neo cố định luôn mở khi bạn duyệt. Nó hiển thị các điều khiển giống như popup, cộng với mô tả đầy đủ và quy tắc nghiệp vụ của mỗi spec. Hộp tìm kiếm cũng lọc theo mô tả trong side panel.

- **Chrome**: Nhấp **Mở dạng thanh bên** từ popup, hoặc đặt **Biểu tượng thanh công cụ -> Mở thanh bên** trong Options để làm cho biểu tượng thanh công cụ mở nó trực tiếp.
- **Firefox**: Mở nó từ **View -> Sidebar -> Specpin**. Biểu tượng thanh công cụ luôn mở popup trên Firefox.

Side panel tự động làm mới khi bạn chuyển tab hoặc điều hướng.

## Tìm kiếm spec

Hộp tìm kiếm trong popup và side panel lọc spec theo thời gian thực theo tiêu đề, file và tag. Trong side panel, nó cũng tìm kiếm văn bản mô tả. Không có kết quả hiển thị thông báo "Không có spec khớp với tìm kiếm".

## Chia sẻ một spec (deep link)

Mỗi thẻ spec trong side panel và mỗi tooltip đã ghim có hành động **Sao chép liên kết**. Nó sao chép một URL dạng `<url-trang>#specpin=<spec-id>`. Mở liên kết đó sẽ cuộn tới và nháy sáng phần tử của spec, đồng thời mở side panel với thẻ của nó được làm nổi bật — tiện để chỉ cho đồng đội một spec cụ thể trong ngữ cảnh.

Nếu phần tử render muộn, Specpin sẽ thử lại một lúc trước khi bỏ cuộc. Nếu spec tồn tại nhưng phần tử của nó không còn trên trang, thẻ trong side panel vẫn mở và hiện thông báo ngắn "không có trên trang này". Mọi fragment mà ứng dụng của bạn đã dùng trong URL đều được giữ nguyên.

## Thay đổi kể từ lần xem trước

Popup và side panel hiển thị bản tóm tắt **"N thay đổi kể từ lần xem trước"**: một con số cùng tiêu đề của các spec được thêm hoặc chỉnh sửa kể từ lần bạn xem gần nhất, theo từng dự án. Nhấp **Đánh dấu đã xem** để xóa nó và đặt mốc mới.

Việc phát hiện so sánh hash nội dung của tiêu đề, mô tả và quy tắc nghiệp vụ của mỗi spec (trên mọi ngôn ngữ), lưu cục bộ trong trình duyệt của bạn — không mạng, không telemetry. Chuyển ngôn ngữ spec không bao giờ được tính là thay đổi. Lần đầu một dự án xuất hiện, các spec của nó được seed âm thầm nên không có gì hiện ra là "mới".

## Huy hiệu nguồn

Mỗi hàng spec hiển thị một huy hiệu nhỏ đánh dấu nguồn của nó:

- **sidecar**: Từ một sidecar đã kết nối.
- **manual**: Từ một dự án cục bộ hoặc nhập thủ công.

Rê chuột qua huy hiệu để xem tooltip với chi tiết hơn.

## Khối nguồn gốc

Khi một spec mang các trường nguồn gốc, spec đã render sẽ hiển thị một khối nguồn gốc:

- **Huy hiệu trạng thái**: trạng thái vòng đời của spec (draft, approved, hoặc deprecated), khi được đặt.
- **Liên kết**: các tham chiếu do tác giả khai báo tới ticket, tài liệu hoặc PR. Mỗi liên kết mở trong tab mới.
- **Test liên kết**: các đường dẫn `verifiedBy` khai báo spec, hiển thị dưới dạng danh sách. Chúng được *liên kết*, không phải đã xác minh — Specpin không chạy chúng hay tuyên bố chúng pass.
- **Đã review**: một dòng "đã review {thời gian tương đối}" từ hành động **Đánh dấu đã review** gần nhất. Vượt qua ngưỡng cũ của dự án, một chỉ báo **cũ** xuất hiện, nhắc bạn review lại.

Nguồn gốc do tác giả khẳng định: nó phản ánh những gì tác giả của spec đã commit, và bước kiểm tra thực sự là việc review Git-diff của `.specs/`, không phải điều gì đó lúc chạy.

## Ngôn ngữ nội dung spec

Văn bản spec (tiêu đề, mô tả, quy tắc nghiệp vụ) có thể được bản địa hóa. Menu thả xuống **Ngôn ngữ** (được gán nhãn **Ngôn ngữ của spec** trong tiêu đề popup) đặt locale đang hoạt động. Lựa chọn được duy trì qua các phiên.

Khi một spec không có văn bản cho locale đã chọn, nó sẽ rơi vào `defaultLocale` của dự án, sau đó là bất kỳ locale hiện có nào.

Menu thả xuống **Ngôn ngữ** liệt kê hợp của `settings.locales` từ tất cả các dự án đã kết nối.

:::note
Điều này kiểm soát ngôn ngữ nội dung spec, không phải ngôn ngữ UI của extension. Để thay đổi ngôn ngữ UI, xem [Cài đặt](/vi/usage/settings/).
:::

## Bộ lọc facet

Popup và side panel cung cấp bộ lọc theo **Thẻ**, **Tệp** và **Trang này** (mẫu URL). Bỏ chọn một facet sẽ ẩn tất cả spec khớp ngay lập tức.

Một tùy chỉnh cá nhân (buộc hiển thị hoặc buộc ẩn) đồng bộ qua các máy thông qua `chrome.storage.sync`. Side panel cũng cung cấp công tắc con mắt theo từng spec để kiểm soát tinh hơn. Nhấp **Đặt lại** để xóa tất cả các tùy chỉnh cá nhân.

## Spec cần xem lại

Khi fingerprint của một spec không thể khớp chính xác, nó xuất hiện với viền màu hổ phách và thẻ **Cần xem lại**. Huy hiệu chuyển sang màu hổ phách (thay vì màu xanh mặc định). Điều này có nghĩa là phần tử có thể đã thay đổi, và bạn nên xác minh spec vẫn mô tả đúng phần tử.

## Hiển thị Markdown

Mô tả spec và quy tắc nghiệp vụ hỗ trợ một tập con Markdown an toàn:

- **Đánh dấu nội tuyến**: đậm (`**đậm**`), nghiêng (`_nghiêng_`), liên kết (`[văn bản](url)`).
- **Danh sách**: danh sách dấu đầu dòng (`- mục`) và danh sách đánh số (`1. mục`).

Markdown được hiển thị trên tất cả các chế độ hiển thị (tooltip, sidebar, modal, side panel).

## Trang nhiều dự án

Khi nhiều hơn một dự án phục vụ một trang, popup liệt kê từng dự án khớp phía trên danh sách spec. Mỗi hàng spec hiển thị nhãn dự án nhỏ. Renderer đặt nhãn cho từng spec với tên dự án của nó.

## Xuất spec

Popup và side panel hiển thị nút **Xuất** (góc trên bên phải) khi một dự án phục vụ trang. Nhấp vào nó để tải xuống `.specs.zip` chứa spec của dự án đó. Nếu nhiều dự án phục vụ trang, một bộ chọn xuất hiện để chọn dự án nào cần xuất.

Dự án cục bộ cũng hiển thị **Xuất** cho mỗi batch trong trang Options.
