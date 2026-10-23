# FEATURE-049 — Chuyển bàn

> **Nguồn:** chủ dự án yêu cầu 21/10/2026: "bạn làm chuyển bàn". Quyết định: [ADR-010](../quyết-định/ADR-010-chuyen-ban-so-quy-danh-gia.md) D-43.

- **Status:** CONFIRMED (ADR-010 D-43) · Triển khai: [TASK-061](../công-việc/TASK-061.md)
- **Actor:**
  - **ACT-STAFF / ACT-LEAD / ACT-ADMIN** (`pos.use`): chuyển bàn;
  - **ACT-GUEST:** điện thoại tự chuyển theo.
- **Màn hình:**
  - **Quầy → Đơn hàng → ngăn kéo Thu tiền bàn** (S-14): nút **Chuyển bàn** → chọn bàn đích. Danh sách ghi rõ bàn trống / "đang có N nhóm" → **Chuyển**.
  - **Thẻ bàn** ở danh sách phiên ghi "Chuyển từ Bàn X" (lần chuyển gần nhất).
  - **Điện thoại khách:** báo "Nhóm của bạn đã chuyển sang Bàn Y", trang tự mở lại ở bàn mới.
- **Dữ liệu:** migration `0036_chuyen_ban.sql` — bảng `SessionTableMoves (MoveId, SessionId, FromTableId, ToTableId, MovedBy, MovedAt)`.
- **SP:** `sp_MoveSession` (mới).

## User Story

- **US-049-1:** Là nhân viên quầy, tôi muốn chuyển cả nhóm khách sang bàn khác (kể cả bàn đang có nhóm khác) mà đơn, chia bill, hội viên vẫn giữ nguyên, để khách đổi chỗ không phải gọi lại món hay tính tiền nhầm bàn.
- **US-049-2:** Là khách, tôi muốn điện thoại của mình tự theo nhóm sang bàn mới, để vẫn gọi thêm món, theo dõi đơn và gọi thanh toán bình thường.

## Quy tắc (D-43)

1. Chỉ phiên **chưa đóng** (`OPEN`, kể cả đang gọi thanh toán). Phiên đã đóng → `409 SESSION_CLOSED`.
2. **Bàn đích:** đang dùng (không tắt / không xóa), khác bàn hiện tại.
   - Không tồn tại / đã tắt → `404` / `409 TABLE_INACTIVE`.
   - Trùng bàn hiện tại → `400 SAME_TABLE`.
   - Bàn đích có nhóm khác → nhóm chuyển sang vẫn là **phiên riêng**, bill riêng (như khách chọn "Cá nhân").
3. **Một transaction:**
   - `Sessions.TableId` = bàn mới;
   - `Orders.TableId` mọi đơn của phiên = bàn mới, nên thẻ đơn / phiếu pha / bill hiện bàn mới;
   - ghi `SessionTableMoves`.
   - Chia bill, hội viên, gọi nhân viên, gọi thanh toán gắn theo phiên nên đi theo.
4. **Realtime:** `session.table_changed` `{ sessionId, fromTable, toTable }` tới quầy (`staff`) và nhóm (`session:{id}`). Gửi cho nhóm có kèm mã QR bàn mới.
5. **Phía khách:**
   - Đang mở trang: chuyển `sessionId` sang bàn mới rồi mở lại cùng trang ở `/t/{qr mới}/…`, kèm thông báo.
   - Tải lại sau đó (bỏ lỡ sự kiện): API phiên trả bàn hiện tại, trang tự chuyển.
   - Khách mới quét QR bàn mới thấy nhóm này trong lựa chọn "Gộp chung"; quét QR bàn cũ không còn thấy.
6. **Nhật ký thao tác:** `session.move` (Session), sau có bàn cũ / mới.
7. **Bàn / tài khoản từng dính lần chuyển** là "đã dùng": xóa bàn → xóa mềm (`sp_DeleteTable`), xóa tài khoản chỉ từng chuyển bàn → xóa mềm (`sp_DeleteUser`).
8. **Màn Gọi món tại bàn đang soạn món cho nhóm bị chuyển** → đi theo nhóm sang bàn mới, món đang soạn chuyển theo. Bàn đang chọn trống bỗng có nhóm **chuyển tới** → không tự gộp vào bill nhóm đó: món đang soạn gửi thành nhóm mới.
9. **Điện thoại đang gửi đơn** đúng lúc nhóm bị chuyển → chuyển trang sau khi gửi xong (không cắt ngang, không gửi trùng).

## API

| Method & path | Quyền | Body → kết quả |
| --- | --- | --- |
| `POST /api/sessions/{id}/move` | `pos.use` | `{ toTableId, fromTableId? }` → `{ session, fromTable, toTable }`. `fromTableId` = bàn máy quầy đang thấy; nhóm đã bị máy khác chuyển đi → `409 SESSION_MOVED` |
| `GET /api/sessions/{id}` | khách trong phiên / quầy | phiên có `lastMove { fromTable, movedAt }`. Khách trong nhóm nhận `table.qrToken` **chỉ khi nhóm còn mở và đã từng chuyển bàn** (để tự chuyển trang). Phiên đã đóng / chưa chuyển → không có, nên người từng vào nhóm không lấy được mã QR mới sau "Tạo lại QR" |

## Acceptance Criteria

- AC-049-01: Nhóm ở Bàn 01 có 2 đơn (1 chờ, 1 đang pha) → nhân viên chuyển sang Bàn 05 (trống). Kết quả:
  - phiên ở Bàn 05, cả 2 đơn ghi Bàn 05;
  - Bàn 01 trống (quét QR Bàn 01 → nhóm mới);
  - quầy và điện thoại trong nhóm nhận `session.table_changed`;
  - có dòng lịch sử chuyển + nhật ký `session.move`.
- AC-049-02: Chuyển sang bàn đang có nhóm khác → 2 phiên song song ở bàn đích, bill riêng. Thu tiền nhóm chuyển sang chỉ thu đơn của nhóm đó; nhóm kia không đổi.
- AC-049-03: Phiên đã chia bill và gắn hội viên → sau khi chuyển, các phần chia, hội viên, yêu cầu gọi thanh toán giữ nguyên; thu từng phần bình thường.
- AC-049-04: Lỗi không đổi gì:
  - chuyển sang chính bàn đó → `400`;
  - bàn đích đã tắt → `409 TABLE_INACTIVE`;
  - bàn không tồn tại → `404`;
  - phiên đã đóng → `409 SESSION_CLOSED`;
  - khách (không token) gọi → `401`.
- AC-049-05: Điện thoại khách:
  - đang ở trang theo dõi đơn của Bàn 01 → nhân viên chuyển sang Bàn 05 → trang tự mở `/t/{qr Bàn 05}/track`, hiện "Bàn 05" và thông báo đã chuyển;
  - gọi thêm món ở bàn mới thành công;
  - khách khác quét QR Bàn 05 thấy nhóm để "Gộp chung".

## Bằng chứng

`tests/table-move.test.js` (AC-049-01…04) · E2E "chuyển bàn…" (AC-049-05).
