# Hướng dẫn chạy

> Bản tiếng Việt của `docs/run-guide.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Specpin gắn các business spec sống vào một UI đang chạy; nó **không** phải là code generator. Hướng dẫn này chạy trọn vòng từ đầu đến cuối: init sidecar, serve, load extension, kết nối, thấy spec render ra, và capture một spec mới.

## Yêu cầu trước

- Node >= 20, pnpm 10
- Go 1.26 (cho sidecar)
- Chrome hoặc Firefox

## 1. Build workspace

```bash
pnpm install
pnpm build
```

## 2. Build sidecar

```bash
cd apps/cli
make build        # syncs the embedded schema, produces bin/specpin
```

## 3. Chạy demo app (tùy chọn, để có sẵn một target)

```bash
pnpm --filter @specpin/demo-react-app dev   # http://localhost:3000
```

Demo đã ship sẵn `examples/demo-react-app/.specs/` với các spec đã seed.

## 4. Khởi động sidecar trong một repo có thư mục `.specs/`

Trong một project mới, scaffold trước:

```bash
specpin init --project "My App" --domains localhost:3000
```

Rồi serve (chạy từ thư mục chứa `.specs/`, ví dụ demo app):

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

Nó in ra một connect URL và token:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

Port được chọn tự động; truyền `--port 5173` để cố định một port.

## 5. Load extension

```bash
pnpm --filter @specpin/extension build            # chrome-mv3 in .output/
pnpm --filter @specpin/extension build:firefox    # firefox-mv2 in .output/
```

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `apps/extension/.output/chrome-mv3`.
- Firefox: `about:debugging` -> This Firefox -> Load Temporary Add-on -> bất kỳ file nào trong `apps/extension/.output/firefox-mv2`.

## 6. Kết nối

Mở trang Options của extension, dán URL và token từ bước 4, click **Test connection & save**. Một thông báo màu xanh xác nhận sidecar đã truy cập được.

## 7. Xem spec render ra

Truy cập demo app (`http://localhost:3000`). Các spec đã match hiện ra dưới dạng tooltip trên element của chúng (badge chuyển sang màu amber khi một match cần review). Sửa một `.spec.json` trên đĩa và trang sẽ live-update qua SSE.

Popup liệt kê các spec cho trang hiện tại, toggle Specpin on/off, đổi display mode, và cung cấp Reload / Reconnect.

## 8. Capture một spec mới

Click **+ Capture spec** trong popup (hoặc nhấn `Alt+Shift+C`), click một element, điền form, và lưu. Spec được validate theo schema, ghi vào `.spec.json` đã chọn (pretty-print), và xuất hiện trong `git diff` để review. Các spec đã capture mang `meta.source: "manual"`.

## Phím tắt

| Phím tắt | Hành động |
|----------|-----------|
| `Alt+Shift+S` | toggle Specpin on/off |
| `Alt+Shift+M` | cycle display mode |
| `Alt+Shift+C` | toggle capture mode (`Esc` để hủy) |

## Chế độ hiển thị

Spec hiển thị dưới dạng **tooltip** (xem nhanh khi hover), **sidebar** (danh sách cố định), hoặc **modal** (hộp thoại giữa màn hình liệt kê mọi spec trên trang). Đổi bằng dropdown chế độ trong popup hoặc xoay vòng với `Alt+Shift+M`. `preferredDisplayMode` theo từng spec và `defaultDisplayMode` trong manifest vẫn áp dụng khi không ép chế độ.

## Dùng không cần sidecar (Manual import)

Để xem spec mà không chạy `specpin serve`, mở trang Options của extension và dán một bundle vào ô **Manual specs**:

```json
{ "manifest": { …manifest.json… }, "files": { "login.spec.json": { …spec file… } } }
```

Nhấn **Load manual specs**. Bundle được validate theo schema ngay trong trang trước khi lưu. Manual specs là read-only (capture vẫn cần sidecar) và tồn tại cho đến khi bạn nhấn **Clear manual specs**. Khi có sidecar được cấu hình và truy cập được, sidecar được ưu tiên; manual specs là phương án dự phòng.

## Validate spec offline

`specpin validate` kiểm tra `manifest.json` và mọi `*.spec.json` theo schema mà không cần chạy server:

```bash
specpin validate --dir .specs
```

Exit code: `0` hợp lệ toàn bộ, `1` có spec không hợp lệ (cần sửa spec), `2` không chạy được (thiếu thư mục hoặc manifest). Lệnh cũng cảnh báo khi `manifest.specFiles` và các file `*.spec.json` trên đĩa không khớp; thêm `--strict-manifest` để biến drift đó thành lỗi thay vì cảnh báo.

## Lint spec trong CI

Dùng reusable action để fail các PR đưa vào spec không hợp lệ. Không cần Node toolchain; validator được build từ một ref Specpin đã pin (không phải PR của repo gọi), nên một PR độc hại không thể thay đổi logic validate:

```yaml
# .github/workflows/spec-lint.yml trong repo của bạn
on: [pull_request]
jobs:
  spec-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: lamngockhuong/specpin/.github/actions/spec-lint@v0.1.0  # pin vào release tag
        with:
          dir: .specs
```

Pin `@<tag>` (không dùng `@main`) để an toàn supply-chain khi đã có release tag.
