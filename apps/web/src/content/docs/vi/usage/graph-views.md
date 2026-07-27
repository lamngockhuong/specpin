---
title: Graph views
description: Soạn sơ đồ status-flow và screen-transition rồi xem chúng trong một graph view toàn trang.
---

Hai file `.specs/` tùy chọn được render thành sơ đồ trong một **graph view** toàn trang riêng: một đồ thị **status-flow** (trạng thái của một đối tượng di chuyển giữa các state ra sao) và một đồ thị **screen-transition** (screen nào điều hướng tới screen nào, qua hành động gì). Cả hai đều được soạn tay trong `.specs/` cùng với các spec của bạn.

:::note
Graph views render dữ liệu từ `.specs/flows.json` và `.specs/screens.json`. Hãy soạn trực tiếp dưới dạng JSON (xem [Spec format](/vi/sidecar/spec-format/) để biết mô hình soạn `.specs/` nói chung, và [`flows.json`/`screens.json` trên GitHub](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md#flowsconfig-specsflowsjson) để biết định dạng chính xác từng trường) - hoặc sửa node/transition trực tiếp ngay trong graph view, không cần chỉnh tay JSON chút nào; xem [Chỉnh sửa flows/screens ngay trong trình duyệt](#chỉnh-sửa-flowsscreens-ngay-trong-trình-duyệt) bên dưới. Các transition trong `screens.json` cũng có thể được lấp đầy bằng cách bật auto-capture và duyệt những gì nó quan sát được - xem [Tự động ghi lại screen transition](#tự-động-ghi-lại-screen-transition).
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

Click **Open graph view** trong menu **⋯ More actions** ở header của popup hoặc side panel. Nó mở trong một tab trình duyệt mới. Nếu một trang được nhiều project phục vụ, một bộ chọn project xuất hiện phía trên canvas; bộ chọn dataset status-flow / Screens luôn hiển thị ngay khi đã chọn project, bất kể cả hai dataset đã có dữ liệu hay chưa - nên một dataset trống vẫn tới được (ví dụ dataset Screens để duyệt auto-capture, hoặc dataset status-flow để soạn flow đầu tiên của bạn). Nó mặc định chọn dataset nào không rỗng cho tiện. Lựa chọn project/dataset của bạn được ghi nhớ qua mỗi lần tải lại (và khi mở lại tab graph), nên F5 sẽ đưa bạn về đúng khung nhìn cũ thay vì reset về project đầu tiên.

## Duyệt graph

- **Graph / Table toggle**: chuyển giữa sơ đồ trực quan và một bảng có thể sắp xếp của cùng các node và edge đó.
- **Thanh công cụ trên đồ thị** (nổi ở góc trên-trái canvas): các nút thao tác trực tiếp lên sơ đồ - nút chọn hướng layout **Horizontal** / **Vertical** (trái-phải hoặc trên-dưới, tùy hướng nào dễ đọc) và các nút zoom (**phóng to** / **thu nhỏ** / **vừa khung nhìn**).
- **Category filter**: các tab nhóm node và hiện số lượng cho mỗi nhóm (đồ thị status-flow nhóm theo kiểu đối tượng; đồ thị screen nhóm theo segment đường dẫn đầu tiên của `urlGlob` mỗi screen). Chọn một tab sẽ ẩn mọi thứ ngoài category đó.
- **Search**: gõ để làm nổi bật các nhãn node khớp theo thời gian thực. Search chỉ làm nổi bật - không ẩn gì cả (kết hợp với category filter để thu hẹp trước).
- **Focus**: click một node để làm mờ mọi thứ trừ nó và các node/edge kết nối trực tiếp. Click lại, hoặc click vùng trống, để bỏ focus.
- **Pan và zoom**: kéo canvas để pan; cuộn để zoom (hoặc dùng các nút zoom trên thanh công cụ của đồ thị).
- **Thu gọn thanh công cụ**: nút mũi tên ở mép phải header gấp toàn bộ khối control phía trên - hàng control (view toggle, category tabs, search), banner recording, và (khi ở edit mode) thanh edit - để nhường hết chiều cao cho sơ đồ; bấm lần nữa để khôi phục. Khi đang thu, cảnh báo recording và các nút Turn off / Save của nó bị ẩn cho tới khi mở lại.

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

**Bật nó.** Tự động ghi bật **theo từng project**, không phải cho cả thiết bị, nên một project đã ổn định thì không cần tiếp tục ghi. Hãy bật cho một project cụ thể ngay tại dòng của nó trên trang Options (mỗi dòng project có công tắc **Ghi** bên cạnh công tắc bật/tắt), hoặc từ graph view khi đang xem xét project đó (nút **Bật** trên banner ghi hình). Một project chỉ ghi **trên những trang mà nó phục vụ** - điều hướng trên các trang khác bị bỏ qua và không bao giờ được lưu. Pane **Hỗ trợ** của trang Options có một mục **FAQ** giải thích cam kết riêng tư của tự động ghi; graph view hiển thị banner ghi hình theo từng project với các hành động **Bật**/**Tắt** và **Xóa tất cả đã ghi** (cho project đang chọn).

**Những gì được ghi lại.** Chỉ dạng đường dẫn màn hình đã tổng quát hóa cho mỗi trang (ví dụ `/orders/**`, không bao giờ là `/orders/1938`) và lượt điều hướng giữa hai màn hình như vậy. Không bao giờ ghi lại: query string, hash, hay nội dung trang. Các đoạn path trông giống id sẽ được tổng quát hóa thành `**` trước khi lưu - hãy xem lại từng transition trước khi Duyệt. Không có gì chạm tới `.specs/` tại thời điểm ghi hình - mỗi transition quan sát được rơi vào một bộ đệm nháp cục bộ theo từng project (có giới hạn, `storage.local`, không bao giờ tải lên) và vẫn chỉ là đề xuất.

**Xem xét và duyệt.** Khi đang ghi, hãy duyệt trang web rồi mở dataset **Screens** của graph view: các screen/transition mới quan sát được render dưới dạng node/edge "ghost" nét đứt, trong suốt, xen giữa các node/edge đã lưu. Click vào một ghost edge để **Duyệt** (gộp nó vào `screens.json` với `"source": "auto-captured"`, không bao giờ ghi đè lên một entry manual/imported đã có cùng id) hoặc **Bỏ qua** (xóa nó, không ghi gì vào `.specs/` ở cả hai trường hợp). Banner cũng báo cho bạn biết khi đang ghi nhưng chưa ghi được gì, và khi bộ đệm nháp của một project đã đầy.

**Bỏ qua các route gây nhiễu.** Điều hướng qua menu, sidebar và các trang tiện ích (ví dụ `/settings`, `/help`) có thể làm phần xem xét ngập ghost edge mà bạn không hề muốn đưa vào flow. Panel xem xét của mỗi ghost edge có hành động **Bỏ qua route**: nó thêm URL glob của màn hình đích vào danh sách bỏ qua của project đó và xóa mọi edge nháp đang nằm trên route ấy, để recorder ngừng ghi lại nó. Quản lý danh sách này ngay tại dòng của project trên trang Options - một trình sửa **Route bỏ qua** hiện ra dưới một project đang ghi, nơi bạn thêm một glob (cùng cú pháp `/settings/**` như glob phạm vi trang) hoặc xóa một glob để ghi lại route đó. Một transition bị loại khi **một trong hai** đầu khớp một glob, nên một màn hình bị bỏ qua sẽ rời khỏi flow hoàn toàn.

:::note
Chuỗi riêng tư đầy đủ: tự chọn tham gia, mặc định **tắt** -> chỉ suy ra dạng URL đã tổng quát hóa (bỏ query/hash, các đoạn path trông giống id được tổng quát hóa thành `**`) -> bộ đệm nháp cục bộ theo từng thiết bị, không bao giờ tự động ghi -> cần bạn Duyệt rõ ràng trước khi bất cứ thứ gì chạm tới `.specs/`. Không có gì ghi lại được rời khỏi máy của bạn.
:::

## Chỉnh sửa flows/screens ngay trong trình duyệt

Graph view không chỉ là một sơ đồ để xem - hãy bật **Edit mode** để thêm, sửa, xóa node và transition trực tiếp trên canvas, không cần chỉnh tay JSON chút nào.

**Bật nó.** Click **Edit mode** trên thanh điều khiển của graph view. Một thanh edit riêng mở ra bên dưới hàng điều khiển, gồm toolbar (**Add node**, **Add edge**, **Delete selected**, **Undo**, **Save**), một dòng hướng dẫn và một dòng trạng thái cập nhật trực tiếp. Mỗi nút chỉ bật khi đủ điều kiện - **Add edge** đợi chọn hai node, **Delete selected** đợi chọn đúng một node hoặc edge, còn **Undo**/**Save** đợi khi có thay đổi chưa lưu - nên nút bị làm mờ cho biết hành động đó còn thiếu gì. Giờ click vào một node hoặc edge sẽ chọn nó để chỉnh sửa thay vì điều hướng hay click-to-highlight. Các transition **ghost** (tự động ghi, đang chờ) vẫn hiển thị trên sơ đồ Screens ngay cả trong edit mode - chúng không biến mất khi bạn bật Edit - và click vào một ghost vẫn mở bảng **Duyệt / Bỏ qua** của nó chứ không phải form sửa, nên một bản ghi vẫn duyệt được trong lúc bạn đang sửa.

**Thêm node.** Click **Add node** rồi điền vào form bên cạnh: tên/nhãn theo từng ngôn ngữ (thêm một dòng cho mỗi locale), `urlGlob` (screens) hoặc `kind` (state của flows: initial/normal/terminal), và một spec liên kết tùy chọn chọn từ danh sách spec đã biết của project. **Create** thêm nó vào bản nháp. Ở dataset status-flow, một node mới thuộc về flow đang active - dùng các nút điều khiển flow để tạo một flow trước nếu project chưa có flow nào.

**Sửa một node hoặc edge.** Click vào một cái đã có để mở đúng form đó, đã điền sẵn dữ liệu. Mọi thay đổi hợp lệ áp dụng vào bản nháp trong bộ nhớ ngay lập tức; **Save** vẫn là bước lưu bản nháp xuống `.specs/`. Một transition đến từ code-import (chỉ ở dataset status-flow) hiện ở đây dạng chỉ đọc - hãy đổi nó bằng cách chạy lại import thay vào đó. Một edge điều hướng auto-captured (dataset Screens) thì sửa được trực tiếp: sửa bất kỳ trường nào của nó sẽ chuyển nó sang manual khi Save, nên sau đó auto-capture không còn quản lý nó nữa.

**Sửa nhiều flow cùng lúc (chỉ status-flow).** Một `flows.json` có thể chứa nhiều flow độc lập, cùng vẽ trên một canvas, nhưng tại một thời điểm chỉ có một flow đang *active* để sửa - các flow còn lại hiện ở dạng chỉ đọc. Khi có từ hai flow trở lên, một **bộ chọn flow** xuất hiện trong thanh edit: chọn flow cần sửa từ đó, hoặc chỉ cần click vào node hay edge của một flow khác thì việc sửa tự chuyển sang flow đó. Nếu flow hiện tại còn thay đổi chưa lưu, việc chuyển sẽ hỏi bạn lưu hay bỏ trước.

**Thêm edge.** Click hai node theo đúng thứ tự (from rồi to) để chọn chúng, sau đó **Add edge** để mở form nhập nhãn trigger cùng guard/role/spec liên kết tùy chọn.

**Xóa.** Chọn đúng một node hoặc edge, rồi **Delete selected**. Ở dataset status-flow, một node còn bị một edge imported tham chiếu sẽ từ chối xóa - hãy xử lý điều đó qua code-import trước (một edge thêm tay sẽ tự động xóa theo cùng node). Ở dataset Screens, xóa một edge auto-captured, hoặc một screen mà nó trỏ tới, đều được cho phép trực tiếp - edge sẽ chuyển sang manual khi Save thay vì bị chặn xóa. Xóa một screen mà một spec sheet của specshot vẫn tham chiếu vẫn được cho phép ở đây bất kể; việc kiểm tra điều đó diễn ra lúc Save (bên dưới).

**Undo.** **Undo** hoàn tác đúng một thay đổi gần nhất - một bước, không phải cả lịch sử. Dùng nó ngay sau một sai sót, trước khi thực hiện chỉnh sửa khác.

**Save, và kiểm tra shot mồ côi.** **Save** lưu toàn bộ bản nháp: đã xác thực và gộp bảo toàn provenance hệt như luồng Duyệt của auto-capture ở trên - chỉnh sửa của bạn không bao giờ ghi đè lên một entry từ nguồn khác, và ngược lại. Nếu phiên chỉnh sửa này đã xóa một screen mà một spec sheet vẫn tham chiếu, Save sẽ hỏi xác nhận trước, nêu rõ có bao nhiêu sẽ trở thành mồ côi (hoặc một cảnh báo chung khi không thể kiểm tra được) - Cancel để xem lại, hoặc tiếp tục lưu.

**Rời đi khi còn thay đổi chưa lưu.** Tắt Edit mode, chuyển project, đổi flow đang sửa, hoặc chuyển dataset flows/screens khi bản nháp còn thay đổi chưa lưu sẽ hỏi bạn lưu hay bỏ trước; một bản nháp sạch không bao giờ hỏi. Đóng hay tải lại tab khi còn chỉnh sửa chưa lưu cũng kích hoạt cảnh báo rời trang mặc định của trình duyệt.

:::note
Trình biên tập chỉ ghi vào `.specs/flows.json` và `.specs/screens.json`, qua đúng luồng đọc-gộp-xác thực-ghi mà mọi bộ ghi khác ở đây dùng - không schema mới, không bề mặt ghi mới.
:::
