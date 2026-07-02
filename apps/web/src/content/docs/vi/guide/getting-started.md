---
title: Bắt đầu
description: Kết nối với một dự án và xem spec đầu tiên của bạn hiển thị trong trình duyệt.
---

Hướng dẫn này đưa bạn qua việc kết nối với một dự án và xem spec đầu tiên hiển thị trên trang web. Hai con đường nhanh nhất: thử ứng dụng demo đi kèm hoặc kết nối với dự án của riêng bạn.

## Lựa chọn A: Thử ứng dụng demo

Ứng dụng demo đi kèm các spec đã chuẩn bị sẵn để bạn có thể thấy Specpin hoạt động ngay lập tức.

### 1. Build Go sidecar

Từ thư mục gốc của repository Specpin:

```bash
cd apps/cli
make build
```

Lệnh này tạo ra `apps/cli/bin/specpin`.

### 2. Khởi động ứng dụng demo

```bash
pnpm --filter @specpin/demo-react-app dev
```

Demo chạy tại `http://localhost:3000`. Đây là một Acme CRM đa màn hình nhỏ (đăng nhập, dashboard, danh sách khách hàng và chi tiết, cài đặt, tạo deal mới). Đăng nhập với bất kỳ giá trị nào để đến các màn hình đã xác thực.

### 3. Phục vụ thư mục `.specs/` của demo

Từ thư mục ứng dụng demo:

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

Sidecar in ra:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

### 4. Bật Specpin

Nhấp vào biểu tượng tiện ích mở rộng Specpin trên thanh công cụ của bạn. Chuyển công tắc **Hiện spec trên trang này** sang BẬT.

### 5. Kết nối với sidecar

Trong popup của tiện ích mở rộng, nhấp vào biểu tượng bánh răng **Cài đặt kết nối** (góc trên bên phải), sau đó nhấp **Thêm dự án**.

Dán URL và token được in ra ở bước 3, tùy chọn thêm nhãn (ví dụ: "Demo App"), và nhấp **Kiểm tra & thêm dự án**. Kết nối xuất hiện trong danh sách với trạng thái, số lượng spec và các domain của nó.

### 6. Xem spec hiển thị

Quay lại `http://localhost:3000`. Các spec khớp xuất hiện trên các phần tử của chúng. Di chuột qua một phần tử để xem tooltip của nó (chế độ hiển thị mặc định).

Sửa một tệp `.spec.json` trên đĩa và trang sẽ cập nhật trực tiếp qua SSE.

## Lựa chọn B: Kết nối với dự án của riêng bạn

### 1. Cài CLI

```bash
npm install -g @specpin/cli    # hoặc: pnpm add -g @specpin/cli
```

### 2. Khởi tạo thư mục `.specs/` trong dự án của bạn

Từ thư mục gốc dự án của bạn:

```bash
specpin init --project "My App" --domains localhost:3000
```

Lệnh này tạo ra `.specs/manifest.json`.

### 3. Phục vụ specs của bạn

```bash
specpin serve
```

Sidecar in ra một URL và token.

### 4. Kết nối trong tiện ích mở rộng

Làm theo các bước 4-6 từ Lựa chọn A, dán URL và token sidecar của riêng bạn.

## Những gì bạn có thể làm tiếp theo

- **Ghi một spec mới**: Nhấp **+ Ghi spec** trong popup (hoặc nhấn `Alt+Shift+C`), nhấp vào một phần tử, điền form và lưu. Spec xuất hiện trên phần tử đó ngay lập tức.
- **Chuyển chế độ hiển thị**: Sử dụng menu thả xuống trong popup hoặc nhấn `Alt+Shift+M` để chuyển giữa tooltip, thanh bên và hộp thoại.
- **Tìm kiếm specs**: Sử dụng ô tìm kiếm trong popup hoặc thanh bên để lọc theo tiêu đề, tệp, thẻ hoặc mô tả.
- **Sửa một spec**: Nhấp vào badge tooltip để ghim nó, sau đó nhấp **Sửa spec**. Form mở với nội dung đã điền sẵn; thay đổi bất kỳ thứ gì và lưu.
- **Mở thanh bên**: Nhấp **Mở dạng thanh bên** trong popup (Chrome) hoặc sử dụng nút chuyển thanh bên gốc của Firefox (**View -> Sidebar -> Specpin**). Thanh bên hiển thị mô tả đầy đủ và quy tắc nghiệp vụ của mỗi spec nội tuyến.

## Phím tắt

| Phím tắt | Hành động |
|----------|--------|
| `Alt+Shift+S` | Bật/tắt Specpin |
| `Alt+Shift+M` | Chuyển chế độ hiển thị |
| `Alt+Shift+C` | Bật/tắt chế độ ghi (`Esc` để hủy) |

## Bước tiếp theo

- [Tìm hiểu cách kết nối nhiều dự án](/vi/usage/connecting-projects/)
- [Khám phá việc xem và lọc specs](/vi/usage/viewing-specs/)
- [Ghi và sửa specs trong trình duyệt](/vi/usage/capturing-and-editing/)
