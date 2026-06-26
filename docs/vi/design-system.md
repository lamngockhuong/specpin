# Design System cho UI Extension

> Bản tiếng Việt của `docs/design-system.md`. Bản tiếng Anh là nguồn chính (SSOT);
> nếu hai bản lệch nhau, ưu tiên bản tiếng Anh. Các thuật ngữ kỹ thuật, lệnh,
> đường dẫn và tên file được giữ nguyên tiếng Anh.

Tài liệu này chứa các visual mockup cho những bề mặt (surface) hướng tới người dùng
của browser extension, đồng thời là single source of truth cho màu sắc và font của
chúng. File nguồn nằm trong `apps/extension/designs/`. Các file `.pen` chỉ là design
reference (không phải code được ship), nhưng `design-tokens.json` giờ cũng điều khiển
cả UI được ship: nó sinh ra lớp CSS-variable mà các surface đang chạy trong
`apps/extension/src` tiêu thụ (xem mục "Tokens trong UI được ship" bên dưới), nhờ vậy
mockup và code dùng chung một palette.

Aesthetic: "branded teal" - teal accent `#2DD4BF`, một radial top-glow gradient trên
mỗi surface, một accent glow phía sau primary CTA, viền hairline, card radius 16px,
Inter cho UI text và JetBrains Mono cho code/path. Dark là near-black ngả teal; light
là canvas teal nhạt với card trắng. Các design được tạo bằng
[Pencil CLI](https://pencil.dev); mỗi file `.pen` là JSON thuần.

## Một file cho mỗi surface, hai theme

Mỗi surface là một file `.pen` duy nhất chứa **một layout** với theme màu light và
dark (axis `themes` của Pencil, `mode: [light, dark]`). Các màu phụ thuộc theme được
lưu dưới dạng mảng theo từng theme, nên light và dark chắc chắn dùng chung cấu trúc và
chỉ khác nhau ở màu.

| File | Surface | Hiển thị |
|------|---------|----------|
| `popup.pen` | Toolbar popup | status + on/off, project + spec count, spec list, Reload/Reconnect, Capture, mode select, settings link |
| `options.pen` | Options page | trường sidecar URL + token, Test connection & save, banner success/error |
| `sidebar.pen` | Sidebar trong trang | panel liệt kê các spec đã match; spec `needsReview` được gắn viền amber + tag |
| `capture-form.pen` | Capture modal | title, description, business rules, tags, display mode, target file |

PNG đã render: `<surface>.light.png` và `<surface>.dark.png`. `overview.png` là một
montage 2x4 (cột = light | dark). Tooltip renderer (`src/renderers/tooltip.ts`) chưa
có mockup.

## Single source of truth: tokens

`design-tokens.json` chứa các khối `brand`/`font`/`radius` dùng chung cùng với
`themes.light` và `themes.dark`. Mỗi theme cũng mang theo `gradTop`/`gradBottom`
(radial backdrop gradient) và `accentGlow` (CTA glow), nên gradient và glow đổi theo
theme. Gradient nằm trên fill của frame chính ở mỗi surface (màu tham chiếu tới
`$grad-top`/`$grad-bottom`); glow là outer shadow trên primary CTA
(`color: $accent-glow`). `token-bindings.json` ánh xạ tên biến cục bộ của từng file
sang token path (theo tên, ổn định). Pencil không có cơ chế link biến giữa các file,
nên `sync-tokens.mjs` là nơi duy nhất lan truyền token tới cả bốn file.

Đổi palette hoặc font ở mọi nơi:

```bash
cd apps/extension/designs
# 1. sửa giá trị trong design-tokens.json (vd: brand.base, themes.dark.bg, font.ui)
node sync-tokens.mjs   # ghi lại variables của từng .pen (theme color -> mảng theo theme)
./render.sh            # re-export 8 PNG + rebuild overview.png
```

## Tokens trong UI được ship

`design-tokens.json` cũng là SSOT cho UI extension đang chạy. `sync-css-tokens.mjs`
sinh ra `src/shared/tokens.gen.css` (không sửa tay; tên `.gen.css` giúp file này nằm
ngoài phạm vi Biome). File này là một block `:root` (token dùng chung + light theme)
cộng với override `@media (prefers-color-scheme: dark)`, nên UI tự động đi theo theme
của OS/browser, không cần JS và không cần toggle.

```bash
pnpm --filter @specpin/extension sync-css-tokens   # tái sinh tokens.gen.css
```

Hai consumer, một file được sinh ra:

- **Popup + options page** import trực tiếp `tokens.gen.css` (Vite inject vào);
  `:root` khớp với document nên các biến resolve bình thường.
- **Shadow DOM renderers** (sidebar, tooltip, capture form) không thể kế thừa biến
  `:root` của trang: `:host { all: initial }` cô lập chúng, và `:root` không khớp bên
  trong shadow tree. Vì vậy `src/shared/tokens.ts` import `tokens.gen.css?inline` và
  đổi `:root` -> `:host`; mỗi renderer prepend chuỗi đó vào `STYLES` của nó. Custom
  property không bị reset bởi `all`, nên các biến vẫn sống sót qua bước isolation reset.

Cả năm surface chỉ tham chiếu các biến `--sp-*` (không có literal palette hardcode).
Web font (Inter, JetBrains Mono) được tham chiếu qua fallback stack, chưa bundle file
`@font-face` (xem `project-roadmap.md`).

`render.sh` chạy `pencil interactive` ở chế độ headless (deterministic, không dùng AI
agent): với mỗi surface, nó pin `theme` của frame chính sang light rồi dark và export
từng cái.

## Icon của extension

Icon dùng cho toolbar/store nằm trong `apps/extension/designs/`: `specpin-icon.pen`
(nguồn Pencil), `specpin-icon.png` (raster 2x), và `specpin-icon.svg` (vector co giãn
dùng để ship). Pencil export được raster + PDF + HTML nhưng không export SVG, nên file
`.svg` là bản dựng lại bằng tay từ design `.pen`, đã verify bằng cách render ngược ra
PNG.

Ý nghĩa (mỗi thành phần ánh xạ tới việc Specpin làm):

- **Map pin trắng** - chính là `Spec` + `pin` trong tên gọi. Specpin pin một spec
  nghiệp vụ lên một element cụ thể của UI đang chạy; location pin là ẩn dụ cho việc
  "đánh dấu đúng điểm này".
- **Targeting reticle (bốn góc khung ngắm) trong đầu pin** - khoá/khoanh vùng một
  element UI trước khi gắn spec. Phản chiếu bước capture + match của `fingerprint-core`
  vốn khoá một spec vào đúng một element.
- **Teal `#2DD4BF` trên nền squircle (vuông bo góc)** - màu brand lấy từ
  `design-tokens.json`, giữ icon nhất quán với popup/sidebar/tooltip. White-on-teal
  vẫn đọc rõ ở kích thước 16x16. Đĩa teal phía sau reticle thực ra là nền lộ ra qua
  phần khoét rỗng của pin trắng, nên toàn bộ mark chỉ dùng hai màu.

Đọc gộp lại: "nhắm vào một element UI và pin spec của nó lên đó" - Specpin là một lớp
knowledge layer phủ lên giao diện sẵn có, không phải công cụ sinh code.

Tái tạo các kích thước icon chuẩn từ SVG vào `public/icon/`, nơi WXT tự động phát
hiện và đưa vào manifest (`icons` + icon trên thanh công cụ, cấu hình trong
`wxt.config.ts`). Header của popup và options dùng lại trực tiếp `icon/128.png`,
nên chỉ một bước này giữ đồng bộ mọi bề mặt:

```bash
cd apps/extension
for s in 16 32 48 128; do rsvg-convert -w $s -h $s designs/specpin-icon.svg -o public/icon/$s.png; done
```

## Scripts

| Script | Vai trò |
|--------|---------|
| `sync-tokens.mjs` | Áp token vào 4 file `.pen`. `--rebind` rebuild `token-bindings.json` sau khi sửa cấu trúc hoặc thêm biến. |
| `render.sh` | Export PNG light+dark cho mỗi surface và build `overview.png`. |

4 file `.pen` là nguồn chính, sửa tay được. Sau bất kỳ chỉnh sửa cấu trúc nào (thêm
biến, thêm node gắn với token), chạy `node sync-tokens.mjs --rebind` một lần, rồi
chạy `sync-tokens.mjs` + `render.sh` như bình thường.

## Conventions

- `.pen` schema version được pin ở `2.13` (phiên bản mà headless reader chấp nhận).
  Pencil agent đôi khi đóng dấu `2.14` + một cloud `fileToken` không deterministic;
  `render.sh` normalize cả hai về local 2.13.
- Không chạy nhiều process `pencil` song song: chúng dùng chung một IPC socket và một
  auth session nên sẽ xung đột. `render.sh` chạy tuần tự.
- Thêm một design variable mới: đặt tên khớp với một entry trong `NAME_MAP` của
  `sync-tokens.mjs` (vd: `bg-surface`, `text-muted`, `success-bg`) để nó tự bind và
  theme. Tên nằm ngoài map sẽ giữ dạng scalar (vd: `overlay-bg` scrim của modal, vốn
  cố ý theme-agnostic).
