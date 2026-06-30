---
title: Cài đặt và chạy CLI
description: Build và chạy sidecar CLI specpin để phục vụ các spec của bạn tới extension trình duyệt.
---

`specpin` CLI là một sidecar Go phục vụ thư mục `.specs/` của bạn qua API HTTP localhost an toàn có xác thực token. Extension kết nối tới nó để tải spec và theo dõi thay đổi trực tiếp.

## Cài đặt

Hiện tại, bạn build CLI từ mã nguồn. Yêu cầu Go 1.26.

```bash
cd apps/cli
make build
```

Lệnh này tạo ra `bin/specpin`. Bạn có thể thêm binary vào PATH hoặc gọi trực tiếp.

## Khởi tạo một dự án

Trong repository ứng dụng của bạn (không phải monorepo Specpin), tạo khung thư mục `.specs/`:

```bash
specpin init --project "My App" --domains localhost:3000
```

Lệnh này tạo `.specs/manifest.json` với tên dự án và các domain nơi UI của bạn chạy. Trường `domains` kiểm soát các site nào spec của dự án này sẽ hiển thị. Một mảng `domains` rỗng nghĩa là spec có thể xuất hiện trên mọi site (hãy cẩn thận với điều này).

Bạn có thể sửa `manifest.json` bằng tay sau đó. Xem [Định dạng spec](/vi/sidecar/spec-format/) để biết chi tiết.

## Phục vụ spec

Chạy sidecar từ thư mục chứa `.specs/`:

```bash
specpin serve
```

Nó in ra output như sau:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c1f8e9b3a...
```

Sao chép URL và token. Bạn sẽ dán chúng vào cài đặt kết nối của extension. Xem [Kết nối các dự án](/vi/usage/connecting-projects/) cho bước tiếp theo.

Port được chọn tự động trừ khi bạn truyền `--port`:

```bash
specpin serve --port 5173
```

Theo mặc định, sidecar chỉ bind `127.0.0.1`. Các request phải bao gồm `Authorization: Bearer <token>` trong header. CORS chỉ chấp nhận origin của extension (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) và từ chối web origin. Các thao tác ghi được giới hạn trong `.specs/` (có bảo vệ path-traversal), được tuần tự hóa, và pretty-printed để có Git diff sạch.

Bearer token được tạo lại mỗi lần bạn chạy `serve`. Truyền `--token <secret>` (hoặc đặt biến môi trường `SPECPIN_TOKEN`) để ghim một token ổn định, để việc khởi động lại không làm ngắt kết nối mọi client:

```bash
specpin serve --port 5173 --token "$(openssl rand -hex 24)"
```

Nếu extension mất kết nối sau khi khởi động lại với token ngẫu nhiên, chạy `serve` lại và cập nhật token trong cài đặt kết nối của extension.

## Phục vụ trên máy từ xa

Theo mặc định Specpin là công cụ localhost một người dùng. Để chia sẻ một `.specs/` cho cả nhóm, hãy chạy sidecar trên một máy chung và kết nối extension tới nó qua **HTTPS**. Binary Go chỉ nói HTTP thuần; **TLS do một reverse proxy đứng trước đảm nhiệm**. Remote *bắt buộc* dùng HTTPS — request của extension chạy trong secure context, nên một remote `http://` thuần sẽ bị chặn vì mixed content.

Khuyến nghị: giữ sidecar trên loopback và chạy proxy (Caddy, nginx, Cloudflare Tunnel) trên **cùng một máy**, ghim port và token:

```bash
specpin serve --port 51234 --token "$(openssl rand -hex 24)"
```

```
# Caddy
specs.example.com {
  reverse_proxy 127.0.0.1:51234
}
```

`--host <addr>` bind một địa chỉ không phải loopback cho trường hợp nâng cao "proxy trên máy khác". Điều này **không** tự đưa proxy vào đường đi — nó phơi bày trực tiếp cổng thô, **plaintext, chỉ-token**, nên hãy firewall cổng đó và luôn ghim `--port`. Lệnh serve sẽ in một cảnh báo rõ ràng mỗi khi bind ngoài loopback.

:::caution
Bearer token là ranh giới ủy quyền duy nhất đối với các client mạng không phải trình duyệt (CORS chỉ ràng buộc trình duyệt). Hãy coi nó như mật khẩu và phân phối ngoài luồng (out-of-band). Cổng thô ngoài loopback là plaintext — đừng bao giờ phơi nó ra internet mà không có HTTPS proxy đứng trước.
:::

Xem mục "Serve on a remote machine" trong hướng dẫn chạy để có ví dụ Caddy + nginx hoạt động được (đệm SSE, preflight CORS) và mô hình mối đe dọa đầy đủ.

## Live reload

Sidecar theo dõi thay đổi trong `.specs/` qua Server-Sent Events (SSE). Khi bạn sửa một file `.spec.json` trên đĩa và lưu, extension nhận được update và render lại trang ngay lập tức. Không cần refresh trình duyệt.

## Validate spec ngoại tuyến

Để kiểm tra spec của bạn mà không phục vụ chúng:

```bash
specpin validate --dir .specs
```

Mã thoát:
- `0` tất cả hợp lệ
- `1` tìm thấy spec không hợp lệ (sửa spec)
- `2` không thể chạy (thiếu thư mục hoặc manifest)

Theo mặc định, `validate` cảnh báo nếu `manifest.specFiles` và các file `*.spec.json` trên đĩa không khớp. Truyền `--strict-manifest` để biến sự lệch đó thành lỗi thay vì cảnh báo.

:::tip
Sử dụng `specpin validate` trong CI để phát hiện spec không hợp lệ trước khi merge. Xem [GitHub Action có thể tái sử dụng](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint) để lấy ví dụ.
:::

## Thư mục `.specs/`

Các spec của bạn nằm trong `.specs/` ở gốc của repo dự án:

```
.specs/
├── manifest.json          # index + project config
├── views.json             # cài đặt hiển thị mặc định theo nhóm (tùy chọn)
└── login.spec.json        # một nhóm spec
└── dashboard.spec.json
```

- `manifest.json` (bắt buộc) đánh chỉ mục các file spec của bạn và giữ cài đặt dự án như `domains`, `defaultLocale`, và `defaultDisplayMode`.
- Mỗi file `*.spec.json` là một **SpecFile**: một nhóm spec có tên (ví dụ `login.spec.json` giữ tất cả spec cho màn hình đăng nhập).
- `views.json` (tùy chọn) định nghĩa quy tắc hiển thị mức team (spec nào bị ẩn theo mặc định cho mọi người trong team).

Tất cả file đều là JSON, được quản lý phiên bản trong Git, và có thể review qua PR.

## Quy trình làm việc gắn liền với Git

Vì spec là các file JSON được commit vào repo của bạn, chúng tuân theo cùng quy trình review như code của bạn:

1. Sửa hoặc capture một spec.
2. Sidecar ghi thay đổi vào `.specs/<file>.spec.json` (pretty-printed).
3. `git diff` hiển thị chính xác những gì đã thay đổi.
4. Commit, push, và mở PR.
5. Đồng đội review các thay đổi spec cùng với thay đổi code.

Theo mặc định spec không bao giờ rời khỏi máy của bạn: sidecar bind localhost và không có dịch vụ đám mây hay telemetry nào. Nếu bạn chọn dùng sidecar từ xa, spec chỉ được gửi tới sidecar đó — một máy chủ do **bạn** vận hành và kiểm soát — không bao giờ tới bất kỳ dịch vụ nào do Specpin vận hành.

## Nhiều dự án

Bạn có thể chạy nhiều sidecar cho các dự án khác nhau trên các port khác nhau:

```bash
# Terminal 1 (dự án A)
cd /path/to/project-a
specpin serve --port 51001

# Terminal 2 (dự án B)
cd /path/to/project-b
specpin serve --port 51002
```

Thêm từng kết nối trong trang Options của extension. Extension định tuyến spec tới đúng trang dựa trên trường `domains` của mỗi dự án. Một extension có thể phục vụ nhiều dự án cùng lúc.
