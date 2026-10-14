# Sự kiện realtime

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.4 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

| Sự kiện | Room | Payload | Kích hoạt bởi |
| --- | --- | --- | --- |
| `order.created` | `staff`, `session:{id}` | `{ order }` (đầy đủ items) | sp_SubmitOrder commit (dine-in và mang đi) |
| `order.status_changed` | `staff`, `session:{id}` | `{ orderId, status, changedAt }` | accept / complete |
| `order.cancelled` | `staff`, `session:{id}` | `{ orderId, reason }` | cancel |
| `session.payment_requested` | `staff`, `session:{id}` | `{ sessionId, table, amountDue, requestedAt, orderCount }` | request-payment (D-2) — POS phát âm thanh riêng |
| `session.payment_cancelled` | `staff`, `session:{id}` | `{ sessionId }` | khách gọi thêm món sau khi đã gọi thanh toán (nếu nhóm chọn cho phép) |
| `session.settled` | `staff`, `session:{id}` | `{ sessionId, paymentId, amountDue, amountReceived, changeGiven, paidAt }` | settle |
| `session.closed` | `staff`, `session:{id}` | `{ sessionId }` | close (bàn trống) |
| `menu.availability_changed` | `public` (mọi khách), `staff` | `{ menuItemId, isAvailable }` | admin PATCH (mặc định **không** tự tắt khi hết nguyên liệu — chỉ phát `inventory.low`) |
| `inventory.low` | `staff` | `{ ingredientId, name, available }` | sau complete nếu dưới ngưỡng |

Quy tắc client:
- Khi kết nối/kết nối lại: **luôn** fetch lại ảnh chụp (`GET /api/orders?since=` + `GET /api/sessions?status=` cho POS; `GET /api/sessions/{id}` cho khách) rồi mới áp sự kiện; sự kiện chỉ là "gợi ý cập nhật".
- Kết nối tới room `staff` yêu cầu JWT; room `session:{id}` yêu cầu cookie client thuộc phiên (server kiểm khi `join`).
- Mỗi sự kiện có `emittedAt`; client bỏ qua sự kiện cũ hơn dữ liệu đang có.
- POS dùng hai âm thanh khác nhau: đơn mới ("Ting") và gọi thanh toán ("Ting-ting" / chuông) để nhân viên phân biệt không cần nhìn.

## Triển khai thực tế (14/10/2026)

Mã nguồn: `ứng-dụng/máy-chủ/src/realtime/{io,publisher}.js`, client `ứng-dụng/giao-diện/public/js/socket.js`. Test: `ứng-dụng/máy-chủ/tests/api.test.js`, `kiểm-thử/e2e/flow.spec.js`.

- **Xác thực lúc handshake** (không có lệnh `join` riêng): `io({ auth: { token } })` → room `staff` (JWT hợp lệ, tài khoản đang hoạt động); `io({ auth: { sessionId } })` + cookie `cf_client` thuộc phiên → room `session:{id}`; mọi kết nối vào `public`. Sai → `connect_error` với `UNAUTHORIZED` / `FORBIDDEN` / `ACCOUNT_LOCKED`, client không tự kết nối lại.
- Server gửi sự kiện **`ready`** `{ rooms }` sau mỗi lần kết nối (kể cả kết nối lại) → client tải lại ảnh chụp (REQ-017).
- Mọi payload có `emittedAt` (ISO). `order.status_changed` và `order.cancelled` gửi kèm `order` đầy đủ (ngoài `orderId`, `status`, `changedAt`/`reason`) để POS cập nhật thẻ không cần gọi lại API.
- `menu.availability_changed` phát khi trạng thái **đặt được** của món đổi: admin bật/tắt "còn bán" **hoặc** kho đổi làm món hết/đủ nguyên liệu (sau gửi đơn, hoàn tất, hủy, điều chỉnh kho, sửa BOM) — ADR-003.
- `inventory.low` `{ ingredientId, name, unit, available, threshold }` sau hoàn tất/điều chỉnh khi khả dụng ≤ ngưỡng.
- `session.payment_requested`, `session.settled`, `session.closed` có `table: { tableId, code, name }`.
- Đo trên máy dev (`npm run load`): gửi đơn → quầy nhận `order.created` p95 ≈ 165 ms (NFR-001 < 2 s). Đo trên Wi-Fi quán: NOT_RUN.
