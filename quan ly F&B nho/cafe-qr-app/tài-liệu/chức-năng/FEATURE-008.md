# FEATURE-008 — Bán mang đi tại quầy (mục riêng) — D-3

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED
- **Source:** US8 (bản 1), US6 (bản 2), Module 1.3, D-3
- **Actor:** STAFF, ADMIN
- **Màn hình (S-13 `/pos/takeaway`):** mục riêng trên POS, tối ưu thao tác nhanh: lưới món theo danh mục bên trái (chạm = +1), giỏ bên phải (số lượng, ghi chú, tổng), ô **Tiền khách đưa** với các nút nhanh (đủ tiền / 50k / 100k / 200k / 500k), hiển thị tiền thừa, nút **"Thu tiền & In bill"**. Có nút "Đơn mang đi hôm nay" để xem lại/in lại.
- **Đầu vào:** `items[]` (như FEATURE-003), `amountReceived` (≥ tổng — BR-006).
- **Luồng:** `POST /api/orders/takeaway { items, amountReceived }` → `sp_SubmitOrder` với `Type = TAKE_AWAY`, `SessionId = NULL`, `CreatedBy = staff`, `PaymentMethod = CASH` → trong cùng transaction: đơn `PREPARING/PAID`, `Payments(OrderId, CASH, AmountDue, AmountReceived, ChangeGiven, ReceivedBy)`, giữ kho (A). Phát `order.created`. Trả `201 { order, payment }`; POS mở hộp thoại in bill (S-12 chế độ đơn) và thẻ đơn xuất hiện ở cột Đang pha; nhân viên pha xong bấm Hoàn tất như thường.
- **Lỗi và biên**
  - `amountReceived` thiếu hoặc < tổng → client chặn, bôi đỏ ô, "Vui lòng nhập tiền khách đưa (tối thiểu 45.000đ)"; server 400 `INSUFFICIENT_AMOUNT`.
  - Kho không đủ → 409 `OUT_OF_STOCK`, không tạo đơn, không ghi `Payments`.
  - Giỏ trống → nút vô hiệu; server 400.
- **Acceptance Criteria**
  - AC-008-01: Chọn 2 món tổng 45.000đ, nhập 50.000đ, Thu tiền & In bill → đơn `TAKE_AWAY/PAID/PREPARING`, `Payments` 1 dòng `ChangeGiven = 5000`, hộp thoại in mở, thẻ ở cột Đang pha.
  - AC-008-02: Không nhập tiền khách đưa → client chặn, bôi đỏ, báo lỗi; gọi thẳng API → 400; không có đơn mới.
  - AC-008-03: Kho không đủ → 409 `OUT_OF_STOCK`, không tạo đơn, không có `Payments`.
  - AC-008-04: Bấm Hoàn tất đơn mang đi → kho trừ đúng BOM; `COMPLETED`.
  - AC-008-05: Khách gọi `POST /api/orders/takeaway` → 401.
- **Liên kết:** API `POST /api/orders/takeaway` · UI S-13, S-12 · Rule BR-006, BR-009 · SP `sp_SubmitOrder`.
