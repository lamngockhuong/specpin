---
title: Cài đặt và chạy CLI
description: Build và chạy sidecar CLI specpin để phục vụ các spec của bạn tới extension trình duyệt.
---

`specpin` CLI là một sidecar Go phục vụ thư mục `.specs/` của bạn qua API HTTP localhost an toàn có xác thực token. Extension kết nối tới nó để tải spec và theo dõi thay đổi trực tiếp.

## Cài đặt

Cài CLI từ npm. Nó tự tải binary dựng sẵn khớp với OS và CPU của bạn:

```bash
npm install -g @specpin/cli    # hoặc: pnpm add -g @specpin/cli
specpin --version

# hoặc chạy không cần cài:
npx @specpin/cli serve
```

Muốn lấy binary thô? Tải `specpin-<os>-<arch>` từ [bản phát hành CLI mới nhất](https://github.com/lamngockhuong/specpin/releases?q=cli), hoặc build từ mã nguồn (yêu cầu Go 1.26):

```bash
cd apps/cli
make build      # -> bin/specpin
```

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

Theo mặc định Specpin là công cụ localhost một người dùng. Để chia sẻ một `.specs/` cho cả nhóm, hãy chạy sidecar trên một máy chung và kết nối extension tới nó qua **HTTPS**. Binary Go chỉ nói HTTP thuần; **TLS do một reverse proxy đứng trước đảm nhiệm**. Remote *bắt buộc* dùng HTTPS: request của extension chạy trong secure context, nên một remote `http://` thuần sẽ bị chặn vì mixed content.

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

`--host <addr>` bind một địa chỉ không phải loopback cho trường hợp nâng cao "proxy trên máy khác". Điều này **không** tự đưa proxy vào đường đi, nó để lộ trực tiếp cổng thô, **plaintext, chỉ-token**, nên hãy firewall cổng đó và luôn ghim `--port`. Lệnh serve sẽ in một cảnh báo rõ ràng mỗi khi bind ngoài loopback.

### Không có domain? Phục vụ qua IP

Server nội bộ chỉ có IP (không có domain) không dùng được HTTPS *tự động* của Caddy, nhưng extension vẫn chấp nhận `https://<ip>`, SAN của chứng chỉ có thể là một IP trần, nên không cần domain. Hai hướng, đều chạy được trên mọi trình duyệt:

- **HTTPS qua một CA nội bộ.** Đặt IP trần làm site address của Caddy với `tls internal` (`192.168.1.50 { tls internal; reverse_proxy 127.0.0.1:51234 }`), hoặc tạo chứng chỉ có IP-SAN bằng `mkcert 192.168.1.50` / openssl cho nginx. Phân phối **root CA** vào trình duyệt của cả nhóm một lần, rồi kết nối tới `https://192.168.1.50`. Áp dụng cho cả IP LAN nội bộ lẫn IP public.
- **SSH tunnel về localhost.** `ssh -N -L 9123:127.0.0.1:51234 user@192.168.1.50`, giữ sidecar trên loopback, rồi kết nối tới `http://localhost:9123`, không cần chứng chỉ, vì `localhost` luôn được miễn.

`http://<ip>` thuần **không** dùng được: trình duyệt chặn remote plaintext (IP LAN nội bộ chỉ chạy trên Chrome 142+ qua Local Network Access, vốn không thể hiện prompt từ service worker của extension, còn Firefox không có cơ chế tương đương). Xem mục "No domain? Serve over IP" trong hướng dẫn chạy để có công thức đầy đủ.

:::caution
Bearer token là ranh giới ủy quyền duy nhất đối với các client mạng không phải trình duyệt (CORS chỉ ràng buộc trình duyệt). Hãy coi nó như mật khẩu và phân phối ngoài luồng (out-of-band). Cổng thô ngoài loopback là plaintext: đừng bao giờ để lộ nó ra internet mà không có HTTPS proxy đứng trước.
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

### Kiểm tra các đường dẫn `verifiedBy`

`validate` cũng kiểm tra rằng mọi đường dẫn `verifiedBy` trên một spec **tồn tại** trong repo. Đây là một cơ chế chống liên kết hỏng - nó không bao giờ chạy test và không bao giờ ngụ ý rằng chúng pass; một spec nêu tên một test chỉ *khai báo* một liên kết tới nó.

Các đường dẫn được phân giải theo gốc repo, mặc định là thư mục cha của `--dir` (nên `.specs/` ở `<repo>/.specs` không cần cờ thêm). Khi `.specs/` của bạn nằm ở nơi khác, hãy trỏ validate về đúng gốc:

```bash
specpin validate --dir path/to/.specs --repo-root path/to/repo
```

Các đường dẫn phải nằm bên trong repo: đường dẫn tuyệt đối, đi ngược `../`, và symlink thoát ra khỏi gốc đều bị từ chối. Một đường dẫn `verifiedBy` không tồn tại sẽ thoát với mã `1`. Nếu không có cây làm việc đọc được để phân giải, việc kiểm tra được bỏ qua kèm một ghi chú (nó không làm hỏng lần chạy).

:::tip
Sử dụng `specpin validate` trong CI để phát hiện spec không hợp lệ trước khi merge. Xem [GitHub Action có thể tái sử dụng](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint) để lấy ví dụ.
:::

## Báo cáo sức khỏe spec

`specpin report` audit một thư mục `.specs/` ngoại tuyến và in ra ba phần: **freshness**, **spec stats**, và một **kiểm tra spec bắt buộc**. Mặc định chỉ cảnh báo, nên bạn có thể đưa các tín hiệu governance lên CI mà không làm hỏng build cho đến khi chủ động bật.

```bash
specpin report --dir .specs
specpin report --dir .specs --json   # output có cấu trúc để CI parse
```

**Freshness** đánh dấu các spec đã cũ về mặt review. Một spec là *stale* khi `meta.reviewedAt` cũ hơn `settings.stalenessThresholdDays` (mặc định 90). Một spec không có `reviewedAt` là *never-reviewed* - được báo cáo riêng và không bao giờ bị tính là stale. Freshness đo độ mới của *review*, không phải của *sửa đổi*, nên cố ý không fallback về `updatedAt`.

**Spec stats** đếm spec theo status và theo file. Chúng đếm *spec*, không phải element UI: report chạy ngoại tuyến không có trình duyệt, nên không hứa hẹn % coverage - độ phủ element chỉ đo được trong extension.

**Kiểm tra spec bắt buộc** đọc `.specs/required.json` và đánh dấu bất kỳ id nào liệt kê trong đó mà không có spec khớp. Nó chỉ kiểm tra sự tồn tại, không bao giờ kiểm tra element matching. Nếu file vắng, việc kiểm tra được bỏ qua.

```json
// .specs/required.json
{
  "version": "1.0",
  "required": ["login-submit-btn", "dashboard-stat-revenue"]
}
```

Mã thoát:
- `0` báo cáo đã tạo (chỉ cảnh báo - mặc định)
- `1` một điều kiện `--fail-on` bị kích hoạt
- `2` không thể chạy (thiếu thư mục hoặc manifest), hoặc truyền một điều kiện `--fail-on` không xác định

### Chặn CI bằng `--fail-on`

Mặc định không có gì làm hỏng build. Bật bằng `--fail-on`, một danh sách điều kiện phân tách bằng dấu phẩy:

```bash
specpin report --dir .specs --fail-on missing-required
specpin report --dir .specs --fail-on stale,missing-required
```

| Điều kiện | Thất bại khi |
|-----------|--------------|
| `stale` | `reviewedAt` của một spec cũ hơn ngưỡng |
| `draft-committed` | một spec đã commit có `status: "draft"` |
| `missing-required` | một id trong `required.json` không có spec khớp |
| `missing-verifiedby` | một spec không khai báo đường dẫn `verifiedBy` nào |

`missing-verifiedby` chỉ kiểm tra xem một spec có *khai báo* `verifiedBy` hay không - khác với `validate`, vốn kiểm tra các đường dẫn đã khai báo có tồn tại. Một điều kiện không xác định sẽ thoát `2` thay vì bị âm thầm bỏ qua, và các spec `never-reviewed` được báo cáo nhưng không bao giờ chặn.

:::tip
[GitHub Action có thể tái sử dụng](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint) nhận một input `report-fail-on` để chạy gate này trong CI; để trống để bỏ qua gate.
:::

## Format spec

Sidecar, `specpin init`, và extension đều ghi JSON trong `.specs/` theo một dạng canonical duy nhất: thụt lề 2 khoảng trắng, expand hoàn toàn (mỗi phần tử object/array một dòng), có newline ở cuối. `specpin format` viết lại spec của bạn về dạng đó, nhờ vậy các chỉnh sửa qua extension chỉ tạo diff Git tối thiểu, dễ review.

```bash
specpin format --dir .specs          # viết lại tại chỗ
specpin format --check --dir .specs  # báo cáo lệch, không ghi (cho CI / pre-commit)
```

Đây là phép biến đổi thuần khoảng trắng: không bao giờ đổi thứ tự key hay thay đổi giá trị, và chạy hai lần là no-op.

Mã thoát:
- `0` tất cả file đã canonical (hoặc format lại thành công)
- `1` `--check` tìm thấy file cần format, hoặc một file không đọc được / không phải JSON hợp lệ
- `2` không thể chạy (thiếu thư mục)

### Coi `.specs/` là artifact do tool sở hữu

`.specs/` được sinh ra và thuộc quyền sở hữu của specpin, giống như `package-lock.json` hay code được generate. Nếu bạn chạy một formatter cho cả repo (Prettier, Biome, dprint), hãy **loại trừ `.specs/`** để nó không xung đột với specpin. Nếu không, formatter của bạn sẽ collapse các array mà specpin expand, và mỗi lần sửa spec sẽ churn cả file.

```text
# .prettierignore
.specs/
```

```jsonc
// biome.json - hoặc bỏ qua .specs/ ...
{ "files": { "includes": ["**", "!**/.specs/**"] } }
// ... hoặc khớp format của specpin để cả hai đồng thuận:
{ "overrides": [{ "includes": ["**/.specs/**/*.json"], "json": { "formatter": { "expand": "always" } } }] }
```

Sau đó chuẩn hóa bằng `specpin format` và gate nó trong CI hoặc pre-commit hook:

```bash
# .git/hooks/pre-commit (hoặc lint-staged / husky)
specpin format --check || {
  echo "spec cần được format - chạy: specpin format" >&2
  exit 1
}
```

:::tip
Kết hợp `specpin format --check` với `specpin validate` trong CI để spec vừa hợp lệ vừa được format nhất quán.
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

Theo mặc định spec không bao giờ rời khỏi máy của bạn: sidecar bind localhost và không có dịch vụ đám mây hay telemetry nào. Nếu bạn chọn dùng sidecar từ xa, spec chỉ được gửi tới sidecar đó, một máy chủ do **bạn** vận hành và kiểm soát, không bao giờ tới bất kỳ dịch vụ nào do Specpin vận hành.

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
