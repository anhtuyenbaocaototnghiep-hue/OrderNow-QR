# FEATURE-066 — "Ra món khi bạn bè tới" (hẹn giờ làm món)

> **Nguồn:** chủ dự án 03/11/2026. Quyết định: [ADR-024](../quyết-định/ADR-024-vong-quay-hen-gio-ra-mon.md) D-93, D-94.

- **Status:** CONFIRMED (ADR-024) · Triển khai: [TASK-083](../công-việc/TASK-083.md)
- **Actor:** **ACT-GUEST** (chọn lúc làm món khi gửi đơn, báo "bạn đã tới"); **ACT-STAFF / ACT-LEAD** (thấy đơn đang giữ, làm ngay khi cần).
- **Màn hình:**
  - **Khách → Giỏ hàng** (S-03): chọn "Khi nào làm món?" — Làm ngay · Sau 10 phút · Sau 20 phút · Khi bạn tới.
  - **Khách → Theo dõi đơn** (S-05): đơn đang giữ hiện "Hẹn làm lúc 14:35" hoặc "Chờ bạn tới", nút **"Bạn đã tới — làm món ngay"**.
  - **Quầy → Đơn hàng** (S-10): phiếu "Đang giữ" ở cuối cột Chờ xác nhận; tới giờ / được báo → thành đơn chờ bình thường, kêu chuông.
- **Dữ liệu:** `Orders.HoldMode` (`TIME` \| `ARRIVAL`), `Orders.HoldUntil`, `Orders.ReleasedAt`.

## User Story

- **US-066-1:** Là khách đến trước, tôi muốn gọi món cho bạn bè đến sau và hẹn quán làm khi bạn tới, để món không nguội hay tan đá.

## Quy tắc (BR-103)

1. Chỉ đơn khách gửi tại bàn (dine-in qua QR). `TIME`: 5–45 phút (giao diện có 10 và 20); `ARRIVAL`: giữ tối đa 45 phút.
2. Đơn đang giữ = `HoldUntil` có giá trị, `ReleasedAt` trống và chưa tới `HoldUntil`. Trạng thái vẫn `PENDING`, kho vẫn giữ như đơn chờ.
3. "Bạn đã tới" (bất kỳ thiết bị trong phiên, hoặc nhân viên) → `ReleasedAt` = lúc bấm, phát `order.released` tới quầy và phiên. Bấm khi đơn không còn giữ → `409 NOT_HELD`.
4. Nhân viên Tiếp nhận đơn đang giữ → ghi `ReleasedAt` và làm luôn.
5. Đơn đang giữ không vào hàng chờ ước tính thời gian; đồng hồ chờ ở quầy tính từ lúc tới giờ / được báo.
6. Thu tiền bàn còn đơn đang giữ → chặn như đơn chờ khác (`HAS_PENDING_ORDERS`).

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/orders` | Khách (phiên) | Thêm `hold?: { mode: 'TIME', minutes: 5–45 } \| { mode: 'ARRIVAL' }`; đơn trả `holdMode`, `holdUntil`, `releasedAt` |
| `POST /api/orders/{id}/release` | Thiết bị trong phiên / nhân viên | Báo đã tới → đơn hết giữ; `409 NOT_HELD` nếu không còn giữ |

## Acceptance Criteria

- AC-066-01: Gửi đơn với `hold` → đơn `PENDING`, `HoldUntil` đúng (10 phút / 45 phút với ARRIVAL), giữ kho như đơn thường; `hold` sai (0 phút, 60 phút, kiểu lạ) → `400`; đơn không `hold` như cũ.
- AC-066-02: "Bạn đã tới" từ thiết bị trong phiên → `ReleasedAt` có giá trị, quầy nhận `order.released`; thiết bị ngoài phiên → `403`; đơn không còn giữ → `409 NOT_HELD`.
- AC-066-03: Nhân viên tiếp nhận đơn đang giữ → `PREPARING`, `ReleasedAt` có giá trị; đơn đang giữ không vào hàng chờ ước tính; thu tiền khi còn đơn đang giữ → `409 HAS_PENDING_ORDERS`.
- AC-066-04: Trên trình duyệt: khách chọn "Khi bạn tới" → quầy thấy phiếu "Chờ bạn tới" ở cuối cột Chờ (không kêu chuông); khách bấm "Bạn đã tới" → phiếu thành đơn chờ bình thường; đơn hẹn giờ tới giờ thì tự chuyển.

## Bằng chứng

`tests/hold-order.test.js` (AC-066-01…03) · E2E "ra món khi bạn tới…" (AC-066-04).
