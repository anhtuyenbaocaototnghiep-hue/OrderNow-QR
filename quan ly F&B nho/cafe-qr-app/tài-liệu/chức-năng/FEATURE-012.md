# FEATURE-012 — Báo cáo doanh thu (ADMIN)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — doanh thu theo `PaidAt` (giờ VN), tab Lịch sử đơn (Q-014) theo ADR-003. Đã triển khai 14/10/2026
- **Source:** US11 (bản 1), US9 (bản 2), Module 5.1
- **Đầu vào:** `from`, `to` (ngày, múi giờ quán `Asia/Ho_Chi_Minh` — PROPOSED), bộ lọc nhanh "Hôm nay / 7 ngày / Tháng này".
- **Chỉ số (định nghĩa để tránh lệch số):**
  - Tổng doanh thu = Σ `Payments.AmountDue` (số thực thu, đã trừ khuyến mãi / hội viên / giảm tay / làm tròn) theo **ngày thu** (`PaidAt`) − Σ `Refunds.Amount` theo **ngày hoàn** (giờ VN). Khi không có giảm giá và hoàn tiền, bằng Σ `TotalAmount` của đơn đã thu. Bản gốc (MVP, 14/10/2026): "Σ `TotalAmount` của đơn có `PaymentStatus = PAID` và `Status ≠ CANCELLED`, tính theo ngày thanh toán" _(cập nhật 20/10/2026 theo ADR-005 phần Hệ quả, F-019 — TASK-057)_.
  - Số hóa đơn = số đơn có `PaymentStatus = PAID`, `Status` không phải `CANCELLED` / `VOIDED`, `PaidAt` trong khoảng.
  - Món bán chạy = top 10 theo Σ `Quantity` từ `OrderItems` của các đơn trên.
  - Doanh thu theo ngày (biểu đồ cột) và theo giờ trong ngày (nếu chọn 1 ngày).
  - Cảnh báo nguyên liệu sắp hết (BR-016) — không phụ thuộc khoảng ngày.
- **Acceptance Criteria**
  - AC-012-01: Với bộ dữ liệu mẫu (`kịch-bản/seed-data.js`), chọn 01/10–10/10/2026 → 55 hóa đơn, tổng doanh thu 3.190.000đ, biểu đồ 10 cột ngày (ngày 05/10: 5 hóa đơn, 290.000đ), món bán chạy nhất "Cà phê sữa". _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
  - AC-012-02: Chọn khoảng có ngày kết thúc sau hôm nay (giờ quán) hoặc `from > to` → nút Xem bị vô hiệu, báo "Khoảng thời gian không hợp lệ"; gọi thẳng API → 400 `INVALID_RANGE`. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
  - AC-012-03: Đơn `CANCELLED` hoặc `UNPAID` không tính vào doanh thu.
  - AC-012-04: STAFF gọi API báo cáo → 403.
- **Liên kết:** API `GET /api/admin/reports/revenue` · UI S-25 · Rule BR-005 · Hỏi: Q-014 (lịch sử đơn, "theo ca").
