# Tinh chỉnh (tuning) scorer khớp phần tử

**Dành cho ai:** contributor làm việc với bộ khớp trong
`packages/fingerprint-core`. Người dùng cuối không cần trang này. Nếu bạn chỉ
muốn biết thẻ "Matching corpus" trong extension làm gì, xem
[run-guide.md](./run-guide.md).

## Giải thích đơn giản

Khi Specpin gắn một spec vào phần tử trên trang, trước hết nó tìm dấu hiệu chắc
chắn (test id, `id`, hay CSS selector duy nhất). Nếu không có cái nào, một
**scorer** sẽ so phần tử nó nhớ với các phần tử hiện có trên trang và chọn cái
giống nhất, nhưng chỉ khi cái đó rõ ràng vượt trội. Khi không có gì đủ giống, nó
im lặng và đánh dấu spec "mất liên kết" thay vì đoán sai.

**Corpus** giống như cuốn sổ ghi lại các ca khó này, chỉ lưu trên máy bạn và chỉ
khi bạn bật tính năng lên. Nó có hai loại ghi chú:

- **Re-pin** - bạn tự tìm ra phần tử đã dời và gắn lại spec. Ghi chú này chứa
  **đáp án đúng** (phần tử cũ -> phần tử mới đúng).
- **Auto-capture** - scorer không chắc lúc khớp nên lưu lại những gì nó thấy. Ghi
  chú này **không có đáp án xác nhận**, chỉ là ảnh chụp.

## Quy tắc duy nhất trước khi tune

**Chỉ tune được bằng ghi chú Re-pin.** Đó là loại duy nhất có đáp án đúng, nên là
loại duy nhất cho biết một thay đổi có tốt lên hay không. Chỉ mình Auto-capture
thì không tune được gì (không có gì để đối chiếu).

Vậy nên nếu export corpus mà toàn Auto-capture, tool sẽ báo là không có gì để
làm. Hãy re-pin vài spec mất liên kết trước (mở trang, gắn spec vào đúng phần tử), rồi
export lại.

## Từng bước

1. Trong Options của extension, bật thẻ **Matching corpus**.
2. Dùng app như bình thường. Khi spec bị mất liên kết sau một thay đổi giao diện, hãy
   **re-pin** chúng (hoặc bấm **Correct** trên một match độ tin cậy thấp để xác
   nhận). Mỗi lần như vậy ghi một note Re-pin.
3. Trong Options, bấm **Export corpus (JSON)** và lưu file.
4. Từ thư mục gốc repo, chạy tool trên file đó:

   ```bash
   pnpm --filter @specpin/fingerprint-core tune ~/Downloads/specpin-drift-corpus.json
   ```

5. Đọc kết quả (mục dưới).
6. Nếu thấy đáng đổi, sửa `WEIGHTS` và/hoặc `THRESHOLDS` trong
   `packages/fingerprint-core/src/score.ts`, rồi chạy lại test:

   ```bash
   pnpm --filter @specpin/fingerprint-core test
   ```

## Đọc kết quả

Báo cáo có ba phần.

### Ghi chú Re-pin (loại có đáp án đúng)

```
== Supervised pairs (ground truth old -> new) ==
count 12 (confirmed 3) · mean score 0.78
tiers: HIGH 7 (58%) · MID 3 (25%) · below 2 (17%)
per-signal mean similarity across re-pin corrections (higher = signal survived):
  textContent   0.91
  nearbyLabels  0.74
  attributes    0.88
  tagName       1.00
  domPath       0.34
  positionHint  0.62
```

- **count / confirmed** - bao nhiêu note Re-pin, và bao nhiêu chỉ là xác nhận
  "Correct" (phần tử không thực sự dời đi).
- **mean score** - trung bình scorer nhận ra đúng phần tử mới tốt đến đâu. Càng
  cao càng tốt; gần 1 nghĩa là "nhận ra dễ dàng".
- **tiers** - trong số các đáp án đúng đó, bao nhiêu cái scorer sẽ nhận tự tin
  (**HIGH**), nhận nhưng gắn cờ cần xem lại (**MID**), hay bỏ lỡ hẳn (**below**).
  Bạn muốn phần lớn ở HIGH và ít ở "below".
- **per-signal similarity** - đây là phần hữu ích. Mỗi dòng là một manh mối scorer
  dùng. Con số là mức manh mối đó giữ nguyên qua các thay đổi giao diện thật. Số
  **cao** nghĩa là manh mối đáng tin, nên tăng weight; số **thấp** nghĩa là nó vỡ
  khi refactor và gây nhiễu. Trong ví dụ, `domPath` (vị trí phần tử trong cây HTML)
  chỉ được 0.34, tức cấu trúc thay đổi nhiều, nên giảm weight của manh mối đó; còn
  `textContent` và `attributes` thì ổn định.

### Ghi chú Auto-capture (loại không có đáp án)

```
== Passive candidate sets (weak labels) ==
count 45 (with candidates 38)
top candidate score: mean 0.52 · reaches MID(0.6): 9/38
top-vs-runner-up margin: mean 0.31
would render 6/38 · abstain: no content signal 4 · top below MID 27 · near-tie (< DELTA 0.1) 1
```

- **count / with candidates** - bao nhiêu ảnh chụp, và bao nhiêu cái có ít nhất
  một phần tử để so (số còn lại không tìm được gì để so, tức ngõ cụt hoàn toàn).
- **top candidate score** - trung bình phần tử giống nhất tốt đến đâu, và bao
  nhiêu lần vượt mốc **MID** (0.6) cần để hiển thị.
- **would render / abstain** - scorer sẽ hiện match hay im lặng, và **vì sao** im
  lặng:
  - **no content signal** - phần tử không có text/nhãn/thuộc tính để đánh giá, nên
    scorer từ chối theo nguyên tắc (chỉ dựa cấu trúc thì quá rủi ro).
  - **top below MID** - cái giống nhất vẫn chưa đủ tốt (dưới 0.6).
  - **near-tie** - hai ứng viên quá sát nhau nên không dám chọn.

Nếu gần như tất cả rơi vào "top below MID", scorer đang rất dè dặt với dữ liệu của
bạn: nó thấy phần tử đã dời nhưng không tin cái nào đủ. Đó là gợi ý (chưa phải bằng
chứng) rằng ngưỡng hoặc weight có thể đang quá chặt. Muốn chắc, hãy re-pin các spec
đó để chúng thành note Re-pin có đáp án thật.

### Gợi ý weight

```
== Weight suggestion (coordinate ascent) ==
current   J 0.31  { textContent 0.30, ... }
suggested J 0.44  { textContent 0.55, ... }
```

Tool thử nhiều tổ hợp weight và gợi ý bộ weight giúp phân biệt đáp án đúng với sai
tốt hơn (**J** cao hơn). Hãy coi đây là **ý tưởng khởi đầu, không phải đáp án cuối
cùng** vì nó dựng trên dữ liệu ít ỏi và một phần chưa được xác nhận. Nên cân nhắc
cùng bảng per-signal ở trên và phán đoán của bạn.

## Ý nghĩa các tham số điều chỉnh

Trong `score.ts`:

- **`WEIGHTS`** - mỗi manh mối đáng bao nhiêu. Chỉ tỉ lệ giữa chúng quan trọng,
  không phải con số tuyệt đối. Tăng manh mối sống sót qua refactor (per-signal cao),
  giảm cái dễ vỡ.
- **`THRESHOLDS`**:
  - **HIGH** (0.85) - điểm cần để hiện match một cách tự tin.
  - **MID** (0.6) - điểm tối thiểu để hiện match (dưới mức này = không match).
  - **DELTA** (0.1) - cái giống nhất phải hơn cái nhì bao nhiêu mới thắng. Tránh
    đoán bừa giữa hai phần tử giống nhau.

## Lưu ý

- Hạ **MID** làm scorer match nhiều hơn, nhưng cũng để lọt nhiều match **sai** hơn.
  Specpin cố ý dè dặt ở đây; chỉ nới khi có bằng chứng từ note Re-pin.
- Đừng áp dụng weight gợi ý một cách mù quáng. Đổi một thứ, chạy lại test, và kiểm
  tra lại với `score.test.ts`.
- Corpus chỉ lưu fingerprint (không có HTML trang), email và số dài đã bị che. Nó
  không rời khỏi máy trừ khi bạn export.
