# FEATURE-092 — Màn chào khi khách quét QR

> **Nguồn:** chủ dự án 16/11/2026 — "bạn thiết kế giao diện khi quét QR nó vào sẽ thấy cái này được không" (kèm ảnh màn chào gọi món tại bàn của một hệ thống khác). Quyết định: [ADR-054](../quyết-định/ADR-054-man-chao-khi-quet-qr.md) D-228, D-229. Nền: [F-001](FEATURE-001.md) quét QR vào bàn, [F-005](FEATURE-005.md) gọi thanh toán, [F-021](FEATURE-021.md) gọi nhân viên, [F-014](FEATURE-014.md) / [F-047](FEATURE-047.md) hội viên, [F-051](FEATURE-051.md) đánh giá món, [F-053](FEATURE-053.md) tên / địa chỉ quán, [F-088](FEATURE-088.md) mang ra bàn, [F-083](FEATURE-083.md) cài đặt màn khách.

- **Status:** CONFIRMED (ADR-054) · Triển khai: [TASK-113](../công-việc/TASK-113.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (điện thoại khách); **ACT-ADMIN / ACT-STORE** (bật / tắt ở Cài đặt).
- **Màn hình:** **SCR-01** `/t/{qrToken}` sau khi vào nhóm → màn chào; **SCR-02** thực đơn: tên quán ở đầu trang dẫn về màn chào; **SCR-33** Cài đặt → Màn gọi món của khách → "Màn chào khi khách quét QR".
- **Dữ liệu:** cài đặt `guest.welcome` (mặc định bật). Không migration.

## User Story

- **US-092-1:** Là khách, khi quét QR trên bàn tôi muốn thấy ngay quán nào, bàn nào, món sẽ mang ra đâu, và các việc hay cần (gọi thanh toán, gọi nhân viên, nhập SĐT tích điểm, xem thực đơn) trên một màn hình, để không phải tìm nút ở nhiều trang.

## Quy tắc

1. Màn chào hiện sau khi khách đã có nhóm ở bàn (bàn trống, đã trong nhóm, sau Gộp chung / Tạo đơn cá nhân / chuyển bàn). Bàn có người, QR sai, điện thoại đang ở bàn khác — vẫn là các màn chọn như F-001 / F-086. Quét lại QR = về màn chào.
2. Lời chào theo giờ Việt Nam: 5:00–10:59 sáng, 11:00–13:59 trưa, 14:00–17:59 chiều, còn lại tối; tên = tên hội viên đã che (BR-024) khi nhóm đã gắn hội viên, không thì "Quý khách".
3. Câu bàn theo cách phục vụ (F-088): mang ra bàn → "Quán sẽ mang món ra cho bạn tại [Bàn …]"; nhận tại quầy → "Bạn đang ngồi [Bàn …] · nhận món tại quầy".
4. Gọi thanh toán: nhóm chưa có đơn → nhắc "Bạn chưa gọi món nào…", không gọi; có đơn → sang Theo dõi đơn và mở ngay hộp "Gọi thanh toán" (xác nhận như F-005); nhóm đã gọi thanh toán → ô ghi "Đã gọi — nhân viên đang tới", bấm sang Theo dõi đơn. Gọi nhân viên: hộp chọn nhanh F-021 ngay trên màn chào (giới hạn 60 giây / nhóm như cũ). Đánh giá: giải thích đánh giá ở màn cảm ơn sau khi thanh toán (F-051 không đổi).
5. Quán tạm ngưng nhận đơn QR (F-020) hoặc chưa mở ca → dải báo trên màn chào; vẫn xem thực đơn được.
6. Cài đặt tắt → quét QR vào thẳng thực đơn như trước (không thấy màn chào, tên quán ở thực đơn không là liên kết).

## API

- `GET /api/menu` (công khai): `shop` thêm `address` (`string | null`); `ui` thêm `welcome` (boolean).
- `GET / PUT /api/admin/settings`: `guestWelcome` (boolean; chủ quán, quản lý cửa hàng).
- Dùng lại: `POST /api/sessions/scan`, `GET /api/sessions/{id}`, `POST /api/sessions/{id}/call-staff`, `POST /api/sessions/{id}/request-payment`, hội viên (F-014 / F-047).

## Acceptance Criteria

- AC-092-01: Cài đặt mới mặc định `guestWelcome = true`, `GET /api/menu` có `ui.welcome = true` và `shop.name` / `shop.address` theo Cài đặt; tắt → `ui.welcome = false`; quản lý cửa hàng bật lại được; nhân viên → 403 (không đổi); giá trị không phải boolean → 400.
- AC-092-02: (điện thoại 390 px, cài đặt bật, mang ra bàn) quét QR bàn trống W1 → vẫn ở `/t/{qr}`, màn chào có tên quán (h1), địa chỉ, "Chào buổi (sáng|trưa|chiều|tối), Quý khách", "Quán sẽ mang món ra cho bạn tại Bàn W1", ô "Nhập SĐT để nhận ưu đãi", ba ô Gọi thanh toán / Gọi nhân viên / Đánh giá, liên kết "Xem thực đơn – Gọi món" tới thực đơn; Gọi thanh toán khi chưa có món → nhắc "Bạn chưa gọi món nào"; Đánh giá → hộp giải thích "Sau khi thanh toán…"; Gọi nhân viên → chọn "Dọn bàn" → gửi → quầy có lời gọi của Bàn W1; vào thực đơn → tên quán dẫn về màn chào; gọi món xong quét lại → "Đơn của bạn · 1 đơn đã gửi", ô Gọi thanh toán ghi "Tạm tính …" → bấm → trang Theo dõi đơn mở sẵn hộp "Gọi thanh toán" → Xác nhận → "Đã báo quầy".
- AC-092-03: Tắt cài đặt → điện thoại khác quét QR bàn trống W2 → vào thẳng `/menu`, tên quán ở thực đơn không là liên kết.
- AC-092-04: Quét khả năng tiếp cận màn chào trên điện thoại (nhãn, tên nút, tương phản, vùng chạm ≥ 24 px, dấu focus) và không cuộn ngang ở 320 / 390 px.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/guest-welcome.test.js` (AC-092-01).
- E2E: `kiểm-thử/e2e/flow.spec.js` bài "màn chào khi quét QR…" (AC-092-02, AC-092-03); `kiểm-thử/e2e/a11y.spec.js` bài "khách (điện thoại)…" (AC-092-04).
