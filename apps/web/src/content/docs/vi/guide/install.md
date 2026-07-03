---
title: Cài đặt tiện ích mở rộng
description: Cài Specpin cho Chrome từ Chrome Web Store, hoặc build từ mã nguồn.
---

Specpin cho Chrome đã có trên Chrome Web Store. Người dùng Firefox tạm thời build từ mã nguồn.

## Cài từ Chrome Web Store

Cài Specpin trực tiếp từ [Chrome Web Store](https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn). Tiện ích mở rộng xuất hiện trên thanh công cụ. Ghim nó để truy cập nhanh, rồi [bắt đầu với kết nối đầu tiên](/vi/guide/getting-started/).

## Build từ mã nguồn (Firefox, hoặc phát triển)

Với Firefox, hoặc để phát triển tiện ích, hãy build từ mã nguồn và tải dưới dạng tiện ích không đóng gói.

### Yêu cầu trước

- Node >= 22
- pnpm 11

### Build tiện ích mở rộng

Từ thư mục gốc của repository Specpin:

```bash
pnpm install
pnpm build
```

Sau đó build tiện ích mở rộng cho trình duyệt của bạn:

```bash
# Chrome (Manifest V3)
pnpm --filter @specpin/extension build

# Firefox (Manifest V2)
pnpm --filter @specpin/extension build:firefox
```

Output cho Chrome nằm trong `apps/extension/.output/chrome-mv3`.  
Output cho Firefox nằm trong `apps/extension/.output/firefox-mv2`.

### Tải vào Chrome

1. Mở `chrome://extensions`
2. Bật **Developer mode** (công tắc góc trên bên phải)
3. Nhấp **Load unpacked**
4. Chọn thư mục `apps/extension/.output/chrome-mv3`

Tiện ích mở rộng xuất hiện trên thanh công cụ của bạn. Ghim nó để truy cập nhanh.

### Tải vào Firefox

1. Mở `about:debugging`
2. Nhấp **This Firefox**
3. Nhấp **Load Temporary Add-on...**
4. Chọn bất kỳ tệp nào bên trong `apps/extension/.output/firefox-mv2` (ví dụ: `manifest.json`)

Tiện ích mở rộng tải tạm thời và sẽ biến mất khi bạn khởi động lại Firefox. Tải lại nó từ `about:debugging` khi cần.

:::note
Bản phát hành Firefox Add-ons sắp có. Trong lúc chờ, tiện ích tạm thời ở trên là cách chạy Specpin trên Firefox.
:::

## Bước tiếp theo

Sau khi tiện ích mở rộng được cài đặt, [bắt đầu với kết nối đầu tiên](/vi/guide/getting-started/).
