# FEATURE-004 — Theo dõi trạng thái đơn (khách, realtime)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED
- **Source:** US4 (bản 1), Actor 1.1, D-2
- **Actor:** Khách
- **Luồng:** Màn hình theo dõi (S-05) gọi `GET /api/sessions/{id}` (phiên + đơn + tổng tạm tính) để lấy ảnh chụp hiện tại, rồi subscribe room `session:{id}`. Mỗi sự kiện `order.status_changed`, `order.cancelled`, `session.payment_requested`, `session.settled` cập nhật thẻ đơn/phần tổng; khi một đơn `COMPLETED` hiện pop-up "Đã xong, vui lòng nhận tại quầy". Có hai nút cố định dưới màn hình: **"Gọi thêm món"** (về S-02) và **"Gọi thanh toán"** (FEATURE-005).
- **Biên:** Mất kết nối → hiện "Đang kết nối lại"; reconnect → fetch lại ảnh chụp (không tin sự kiện bị nhỡ). Đóng tab rồi mở lại từ QR → vào lại phiên cũ (cookie còn) và thấy đơn. Phiên `CLOSED` → màn hình "Cảm ơn, đã thanh toán 125.000đ" + nút "Gọi món mới" (quét lại QR / tạo phiên mới).
- **Acceptance Criteria**
  - AC-004-01: Khách mở màn hình theo dõi; quầy bấm Tiếp nhận → ≤ 2 s khách thấy "Đang chuẩn bị"; quầy bấm Hoàn tất → ≤ 2 s khách thấy "Đã xong" + pop-up, không F5.
  - AC-004-02: Rớt mạng 30 s trong lúc đơn được hoàn tất → sau khi có mạng, màn hình tự cập nhật đúng trạng thái.
  - AC-004-03: Client của phiên khác không nhận được sự kiện của phiên này.
  - AC-004-04: Tổng tạm tính trên màn hình = Σ đơn không hủy trong phiên; cập nhật khi gọi thêm hoặc đơn bị hủy.
- **Liên kết:** Realtime [realtime-events](../kiến-trúc/realtime-events.md) · API `GET /api/sessions/{id}` · UI S-05 · NFR-001.
