# FEATURE-074 — Bán tiếp khi mất mạng: máy quầy bán tạm, tự gửi bù; phiếu bán tay

> **Nguồn:** chủ dự án 06/11/2026 — sau khi agent (góc nhìn chuyên gia F&B) chỉ ra "máy chủ sập là cả quán đứng" và giải thích cách làm: "tiến hành làm khi làm xong làm thành file skill.md". Quyết định: [ADR-032](../quyết-định/ADR-032-ban-khi-mat-mang.md) D-140…D-146.

- **Status:** CONFIRMED (ADR-032) · Triển khai: [TASK-091](../công-việc/TASK-091.md)
- **Actor:** **ACT-STAFF / ACT-LEAD** (bán tạm, gửi bù, xem đơn bán lúc mất mạng trong ca, in phiếu bán tay trống); **ACT-LEAD / ACT-ADMIN** (nhập đơn từ phiếu bán tay); **ACT-ADMIN** (nhận cảnh báo "Bán lúc mất mạng cần kiểm").
- **Màn hình:**
  - **Bán mang đi** (SCR-13): dải vàng **Đang bán tạm khi mất kết nối** + ô SĐT hội viên; nút **Thu tiền — lưu đơn tạm & In bill**; thẻ **Đơn bán tạm chờ gửi (N)** + **Gửi ngay**; ô **Nhập đơn từ phiếu bán tay** (trưởng ca / quản lý) + **Giờ bán ghi trên phiếu**; nút **In phiếu bán tay trống**.
  - **Ca & hoàn tiền** (SCR-15): thẻ **Đơn bán lúc mất mạng** (SCR-54); đóng ca khi máy còn đơn tạm → hộp nhắc.
  - **Cảnh báo** (SCR-47): loại **Bán lúc mất mạng cần kiểm**.
- **Dữ liệu:** `Orders.ClientRef` (duy nhất), `Orders.SaleSource`, bảng `OfflineSales`, `Alerts.Kind = 'OFFLINE_SALE'` (migration 0051); trình duyệt máy quầy: `localStorage` `cf_offline_sales`, `cf_takeaway_ref`, `cf_device_name`.

## User Story

- **US-074-1:** Là nhân viên quầy, tôi muốn vẫn thu tiền và in bill khi máy chủ hay mạng gặp sự cố, rồi đơn tự về hệ thống khi có mạng lại, để quán không phải ngừng bán.
- **US-074-2:** Là chủ quán, tôi muốn đơn bán lúc mất mạng không bị tính hai lần, không làm sai kho / ca, và tôi thấy rõ đơn nào cần kiểm, để sổ sách vẫn đúng sau sự cố.

## Quy tắc (BR-112)

1. Bán tạm chỉ ở màn Bán mang đi, cần đã có ca mở lúc bán; giá niêm yết (không khuyến mãi / giảm giá / voucher); tiền mặt (tiền khách đưa ≥ tổng) hoặc chuyển khoản.
2. Mỗi lượt thu mang đi có mã lượt thu (UUID) — giữ nguyên khi thu lại cùng giỏ; máy chủ ghi một đơn cho một mã (`POST /orders/takeaway` gửi lại → `200 duplicate`, gửi bù → `DUPLICATE`).
3. Gửi bù: đúng giờ bán, đúng giá đã thu, đơn "Đã xong"; trong 72 giờ (`400 SALE_TOO_OLD`); giờ bán ở tương lai / tổng không khớp các dòng / tiền khách đưa thiếu → `400`; món đã xóa → `409 OFFLINE_ITEM_MISSING`; chưa có ca mở → `409 NO_OPEN_SHIFT` (máy giữ lại).
4. Kho chỉ trừ phần còn có, không âm; phần thiếu → `STOCK_SHORT`. Giá khác bảng giá → ghi đúng số đã thu + `PRICE_DIFF`. Ca lúc bán đã đóng → ghi ca hiện tại + `SHIFT_LATE`. Chuyển khoản → `TRANSFER_CHECK`. SĐT không phải hội viên → `MEMBER_NOT_FOUND`.
5. `PRICE_DIFF` / `STOCK_SHORT` / `SHIFT_LATE` → một cảnh báo `OFFLINE_SALE` mỗi ca. `OfflineSales` không xóa được; gửi bù có nhật ký thao tác.
6. Phiếu bán tay: chỉ trưởng ca / quản lý (`403 PAPER_SALE_FORBIDDEN`), giờ bán trong 7 ngày, ghi vào ca đang mở, nguồn `PAPER`.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/offline-sales` | Nhân viên (`PAPER`: trưởng ca / quản lý) | `{ clientRef, source: OFFLINE \| PAPER, localCode, soldAt, soldBy, shiftId, method, amountReceived, total, memberPhone, device, note, items: [{ menuItemId, quantity, note, optionIds, unitPrice }] }` → `201 { status: SYNCED, order, payment, issues, offline }` · đã có → `200 { status: DUPLICATE, … }` |
| `GET /api/offline-sales?shiftId=` | Nhân viên | Đơn gửi bù ghi vào ca: `[{ orderId, orderCode, localCode, source, soldAt, soldBy, syncedAt, syncedBy, device, method, amountDue, shiftIdAtSale, shiftIdRecorded, issues }]` |
| `POST /api/orders/takeaway` | Nhân viên | Thêm `clientRef` (UUID, không bắt buộc) — gửi lại cùng mã → `200 { order, payment, duplicate: true }` |

## Acceptance Criteria

- AC-074-01: Bán mang đi gửi kèm mã lượt thu: gửi lại cùng mã → 200 cùng đơn, `duplicate: true`, chỉ một đơn và một lượt thu; gửi bù cùng mã của lượt thu đã ghi lúc có mạng → `DUPLICATE`, không ghi thêm.
- AC-074-02: Gửi bù → đơn mang đi `COMPLETED` / `PAID`, nguồn `OFFLINE`, giờ đặt / giờ hoàn tất / giờ thu = giờ bán, tiền đúng số đã thu, ghi vào ca, trừ kho đủ (giữ chỗ trả về 0); món đang tắt vẫn ghi; gửi lại → `DUPLICATE`, không trừ kho lần nữa; danh sách theo ca có mã tạm, người bán, máy; có nhật ký thao tác; không xóa được.
- AC-074-03: Kho thiếu → vẫn ghi, không trừ phần thiếu (không âm), nguyên liệu đủ vẫn trừ, báo "Chưa trừ: …"; giá khác bảng giá → ghi đúng số đã thu + báo; một cảnh báo `OFFLINE_SALE` cho cả ca; chuyển khoản → chỉ "cần đối chiếu"; SĐT hội viên → gắn hội viên; SĐT lạ → báo.
- AC-074-04: Tổng không khớp / giờ bán tương lai / tiền khách đưa thiếu → 400; quá 72 giờ → 400 `SALE_TOO_OLD`; món đã xóa → 409 `OFFLINE_ITEM_MISSING`; phiếu bán tay: nhân viên 403, trưởng ca ghi được (nguồn `PAPER`), quá 7 ngày 400; chưa mở ca → 409 `NO_OPEN_SHIFT`; ca lúc bán đã đóng → ghi vào ca mới + báo `SHIFT_LATE` + cảnh báo của ca mới.
- AC-074-05: Trên trình duyệt: máy quầy mất mạng → tự chuyển bán tạm (dải vàng, ẩn hội viên / giảm giá, nút "Thu tiền — lưu đơn tạm & In bill"); thu → "Đã lưu đơn tạm T-0001", thẻ "Đơn bán tạm chờ gửi (1)"; có mạng lại → tự gửi "Đã gửi 1 đơn bán tạm", thẻ biến mất; Ca & hoàn tiền có "Đơn bán lúc mất mạng (1)" kèm mã tạm và người bán; quản lý bật "Nhập đơn từ phiếu bán tay" → "Ghi đơn bán tay" → "Đã ghi đơn bán tay #…".

## Giới hạn đã biết

- Mạng nội bộ chạy http → không có service worker: trang **đang mở** bán được, **tải lại trang** lúc máy chủ tắt thì không mở được (đơn đã lưu vẫn còn, có mạng lại tự gửi). Dải vàng nhắc "Đừng tải lại trang khi đang mất mạng".
- Đơn tạm nằm trên đúng máy đã bán — máy đó phải mở lại màn Bán mang đi (hoặc Ca & hoàn tiền → Gửi ngay) khi có mạng.
- Khách không tự quét QR gọi món được khi máy chủ / Wi-Fi sự cố (nhân viên thu ở quầy).

## Bằng chứng

`tests/offline-sales.test.js` (AC-074-01…04) · E2E "bán khi mất mạng…" (AC-074-05).
