# FEATURE-055 — Chưa mở ca thì không nhận và không xử lý đơn

> **Nguồn:** chủ dự án yêu cầu 23/10/2026: "khi chưa mở ca thì không thể order, bắt buộc phải mở ca để hoạt động các chức năng"; chọn: khách xem menu nhưng không gửi đơn, quầy khóa nhóm "xử lý đơn". Quyết định: [ADR-017](../quyết-định/ADR-017-bat-buoc-mo-ca.md) D-64…D-66.

- **Status:** CONFIRMED (ADR-017 D-64…D-66) · Triển khai: [TASK-071](../công-việc/TASK-071.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (gửi đơn QR), **ACT-STAFF / ACT-LEAD / ACT-ADMIN** (xử lý đơn ở quầy).
- **Màn hình:**
  - **Menu khách** (SCR-02 / SCR-03): dải "Quán chưa mở ca …", nút Gửi đơn khóa; tự mở lại khi quầy mở ca.
  - **Quầy** (SCR-10, SCR-14, SCR-16): dải "Chưa mở ca — chưa nhận, xử lý đơn và thu tiền được" + nút **Mở ca**; nút Tiếp nhận / Hoàn tất / Hủy trên phiếu và Gửi đơn ở Gọi món tại bàn bị khóa, ghi "Chưa mở ca".
- **Dữ liệu:** không có bảng / cột mới (dùng `Shifts`).

## User Story

- **US-055-1:** Là chủ quán, tôi muốn quầy phải mở ca rồi mới nhận và xử lý đơn, để mọi đơn, mọi lần trừ kho đều thuộc một ca có người chịu trách nhiệm.
- **US-055-2:** Là khách, tôi muốn biết ngay khi quán chưa mở ca (vẫn xem được menu), để không gửi đơn rồi chờ mà không ai làm.

## Quy tắc (BR-087)

1. **Khách:** không có ca mở → `POST /api/orders` trả `409 NO_OPEN_SHIFT` ("Quán chưa mở ca nên chưa nhận đơn — vui lòng chờ nhân viên mở ca"), không tạo đơn. Xem menu, giỏ, báo giá (`POST /api/orders/quote`), quét QR, gọi thanh toán vẫn được.
2. **Quầy — xử lý đơn:** không có ca mở → `409 NO_OPEN_SHIFT` ("Chưa mở ca — hãy mở ca trước khi xử lý đơn") cho:
   - tiếp nhận, hoàn tất, hủy đơn (`/api/orders/{id}/accept|complete|cancel`);
   - gọi món tại bàn (`POST /api/sessions/{id}/orders`);
   - sửa / xóa món, xóa đơn, hủy lượt phục vụ bàn (`/api/order-items/{id}/void`, `/api/orders/{id}/void`, `/api/sessions/{id}/cancel`);
   - chuyển bàn (`/api/sessions/{id}/move`);
   - chia bill: tạo phần, gán món (khách và quầy — khách nhận lời nhắn dành cho khách), gộp lại (chỉ quầy) (`/api/sessions/{id}/splits`, `…/items/{orderItemId}/split`, `…/splits/merge`).
   Dữ liệu (đơn, kho, phiên) không đổi khi bị chặn.
3. **Không khóa:** xem; mở bàn, ghi chú bàn, đóng bàn trống; gọi nhân viên, đánh giá thấp; kho ở quầy; trang Quản lý; mở / đóng ca. Thu tiền / mang đi / hoàn tiền / sổ quỹ vẫn cần ca như F-018.
4. **Trạng thái quán:** `store` (menu, `GET /api/store`, `store.status_changed`) có thêm `shiftOpen`. Nút "QR: đang nhận đơn" trên thanh quầy vẫn chỉ là công tắc nhận đơn QR (F-020) — khi chưa mở ca, dải "Chưa mở ca" cho biết khách chưa gửi được đơn. Mở / đóng ca phát `store.status_changed` tới khách và quầy. Khách gửi được đơn khi `acceptingOrders && shiftOpen`.
5. Đóng ca khi còn đơn chưa xong vẫn được; các đơn đó chờ ca mới.

## API (thay đổi trên endpoint đã có)

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/orders` | Thêm `409 NO_OPEN_SHIFT` khi không có ca mở (sau `503 STORE_CLOSED`) |
| `GET /api/menu`, `GET /api/store` | `store` thêm `shiftOpen: boolean` |
| Các endpoint ở Quy tắc 2 | Thêm `409 NO_OPEN_SHIFT` khi không có ca mở |
| Sự kiện `store.status_changed` | Payload thêm `shiftOpen`; phát thêm khi mở / đóng ca (phòng `public`, `staff`) |

## Acceptance Criteria

- AC-055-01: Chưa có ca mở: khách gửi đơn → `409 NO_OPEN_SHIFT`, không tạo đơn; menu có `store.shiftOpen = false`; báo giá giỏ vẫn `200`. Quầy mở ca → menu `shiftOpen = true`, khách gửi đơn → `201`.
- AC-055-02: Mở ca → khách (phòng `public`) nhận `store.status_changed` có `shiftOpen = true`; đóng ca → `shiftOpen = false`.
- AC-055-03: Đơn từ ca trước còn chờ, ca đã đóng: tiếp nhận, hoàn tất, hủy, gọi món tại bàn, sửa / xóa món, xóa đơn, hủy bàn, chuyển bàn, chia bill (tạo phần, gán món, gộp) → `409 NO_OPEN_SHIFT`; trạng thái đơn, tồn kho, bàn, phần chia không đổi. Mở ca → tiếp nhận và hoàn tất được.
- AC-055-04: Chưa có ca mở, vẫn làm được: mở bàn + ghi chú bàn, xem đơn / bàn, xem tồn kho ở quầy và ghi phiếu hủy hàng, trang Quản lý (báo cáo), mở ca.
- AC-055-05: Trên trình duyệt, khi chưa mở ca: quầy thấy dải "Chưa mở ca — chưa nhận, xử lý đơn và thu tiền được", nút Tiếp nhận trên phiếu bị khóa; điện thoại khách thấy "Quán chưa mở ca …" và nút gửi khóa. Quầy bấm Mở ca → điện thoại tự mở lại nút gửi (không tải lại trang), khách gửi được, quầy tiếp nhận được.

## Bằng chứng

`tests/shift-required.test.js` (AC-055-01…04) · E2E "chưa mở ca…" (AC-055-05).
