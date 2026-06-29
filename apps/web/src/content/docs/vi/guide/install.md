---
title: Cài đặt tiện ích mở rộng
description: Cách build và tải tiện ích mở rộng Specpin từ mã nguồn.
---

Tiện ích mở rộng Specpin chưa được phát hành lên các cửa hàng trình duyệt. Bạn phải build nó từ mã nguồn và tải dưới dạng tiện ích không đóng gói.

## Yêu cầu trước

- Node >= 20
- pnpm 10

## Build tiện ích mở rộng

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

## Tải vào Chrome

1. Mở `chrome://extensions`
2. Bật **Developer mode** (công tắc góc trên bên phải)
3. Nhấp **Load unpacked**
4. Chọn thư mục `apps/extension/.output/chrome-mv3`

Tiện ích mở rộng xuất hiện trên thanh công cụ của bạn. Ghim nó để truy cập nhanh.

## Tải vào Firefox

1. Mở `about:debugging`
2. Nhấp **This Firefox**
3. Nhấp **Load Temporary Add-on...**
4. Chọn bất kỳ tệp nào bên trong `apps/extension/.output/firefox-mv2` (ví dụ: `manifest.json`)

Tiện ích mở rộng tải tạm thời và sẽ biến mất khi bạn khởi động lại Firefox. Tải lại nó từ `about:debugging` khi cần.

:::note
Liên kết cửa hàng (Chrome Web Store, Firefox Add-ons) sẽ được thêm vào đây sau khi Specpin được phát hành.
:::

## Bước tiếp theo

Sau khi tiện ích mở rộng được cài đặt, [bắt đầu với kết nối đầu tiên](/vi/guide/getting-started/).
