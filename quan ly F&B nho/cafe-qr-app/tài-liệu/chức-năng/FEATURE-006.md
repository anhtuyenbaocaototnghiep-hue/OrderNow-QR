# FEATURE-006 — Thu tiền mặt tại bàn, in hóa đơn, đóng phiên (quầy) — D-2

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — tiền thừa, phiếu tạm tính, `expectedAmountDue`, đóng bàn khi chỉ còn đơn hủy (Q-018) theo ADR-003. Đã triển khai 14/10/2026
- **Source:** Quyết định D-2; US7 (in hóa đơn); Module 2.3
- **Actor:** STAFF, ADMIN
- **Điều kiện trước:** Phiên `OPEN` hoặc `PAYMENT_REQUESTED`; không còn đơn `PENDING` (BR-019).
- **Luồng**
  1. Trên POS, thẻ "Gọi thanh toán" (hoặc chọn bàn bất kỳ ở danh sách bàn đang phục vụ) → mở drawer **Thu tiền bàn** (S-14): danh sách đơn của phiên, tổng phải thu, ô "Tiền khách đưa", tự tính tiền thừa, nút **"In tạm tính"** (BR-014) và nút **"Đã thu tiền & In bill"**.
  2. Nhân viên ra bàn thu tiền mặt (có thể mang phiếu tạm tính), quay lại bấm "Đã thu tiền & In bill" (hoặc bấm ngay trên tablet cầm tay).
  3. `POST /api/sessions/{id}/settle { amountReceived }` → `sp_SettleSession`: khóa phiên; kiểm còn đơn `PENDING` → 409; `UPDATE Sessions SET Status='CLOSED' WHERE SessionId=@id AND Status IN ('OPEN','PAYMENT_REQUESTED')` (`@@ROWCOUNT = 0` → 409 đã thu); mọi đơn không hủy → `PaymentStatus = PAID`, `PaidAt`, `PaymentMethod = CASH`; insert `Payments(SessionId, CASH, AmountDue, AmountReceived, ChangeGiven, ReceivedBy)`; commit.
  4. Phát `session.settled` tới `staff` + `session:{id}`; POS mở trang in hóa đơn phiên (S-12); thẻ bàn biến mất khỏi danh sách đang phục vụ.
- **Lỗi và biên**
  - Hai máy cùng bấm "Đã thu tiền" → máy sau `409 ALREADY_SETTLED` "Phiên này đã được thu tiền".
  - `amountReceived < amountDue` → 400 `INSUFFICIENT_AMOUNT` (không hỗ trợ trả thiếu/nợ trong MVP — PROPOSED).
  - Còn đơn `PENDING` → `409 HAS_PENDING_ORDERS` kèm danh sách; POS gợi ý Tiếp nhận hoặc Hủy từng đơn.
  - Phiên có đơn `PREPARING` chưa xong → vẫn cho thu (khách trả trước khi nhận đồ); đơn sau đó vẫn hoàn tất và trừ kho bình thường.
  - Phiên không có đơn nào khác `CANCELLED` (khách bỏ đi, hoặc mọi đơn đã hủy — Q-018 / ADR-003; bản gốc ghi "không có đơn nào") → nút "Đóng bàn trống" riêng: `POST /api/sessions/{id}/close` → `CLOSED` không tạo `Payments`; còn đơn chưa hủy → `409 HAS_ORDERS` _(cập nhật 20/10/2026 theo Q-018 / ADR-003, `sp_CloseEmptySession` — TASK-057)_.
  - In: trang `/pos/sessions/{id}/receipt` dùng `@media print`, `@page { size: 80mm auto; margin: 0 }`; in lại bao nhiêu lần cũng được; bản tạm tính có watermark "TẠM TÍNH".
- **Acceptance Criteria**
  - AC-006-01: Phiên 2 đơn tổng 125.000đ, nhập tiền đưa 200.000đ → tiền thừa hiển thị 75.000đ; bấm Đã thu tiền → cả 2 đơn `PAID`, `Payments` 1 dòng `AmountDue=125000, AmountReceived=200000, ChangeGiven=75000`, phiên `CLOSED`, hộp thoại in mở, khách thấy "Cảm ơn".
  - AC-006-02: Hai request `settle` đồng thời → một 200, một 409; chỉ một dòng `Payments`.
  - AC-006-03: Phiên còn 1 đơn `PENDING` → 409 `HAS_PENDING_ORDERS`; không đổi gì.
  - AC-006-04: Trang in (S-12) chỉ có khối hóa đơn rộng 80 mm = 302 px CSS ở 96 dpi. Bản chính thức: tiêu đề "HÓA ĐƠN THANH TOÁN", tên quán, bàn, thời gian, mã phiên, từng dòng món của mọi đơn, tổng, tiền đưa, "Tiền thừa", "Thanh toán: Tiền mặt". Phiếu tạm tính (`mode=provisional`) in được khi chưa thu và có chữ "TẠM TÍNH"; xin bản chính thức khi phiên chưa thu → 409 `UNPAID`. In trên máy in nhiệt thật: kiểm thủ công (UAT). _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
  - AC-006-05: Khách / không token gọi `settle` → 401; STAFF bị khóa → 403.
  - AC-006-06: Báo cáo doanh thu (FEATURE-012) ngay sau đó cộng đúng 125.000đ vào ngày thu.
  - AC-006-07: Tiền khách đưa nhỏ hơn số phải thu → 400 `INSUFFICIENT_AMOUNT`; số phải thu POS gửi kèm (`expectedAmountDue`) khác số hệ thống tính lại → 409 `AMOUNT_CHANGED`; cả hai trường hợp phiên vẫn mở, thu lại với số đúng thì thành công. _(bổ sung — TASK-057, 20/10/2026)_
  - AC-006-08: "Đóng bàn trống": phiên còn đơn chưa hủy → 409 `HAS_ORDERS`; phiên không có đơn hoặc chỉ còn đơn đã hủy → đóng phiên, không tạo lượt thu; đóng lần 2 → 409 `SESSION_CLOSED`. _(bổ sung — TASK-057, 20/10/2026)_
- **Liên kết:** SP `sp_SettleSession` · API `POST /api/sessions/{id}/settle`, `GET /api/sessions/{id}/receipt?mode=final|provisional`, `POST /api/sessions/{id}/close` · UI S-10, S-14, S-12 · Rule BR-007, BR-014, BR-019 · Realtime `session.settled` · Hỏi: Q-013 (gửi đơn đồng thời với thu tiền), Q-015 (phiếu dán ly), Q-018 (phiên chỉ có đơn hủy).
