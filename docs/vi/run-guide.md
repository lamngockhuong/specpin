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
