# FEATURE-097 — Quét QR bàn có nhóm: tự vào nhóm của bàn

> **Nguồn:** chủ dự án — "bạn bỏ cái cá nhân với gộp bàn rồi bạn xem tích hợp sao" → duyệt phương án: "okay" (17/11/2026). Quyết định: [ADR-059](../quyết-định/ADR-059-tu-vao-nhom-cua-ban.md) D-238, D-239. Thay phần "chọn Gộp chung / Cá nhân" của [F-001](FEATURE-001.md); dùng [F-026](FEATURE-026.md) chia bill, [F-058](FEATURE-058.md) tách hóa đơn, [F-086](FEATURE-086.md) đổi bàn khi quét, [F-092](FEATURE-092.md) màn chào.

- **Status:** CONFIRMED (ADR-059) · Triển khai: [TASK-118](../công-việc/TASK-118.md)
- **Cập nhật 18/11/2026 — [ADR-065](../quyết-định/ADR-065-di-rieng-hoa-don-rieng.md) D-255 ([TASK-127](../công-việc/TASK-127.md)):** vừa tự vào nhóm → dòng "Bạn đã vào nhóm của Bàn …" kèm nút **"Tôi đi riêng — hóa đơn riêng"** (khách lạ ngồi ghép bàn) tới khi điện thoại này gửi món; màn chọn nhóm có thêm nút này.
- **Cập nhật 19/11/2026 — ADR-065 D-256 ([TASK-128](../công-việc/TASK-128.md)):** chủ dự án "khó thấy quá… làm lại sao cho nó đơn giản khách dễ thấy và thao tác" → dòng nhỏ đổi thành **thẻ nổi bật** "Bàn … đang có khách — **Bạn đi chung hay đi riêng?**" với hai nút lớn ngang nhau **Đi chung** / **Đi riêng** (quy tắc 5).
- **Actor:** **ACT-GUEST / ACT-MEMBER** (điện thoại khách).
- **Màn hình:** **SCR-01** `/t/{qrToken}` (vào bàn, màn chọn nhóm khi bàn có ≥ 2 nhóm, màn đổi bàn F-086, màn chào), **SCR-05** Theo dõi đơn (`?act=split` mở Chia bill).
- **Dữ liệu / API:** (ADR-065) `POST /api/sessions/{id}/separate`; `SessionClients.OrderedAt` (migration 0063).

## User Story

- **US-097-1:** Là khách, khi quét QR ở bàn bạn bè đã gọi món, tôi muốn vào thẳng nhóm của bàn mà không phải chọn "gộp" hay "cá nhân", và nếu cần trả riêng thì chia bill theo người, để gọi món nhanh và không nhầm hóa đơn.

## Quy tắc

1. Bàn trống → mở nhóm mới (như cũ). Bàn có **1 nhóm** → tự vào nhóm đó, thấy thẻ "Bàn … đang có khách — Bạn đi chung hay đi riêng?" (quy tắc 5). Bàn có **≥ 2 nhóm** → hỏi "Bạn đi cùng nhóm nào?" (mỗi nhóm một nút "Vào nhóm này"). Không có nút "Tạo đơn cá nhân"; thay vào đó (ADR-065) là nút "Đi riêng" trên thẻ / "Đi riêng — hóa đơn riêng" cuối màn chọn nhóm.
2. Nhóm vừa thanh toán / đóng lúc đang vào → mở nhóm mới và báo (BR-008).
3. Điện thoại có nhóm ở bàn khác (F-086): "Chuyển sang Bàn …" / "Nhờ quầy chuyển…" như cũ; "Gọi món ở Bàn …" → vào nhóm của bàn mới (hoặc mở nhóm mới nếu trống), nhóm cũ giữ nguyên.
4. Trả riêng: "Chia bill theo người" ở Theo dõi đơn; màn chào có dòng "Trả riêng từng người? Chia bill theo người" khi nhóm đã có món (mở thẳng hộp chia bill). Quầy giữ "Tách hóa đơn", "Thu chung với bàn khác".
5. **Đi chung hay đi riêng (ADR-065 D-255, D-256):** vừa **tự** vào nhóm của bàn → thẻ nổi bật ở màn chào và đầu thực đơn: "**Bàn … đang có khách**" / "Bạn đi chung hay đi riêng?" với hai nút lớn ngang nhau:
   - **Đi chung** (chung một hóa đơn) → thẻ mất, báo "Bạn đi chung với nhóm ở Bàn … — gọi món chung một hóa đơn.";
   - **Đi riêng** (hóa đơn riêng) → rời nhóm (không còn xem món / hóa đơn nhóm đó), nhóm riêng ở cùng bàn, giỏ đi theo; báo "Bạn đã có hóa đơn riêng — món bạn gọi tính riêng.".

   Không bắt chọn: gọi món luôn = đi chung, thẻ mất khi điện thoại gửi món đầu tiên trong nhóm. Khách tự bấm "Vào nhóm này" ở màn chọn nhóm thì không hỏi lại. Máy chủ chỉ cho đi riêng khi điện thoại chưa gửi món trong nhóm (`409 ALREADY_ORDERED`).

## Acceptance Criteria

- AC-097-01: Bàn NB1 có nhóm (đã gửi món) → điện thoại khác quét QR → vào thẳng thực đơn, thấy thẻ "Bàn NB1 đang có khách — Bạn đi chung hay đi riêng?" (TASK-128), không có nút "Tạo đơn cá nhân"; Theo dõi đơn thấy món của nhóm; bàn vẫn chỉ 1 nhóm.
- AC-097-02: Bàn NB2 có 2 nhóm → điện thoại mới thấy "Bàn đang có 2 nhóm. Bạn đi cùng nhóm nào?" với 2 nút "Vào nhóm này", không có "Tạo đơn cá nhân"; chọn → vào thực đơn, bàn không thêm nhóm.
- AC-097-03: Điện thoại có nhóm ở NB1 (đã gửi món) quét NB3 đang có nhóm → màn "Bạn đã chuyển sang Bàn NB3?" → "Gọi món ở Bàn NB3" → vào nhóm của NB3 (thực đơn ghi Bàn NB3), NB1 và NB3 mỗi bàn vẫn 1 nhóm.
- AC-097-04: Màn chào bật, nhóm đã có món → dòng "Trả riêng từng người? Chia bill theo người" → trang Theo dõi đơn mở sẵn hộp "Chia bill theo người".
- AC-097-05: (ADR-065) Khách đã tự vào nhóm bấm đi riêng (`POST /api/sessions/{id}/separate`) → nhóm mới ở cùng bàn, điện thoại không còn xem nhóm cũ (`403`), quét lại vào nhóm riêng, quầy nhận `session.opened` và thấy bàn có 2 nhóm; món gọi sau đó vào hóa đơn riêng, nhóm cũ giữ nguyên.
- AC-097-06: (ADR-065) Điện thoại đã gửi món trong nhóm → `409 ALREADY_ORDERED` (vẫn ở nhóm, không mở thêm nhóm); không ở nhóm → `403 NOT_IN_GROUP`; mã bàn khác → `404`; nhóm đã đóng → `409 SESSION_CLOSED`.
- AC-097-07: (ADR-065 D-255, D-256, E2E) Bàn có nhóm → điện thoại khác thấy thẻ "Bàn … đang có khách — Bạn đi chung hay đi riêng?" với hai nút "Đi chung" / "Đi riêng"; bạn trong nhóm gọi món luôn (không chọn) → gửi món xong thẻ mất; bấm "Đi chung" → thẻ mất, báo đi chung, bàn vẫn 1 nhóm; khách lạ chọn món rồi bấm "Đi riêng" → nhóm riêng (bàn 2 nhóm), giỏ giữ nguyên, gửi món chỉ thấy món của mình; bàn 2 nhóm → màn chọn nhóm có nút "Đi riêng — hóa đơn riêng", tự chọn nhóm thì không hỏi lại. Thẻ đạt kiểm tra khả năng tiếp cận (nhãn, tương phản, vùng chạm, không cuộn ngang 320 / 390 px), cả giao diện tối.

## Bằng chứng

- E2E: `kiểm-thử/e2e/flow.spec.js` bài "vào nhóm của bàn…" (AC-097-01…04); `kiểm-thử/e2e/a11y.spec.js` bài "khách (điện thoại)…" quét màn chọn nhóm khi bàn có 2 nhóm (AC-097-02) và thẻ "Bạn đi chung hay đi riêng?" đầu thực đơn, bài "khách giao diện tối…" quét thẻ trên màn chào tối (AC-097-07).
