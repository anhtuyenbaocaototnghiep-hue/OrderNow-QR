# FEATURE-021 — Gọi nhân viên

> **Nguồn:** skill `extend-features` §4 F-021. Quyết định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md).

- **Status:** CONFIRMED (ADR-005) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:** khách gọi; STAFF xử lý.
- **Màn hình:**
  - Khách: nút "🙋 Gọi nhân viên" ở màn theo dõi đơn. Chọn nhanh (Xin nước lọc / Xin thêm đá / Xin khăn giấy / Dọn bàn) hoặc ghi yêu cầu khác.
  - Quầy: dải xanh "🙋 Gọi nhân viên" (cùng kiểu dải Gọi thanh toán) với âm thanh thứ ba (`bell`) và nút "Đã xử lý".
- **Dữ liệu:** `StaffCalls` (migration `0011_goi_nhan_vien.sql`).
- **Quy tắc:**
  - Chỉ khách thuộc phiên mới gọi được (403); phiên đã đóng → 409.
  - Chống spam 60 giây/phiên (`429 TOO_SOON`, kèm `retryAfter`). Kiểm và ghi trong một câu lệnh có khóa.
  - "Đã xử lý" chỉ một người thắng: lần 2 → `409 ALREADY_PROCESSED`.
- **API:**
  - `POST /api/sessions/{id}/call-staff { message }`.
  - `GET /api/staff-calls` (các yêu cầu chưa xử lý của phiên chưa đóng).
  - `POST /api/staff-calls/{id}/handle`.
  - Realtime `session.staff_called`, `session.staff_call_handled` (tới quầy + phiên).
- **Acceptance Criteria**
  - AC-021-01: Khách gọi → quầy nhận realtime kèm tên bàn + yêu cầu.
  - AC-021-02: Gọi lại trong 60 giây → 429. Khách phiên khác → 403.
  - AC-021-03: Quầy bấm "Đã xử lý" → khách được báo. Bấm lần 2 → 409.
- **Bằng chứng:**
  - `tests/sales.test.js` → "Gọi nhân viên (F-021)".
  - E2E "gọi nhân viên…".
