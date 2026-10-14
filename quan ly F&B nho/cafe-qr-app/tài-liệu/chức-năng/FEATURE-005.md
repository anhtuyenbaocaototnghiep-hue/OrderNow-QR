# FEATURE-005 — Gọi thanh toán (khách) — D-2

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — "gọi lại" sau 2 phút và "gọi thêm sau khi gọi thanh toán → phiên về OPEN" theo ADR-003 (Q-013). Đã triển khai 14/10/2026
- **Source:** Quyết định D-2 (thay US3/Module 2.1–2.2)
- **Actor:** Khách
- **Điều kiện trước:** Phiên `OPEN`, có ≥ 1 đơn không `CANCELLED` (BR-018).
- **Luồng**
  1. Khách bấm **"Gọi thanh toán"** trên S-05 → hộp xác nhận hiển thị tổng tiền và danh sách đơn: "Gọi nhân viên ra thu tiền 125.000đ?" → Xác nhận.
  2. `POST /api/sessions/{id}/request-payment` → server kiểm BR-018 → `Sessions.Status = PAYMENT_REQUESTED`, `PaymentRequestedAt = now` → phát `session.payment_requested { sessionId, table, amountDue, requestedAt }` tới `staff` (và `session:{id}`).
  3. Màn hình khách chuyển sang "Đã gọi thanh toán · Nhân viên sẽ đến bàn trong giây lát · Tổng 125.000đ (tiền mặt)" kèm đồng hồ chờ.
  4. Khi quầy thu tiền (FEATURE-006) → nhận `session.settled` → màn hình "Cảm ơn, đã thanh toán".
- **Lỗi và biên**
  - Phiên chưa có đơn → nút ẩn; gọi thẳng API → `409 NO_ORDERS`.
  - Phiên đã `CLOSED` → `409 SESSION_CLOSED`.
  - Bấm lại khi đang `PAYMENT_REQUESTED` → 200, cập nhật `PaymentRequestedAt`, phát lại sự kiện (nhắc quầy); UI chỉ cho "Gọi lại" sau 2 phút (PROPOSED).
  - Sau 5 phút chưa được thu → hiện "Nhân viên đang bận, bạn có thể ra quầy thanh toán" + nút Gọi lại (REQ-019 mới).
  - Khách bấm "Gọi thêm món" sau khi đã gọi thanh toán → cho phép; gửi đơn mới sẽ đưa phiên về `OPEN` và phát `session.payment_cancelled` để POS gỡ cảnh báo (PROPOSED — hoặc chặn gọi thêm cho tới khi thu tiền; nhóm chọn).
  - Đơn còn `PENDING` chưa tiếp nhận lúc gọi thanh toán → vẫn cho gọi; quầy phải tiếp nhận/hủy trước khi thu (BR-019).
- **Acceptance Criteria**
  - AC-005-01: Phiên có 2 đơn; bấm Gọi thanh toán → ≤ 2 s POS phát âm thanh riêng và hiện thẻ "Bàn 05 · Gọi thanh toán · 125.000đ · 0:05"; `Sessions.Status = PAYMENT_REQUESTED`.
  - AC-005-02: Phiên không có đơn → nút không hiển thị; `POST` trả 409; trạng thái phiên không đổi.
  - AC-005-03: Phiên đã `CLOSED` → 409; không phát sự kiện.
  - AC-005-04: Bấm Gọi thanh toán 2 lần → chỉ một thẻ trên POS, thời gian gọi cập nhật; không tạo bản ghi thừa.
  - AC-005-05: Client của phiên khác gọi API với `sessionId` này → 403.
- **Liên kết:** Data `Sessions` · API `POST /api/sessions/{id}/request-payment` · UI S-05, S-04 · Rule BR-018 · Realtime `session.payment_requested` · Hỏi: Q-013 (gọi thêm món sau khi đã gọi thanh toán).
