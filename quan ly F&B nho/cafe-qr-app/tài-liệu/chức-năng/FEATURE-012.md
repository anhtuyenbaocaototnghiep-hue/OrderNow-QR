# FEATURE-012 — Báo cáo doanh thu (ADMIN)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — doanh thu theo `PaidAt` (giờ VN), tab Lịch sử đơn (Q-014) theo ADR-003. Đã triển khai 14/10/2026
- **Source:** US11 (bản 1), US9 (bản 2), Module 5.1
- **Đầu vào:** `from`, `to` (ngày, múi giờ quán `Asia/Ho_Chi_Minh` — PROPOSED), bộ lọc nhanh "Hôm nay / 7 ngày / Tháng này".
- **Chỉ số (định nghĩa để tránh lệch số):**
  - Tổng doanh thu = Σ `TotalAmount` của đơn có `PaymentStatus = PAID` và `Status ≠ CANCELLED`, tính theo **ngày thanh toán** (`PaidAt`) — PROPOSED (Word chưa định nghĩa; cần chốt: theo ngày tạo hay ngày thanh toán).
  - Số hóa đơn = số đơn thỏa điều kiện trên.
  - Món bán chạy = top 10 theo Σ `Quantity` từ `OrderItems` của các đơn trên.
  - Doanh thu theo ngày (biểu đồ cột) và theo giờ trong ngày (nếu chọn 1 ngày).
  - Cảnh báo nguyên liệu sắp hết (BR-016) — không phụ thuộc khoảng ngày.
- **Acceptance Criteria**
  - AC-012-01: Chọn 01/10–10/10/2026 → biểu đồ + bảng đúng số liệu seed (có bộ dữ liệu mẫu để đối chiếu).
  - AC-012-02: Chọn 01/12–10/12/2026 hoặc `from > to` → nút Xem bị vô hiệu, báo "Khoảng thời gian không hợp lệ"; server cũng trả 400.
  - AC-012-03: Đơn `CANCELLED` hoặc `UNPAID` không tính vào doanh thu.
  - AC-012-04: STAFF gọi API báo cáo → 403.
- **Liên kết:** API `GET /api/admin/reports/revenue` · UI S-25 · Rule BR-005 · Hỏi: Q-014 (lịch sử đơn, "theo ca").
