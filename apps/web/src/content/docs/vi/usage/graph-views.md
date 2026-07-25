---
title: Graph views
description: Soạn sơ đồ status-flow và screen-transition rồi xem chúng trong một graph view toàn trang.
---

Hai file `.specs/` tùy chọn được render thành sơ đồ trong một **graph view** toàn trang riêng: một đồ thị **status-flow** (trạng thái của một đối tượng di chuyển giữa các state ra sao) và một đồ thị **screen-transition** (screen nào điều hướng tới screen nào, qua hành động gì). Cả hai đều được soạn tay trong `.specs/` cùng với các spec của bạn.

:::note
Graph views là một **sơ đồ chỉ-đọc** dựa trên dữ liệu trong `.specs/flows.json` và `.specs/screens.json`. Hiện chưa có editor trong extension để sửa tay node/trường - hãy soạn trực tiếp dưới dạng JSON (xem [Spec format](/vi/sidecar/spec-format/) để biết mô hình soạn `.specs/` nói chung, và [`flows.json`/`screens.json` trên GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md#flowsconfig-specsflowsjson) để biết định dạng chính xác từng trường). Các transition trong `screens.json` cũng có thể được lấp đầy *mà không cần* đụng tới JSON, bằng cách bật auto-capture và duyệt những gì nó quan sát được - xem [Tự động ghi lại screen transition](#tự-động-ghi-lại-screen-transition) bên dưới.
:::

## Soạn một đồ thị status-flow

Tạo `.specs/flows.json` để mô tả vòng đời của một đối tượng (ví dụ một "Deal" di chuyển qua pipeline bán hàng của bạn):

```json
{
  "version": "1.0",
  "flows": [
    {
      "id": "deal-status",
      "object": { "en": "Deal" },
      "states": [
        { "id": "draft", "label": { "en": "Draft" }, "kind": "initial" },
        { "id": "negotiation", "label": { "en": "Negotiation" } },
        { "id": "won", "label": { "en": "Won" }, "kind": "terminal", "specId": "deal-stage" },
        { "id": "lost", "label": { "en": "Lost" }, "kind": "terminal", "specId": "deal-stage" }
      ],
      "transitions": [
        {
          "id": "start-negotiation",
          "from": "draft",
          "to": "negotiation",
          "trigger": { "en": "Start negotiation" },
          "specId": "deal-submit"
        }
      ]
    }
  ]
}
```

Một file có thể chứa nhiều flow độc lập (một cho mỗi kiểu đối tượng). `kind` của mỗi state (`initial` / `normal` / `terminal`) quyết định cách nó render; `specId` tùy chọn của một state hoặc transition liên kết nó ngược về một spec đã pin, nên click vào nó trong graph có thể nhảy tới phần tử đang chạy (xem [Click-to-highlight](#click-to-highlight) bên dưới).

## Soạn một đồ thị screen-transition

Tạo `.specs/screens.json` để mô tả điều hướng của ứng dụng:

```json
{
  "version": "1.0",
  "screens": [
    { "id": "login", "name": { "en": "Login" }, "urlGlob": "/login" },
    { "id": "dashboard", "name": { "en": "Dashboard" }, "urlGlob": "/" }
  ],
  "transitions": [
    {
      "id": "login-to-dashboard",
      "from": "login",
      "to": "dashboard",
      "trigger": { "en": "Sign in" },
      "specId": "login-submit-btn"
    }
  ]
}
```

`urlGlob` của mỗi screen nhận diện nó trên UI đang chạy, dùng lại đúng cú pháp glob như phạm vi trang của một spec (`*` khớp một segment đường dẫn, `**` khớp qua nhiều segment).

## Mở graph view

Click **Open graph view** trong popup hoặc side panel. Nó mở trong một tab trình duyệt mới. Nếu một project đã kết nối có cả đồ thị status-flow lẫn screen-transition, một bộ chọn dataset xuất hiện phía trên canvas để bạn chuyển qua lại; nếu một trang được nhiều project phục vụ, một bộ chọn project cũng xuất hiện.

## Duyệt graph

- **Graph / Table toggle**: chuyển giữa sơ đồ trực quan và một bảng có thể sắp xếp của cùng các node và edge đó.
- **Category filter**: các tab nhóm node và hiện số lượng cho mỗi nhóm (đồ thị status-flow nhóm theo kiểu đối tượng; đồ thị screen nhóm theo segment đường dẫn đầu tiên của `urlGlob` mỗi screen). Chọn một tab sẽ ẩn mọi thứ ngoài category đó.
- **Search**: gõ để làm nổi bật các nhãn node khớp theo thời gian thực. Search chỉ làm nổi bật - không ẩn gì cả (kết hợp với category filter để thu hẹp trước).
- **Focus**: click một node để làm mờ mọi thứ trừ nó và các node/edge kết nối trực tiếp. Click lại, hoặc click vùng trống, để bỏ focus.
- **Pan và zoom**: kéo canvas để pan; cuộn để zoom.

Các control này kết hợp tự do, nên bạn có thể lọc về một category, search trong đó, và focus một node cụ thể cùng lúc - hữu ích với một graph có hàng trăm node.

## Click-to-highlight

Click một node hoặc edge mang `specId` sẽ nhảy về tab mà graph view đã mở từ đó: nếu spec đó đang khớp trên tab đó, phần tử của nó sẽ cuộn vào tầm nhìn và nháy sáng, dùng đúng cơ chế highlight như một deep link hay phím tắt cycle.

Nếu spec không khớp trên tab đó (bạn đang ở sai trang, hoặc phần tử không có ở đó), một gợi ý xuất hiện nêu tên screen hoặc trang nó thuộc về, thay vì không làm gì cả. Node và edge không mang `specId` - một trạng thái thuần túy như "Won", hoặc một điều hướng không có phần tử riêng lẻ kích hoạt nó - vẫn render bình thường nhưng không có gì để nhảy tới.

:::tip
Hãy gán `specId` cho một state hay transition bất cứ khi nào có một phần tử UI thật đại diện cho nó (một badge trạng thái, một nút submit) để graph và trang đang chạy luôn gắn kết với nhau. Các node thuần khái niệm (như một trạng thái terminal không có phần tử riêng) có thể an tâm để trống `specId`.
:::

## Tự động ghi lại screen transition

Thay vì soạn tay từng entry trong `screens.json`, bạn có thể bật một recorder tự chọn tham gia (opt-in) quan sát chính việc điều hướng của bạn và đề xuất các screen transition mới để bạn duyệt.

:::caution
Mặc định tắt. Hãy đọc những gì được ghi lại trước khi bật.
:::

**Bật nó.** Mở trang Options của extension -> **Tự động ghi**, đọc tuyên bố riêng tư trên thẻ đó, rồi tick **Ghi lại điều hướng trên thiết bị này**. Một chỉ báo **Đang ghi điều hướng** nhấp nháy hiện ra ngay cạnh checkbox với công tắc tắt chỉ một click; graph view hiện cùng chỉ báo đó trong một banner, với các hành động **Tắt** và **Xóa tất cả đã ghi** (cho project đang chọn) riêng.

**Những gì được ghi lại.** Chỉ dạng đường dẫn màn hình đã tổng quát hóa cho mỗi trang (ví dụ `/orders/**`, không bao giờ là `/orders/1938`) và lượt điều hướng giữa hai màn hình như vậy. Không bao giờ ghi lại: query string, hash, hay nội dung trang. Các đoạn path trông giống id sẽ được tổng quát hóa thành `**` trước khi lưu - hãy xem lại từng transition trước khi Duyệt. Không có gì chạm tới `.specs/` tại thời điểm ghi hình - mỗi transition quan sát được rơi vào một bộ đệm nháp cục bộ theo từng project (có giới hạn, `storage.local`, không bao giờ tải lên) và vẫn chỉ là đề xuất.

**Xem xét và duyệt.** Khi đang ghi, hãy duyệt trang web rồi mở dataset **Screens** của graph view: các screen/transition mới quan sát được render dưới dạng node/edge "ghost" nét đứt, trong suốt, xen giữa các node/edge đã lưu. Click vào một ghost edge để **Duyệt** (gộp nó vào `screens.json` với `"source": "auto-captured"`, không bao giờ ghi đè lên một entry manual/imported đã có cùng id) hoặc **Bỏ qua** (xóa nó, không ghi gì vào `.specs/` ở cả hai trường hợp). Banner cũng báo cho bạn biết khi đang ghi nhưng chưa ghi được gì, và khi bộ đệm nháp của một project đã đầy.

:::note
Chuỗi riêng tư đầy đủ: tự chọn tham gia, mặc định **tắt** -> chỉ suy ra dạng URL đã tổng quát hóa (bỏ query/hash, các đoạn path trông giống id được tổng quát hóa thành `**`) -> bộ đệm nháp cục bộ theo từng thiết bị, không bao giờ tự động ghi -> cần bạn Duyệt rõ ràng trước khi bất cứ thứ gì chạm tới `.specs/`. Không có gì ghi lại được rời khỏi máy của bạn.
:::
