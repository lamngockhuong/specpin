---
title: Graph views
description: Soạn sơ đồ status-flow và screen-transition rồi xem chúng trong một graph view toàn trang.
---

Hai file `.specs/` tùy chọn được render thành sơ đồ trong một **graph view** toàn trang riêng: một đồ thị **status-flow** (trạng thái của một đối tượng di chuyển giữa các state ra sao) và một đồ thị **screen-transition** (screen nào điều hướng tới screen nào, qua hành động gì). Cả hai đều được soạn tay trong `.specs/` cùng với các spec của bạn.

:::note
Graph views là một **sơ đồ chỉ-đọc** dựa trên dữ liệu bạn soạn trong `.specs/flows.json` và `.specs/screens.json`. Hiện chưa có editor trong extension cho chúng - hãy sửa trực tiếp file JSON (xem [Spec format](/vi/sidecar/spec-format/) để biết mô hình soạn `.specs/` nói chung, và [`flows.json`/`screens.json` trên GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md#flowsconfig-specsflowsjson) để biết định dạng chính xác từng trường).
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
