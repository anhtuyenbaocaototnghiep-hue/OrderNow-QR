# Sự kiện realtime

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.4 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

> **Cập nhật 18/10/2026:** sự kiện giai đoạn 4–8 (ADR-006: chia bill, kho nâng cao, sổ quỹ, voucher giới thiệu) nằm ở mục "Bổ sung giai đoạn 4–8" cuối file.

> **Cập nhật 18/10/2026 (ADR-007):** nguồn phát mới của `order.status_changed`, `order.cancelled`, `session.closed` khi sửa / xóa món, xóa đơn, hủy bàn (F-046) nằm ở mục "Bổ sung F-046" cuối file.

> **Cập nhật 18/10/2026 (ADR-008):** F-047 không thêm sự kiện; `session.member_changed` có thêm nguồn phát từ trang Gọi món tại bàn — mục "Bổ sung F-047" cuối file.

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

## Bổ sung giai đoạn 2 (ADR-005, 16/10/2026)

| Sự kiện | Room | Payload | Phát khi |
| --- | --- | --- | --- |
| `session.member_changed` | staff, session | `{ sessionId, member: { memberId, maskedName, tierName, discountPercent, firstOrderDiscount, firstOrderPercent } \| null }` | Gắn / gỡ hội viên |
| `session.staff_called` | staff, session | `{ callId, sessionId, table, message, requestedAt }` | Khách gọi nhân viên (POS phát âm `bell`) |
| `session.staff_call_handled` | staff, session | như trên + `handledAt`, `handledBy` | Quầy bấm "Đã xử lý" |
| `store.status_changed` | public, staff | `{ acceptingOrders, closedMessage }` | Bật/tắt nhận đơn QR |
| `menu.updated` | public, staff | `{}` | Quản lý đổi món/combo/khuyến mãi/gợi ý/tùy chọn/giờ bán → trang khách tải lại menu |
| `shift.opened` / `shift.closed` | staff | `{ shift }` | Mở / đóng ca |
| `payment.refunded` | staff | `{ paymentId, refund }` | Hoàn tiền (kèm `order.status_changed` cho đơn `VOIDED`) |
| `inventory.received` | staff | `{ receiptId, lines }` | Lưu phiếu nhập |
| `session.opened` | staff | `{ sessionId, table, session }` | F-024: nhân viên mở bàn |
| `session.note_changed` | **chỉ staff** | `{ sessionId, table, note, noteUpdatedAt, noteUpdatedBy }` | F-024: sửa ghi chú bàn (không phát vào room phiên — khách không thấy) |

`menu.availability_changed` nay tính cả combo (hết khi thành phần hết/thiếu nguyên liệu).

## Bổ sung giai đoạn 4–8 (ADR-006, cập nhật 18/10/2026)

Mọi sự kiện dưới đây vẫn đi qua `publish()` của `src/realtime/publisher.js`: phát **sau khi commit**, có `emittedAt`. Client vẫn coi sự kiện là "gợi ý cập nhật" và tải lại ảnh chụp như các sự kiện trước.

### Sự kiện mới

| Sự kiện | Room | Payload | Phát khi |
| --- | --- | --- | --- |
| `session.split_changed` | staff, session | `{ sessionId }` | F-026: tạo phần, gán / bỏ dòng, "Thu chung" (gộp), thu xong một phần. Client tải lại `GET /api/sessions/{id}/splits` |
| `inventory.prepared` | staff | `{ batchId, semiIngredientId, outputQty }` | F-027: hoàn tất một mẻ sơ chế (`POST /api/prep/batches`) |
| `inventory.expiring` | staff | `{ lots[{ lotId, ingredientId, name, unit, lotCode, qty, expiryDate, daysLeft, unitCost, source, receivedAt, isClosed }] }` (lô còn ≤ 2 ngày, `daysLeft ≥ 0`) | F-028: job `lot-expiry` 06:00, chỉ phát khi có lô |
| `inventory.expired` | staff | Như trên, gồm các lô đã hết hạn mà còn hàng (`daysLeft < 0`) | F-028: job `lot-expiry` 06:00, chỉ phát khi có lô |
| `inventory.runout` | staff | `{ items[{ ingredientId, name, runOutDate, nextDeliveryDate }] }` | F-029: job `runout-alert` 06:05, khi có nguyên liệu dự kiến hết trước ngày giao kế tiếp |
| `cash.created` | staff | `{ txn }` (khoản sổ quỹ đầy đủ, có `status` APPROVED / PENDING) | F-033: ghi thu / chi quỹ |
| `cash.reviewed` | staff | `{ txn }` (sau duyệt / từ chối) | F-033: duyệt hoặc từ chối khoản chờ |
| `member.vouchers_issued` | **staff** | `{ paymentId, vouchers[{ memberId, code, percent, expiresAt, source }] }` | F-038: lượt thu vừa tặng voucher giới thiệu (thu cả bàn, thu một phần, mang đi) |
| `member.vouchers_issued` | **session** | `{ count, percent, expiresAt }`, **không có mã** | Cùng lúc với bản staff, chỉ khi lượt thu thuộc một phiên tại bàn (mang đi chỉ phát tới staff) |

### Sự kiện cũ có thêm nguồn phát

| Sự kiện | Nguồn mới |
| --- | --- |
| `session.settled` | F-026: thu **phần cuối** làm phiên đóng (`POST /api/splits/{id}/settle` có `sessionClosed: true`). Payload như cũ; `amountDue` lúc này = tổng đã thu của cả phiên (`paidAmount`), `paymentId` là lượt thu của phần cuối. Thu các phần trước chỉ phát `session.split_changed` |
| `menu.updated` | F-040: tạo / sửa / xóa / bật tắt lịch thực đơn. Trang khách còn tự tải lại menu đúng mốc `nextChangeAt` trả về từ `GET /api/menu` |
| `menu.availability_changed` | Khả dụng nay trừ cả lô hết hạn (F-028), nên sự kiện còn có thể phát sau sơ chế, hủy hàng, hủy lô, nhận hàng theo PO |
| `inventory.low` | Thêm sau mẻ sơ chế (mọi nguyên liệu đang ≤ ngưỡng) và sau phiếu hủy / hủy lô (nguyên liệu bị hủy) |
| `inventory.received` | Nhận hàng theo PO (quầy hoặc quản lý) cũng phát, vì đi qua cùng luồng phiếu nhập. Payload thực tế: `{ receiptId, lines }`, trong đó `lines` là **số dòng** |

Không có sự kiện realtime cho chấm công, nhật ký thao tác, chiến dịch, đổi thưởng / tích điểm hay dashboard. Các màn hình này tải lại theo thao tác hoặc theo nút "Tính lại". Theo skill mục 10, hệ thống không gửi thông báo đẩy.

## Bổ sung F-046 — sửa / xóa món, xóa đơn, hủy bàn (ADR-007, 18/10/2026)

Không có sự kiện mới. Ba sự kiện cũ có thêm nguồn phát (vẫn phát **sau khi commit** qua `publish()` / `publishOrderEvent()` trong `src/services/voidService.js`, có `emittedAt`):

| Sự kiện | Room | Payload | Nguồn mới |
| --- | --- | --- | --- |
| `order.status_changed` | `staff`, `session:{id}` | `{ orderId, sessionId, status, order }` (`order` đầy đủ, tổng đã tính lại) | Sửa số lượng / xóa một dòng mà đơn còn dòng khác (`POST /api/order-items/{id}/void`) |
| `order.cancelled` | `staff`, `session:{id}` | `{ orderId, sessionId, reason, order }` | Xóa dòng cuối cùng của đơn; **Xóa đơn** (`POST /api/orders/{id}/void`); **Hủy bàn** (mỗi đơn chưa thu bị hủy một sự kiện) |
| `session.closed` | `staff`, `session:{id}` | `{ sessionId, table, cancelled: true, reason }` | **Hủy bàn** (`POST /api/sessions/{id}/cancel`) — POS bỏ bàn khỏi danh sách, khách thấy phiên đã đóng |
| `session.closed` | `staff`, `session:{id}` | `{ sessionId, table }` | Bỏ nốt món / đơn chưa thu ở phiên **đã thu một phần** (chia bill) làm phiên tự đóng (`sessionClosed: true` trong response) |

Sau mỗi thao tác, server còn tính lại khả dụng món (có thể phát `menu.availability_changed` như sau hủy đơn) và làm mới hàng chờ thời gian chờ (F-025). Lịch sử sửa / xóa món không có sự kiện riêng: drawer Thu tiền tải lại `GET /api/sessions/{id}/voids` khi vẽ lại.

## Bổ sung F-047 — hội viên tại bàn, Thẻ thành viên (ADR-008, 18/10/2026)

Không có sự kiện mới.

| Sự kiện | Room | Payload | Nguồn mới |
| --- | --- | --- | --- |
| `session.member_changed` | `staff`, `session:{id}` | Như giai đoạn 2: `{ sessionId, member: { memberId, maskedName, tierName, discountPercent, firstOrderDiscount, firstOrderPercent } \| null }` — **chỉ tên che** | Nhân viên gắn / thay / gỡ hội viên ở **Gọi món tại bàn** (S-16, `POST` / `DELETE /api/sessions/{id}/member` bằng Bearer). Trang Gọi món tại bàn tải lại danh sách bàn để hiện tên đầy đủ; khung hội viên của khách cùng phiên cập nhật ngay |

Thẻ thành viên (`GET /api/sessions/{id}/member-card`) không có sự kiện riêng: khách mở sheet là tải số liệu mới; phiên đóng (`session.settled` / `session.closed`) thì thẻ không xem được nữa (`409 SESSION_CLOSED`).
