# FEATURE-086 — Khách đổi bàn khi quét QR

> **Nguồn:** chủ dự án 10/11/2026: "nếu khách ngồi bàn này quét đặt món chưa gửi đi hoặc đã gửi rồi mà khách đi đâu quên lại qua bàn khác quét QR thì chuyện gì sẽ xảy ra và giải quyết như thế nào" → đề xuất → "ok tiến hành làm". Quyết định: [ADR-047](../quyết-định/ADR-047-doi-ban-khi-quet.md) D-206…D-210. Nền: [F-001](FEATURE-001.md) quét QR, [F-021](FEATURE-021.md) gọi nhân viên, [F-049](FEATURE-049.md) chuyển bàn.

- **Status:** CONFIRMED (ADR-047, chủ dự án 10/11) · Triển khai: [TASK-104](../công-việc/TASK-104.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (đổi bàn, nhờ quầy); **ACT-STAFF / ACT-LEAD** vị trí Phục vụ (bấm "Chuyển" / "Bỏ qua"); **EXT-SCHEDULER** (tự đóng bàn trống).
- **Màn hình:**
  - **Vào bàn** (SCR-01): trạng thái mới "Bạn đang gọi món ở Bàn A… Bạn đã chuyển sang Bàn B?" — "Chuyển sang Bàn B" / "Nhờ quầy chuyển nhóm sang Bàn B" + "Gọi món riêng ở Bàn B" / "Quay lại Bàn A".
  - **Theo dõi đơn** (SCR-05): dòng "Đã nhờ quầy chuyển nhóm sang Bàn B lúc … — trang sẽ tự chuyển khi nhân viên xác nhận".
  - **Máy quầy → Đơn hàng** (SCR-10): dải "Gọi nhân viên" có thẻ "Bàn A → Bàn B · Khách xin chuyển bàn · [Chuyển] [Bỏ qua]".
  - **Thực đơn** (SCR-02): nhóm trống bị đóng → mở lại bàn, giữ giỏ, lời nhắn.
- **Dữ liệu:** migration `0057_doi_ban_khi_quet.sql` (`StaffCalls.Type MOVE` + `ToTableId`, `SessionTableMoves.ByGuest`, `Sessions.CloseReason`).

## User Story

- **US-086-1:** Là khách, khi đổi sang bàn khác và quét QR ở đó, tôi muốn app nhận ra tôi đang có nhóm ở bàn cũ và hỏi tôi có chuyển sang không — chưa gửi món thì chuyển ngay giữ nguyên giỏ, đã gửi món thì nhờ quầy chuyển — để món mang ra đúng chỗ tôi ngồi, không phải gọi lại, không bị hai hóa đơn.
- **US-086-2:** Là nhân viên quầy, tôi muốn thấy ngay "Bàn A → Bàn B · Khách xin chuyển bàn" và chuyển bằng một chạm, đồng thời bàn khách quét rồi bỏ đi tự được trả lại, để danh sách bàn luôn đúng thực tế.

## Quy tắc (BR-124)

1. Chỉ hỏi khi điện thoại có nhóm mở ở **bàn khác** trong 6 giờ gần nhất; có nhóm ở chính bàn vừa quét → vào thẳng.
2. Tự chuyển chỉ khi nhóm chưa có món (trừ đơn đã hủy), một điện thoại, chưa gọi thanh toán; còn lại phải nhờ quầy (mỗi nhóm một yêu cầu đang chờ).
3. Nhóm chuyển tới bàn đang có nhóm khác vẫn là bill riêng (như F-049).
4. Nhóm không có món, 30 phút không ai vào thêm, không có yêu cầu đang chờ → hệ thống tự đóng; khách còn mở thực đơn → mở lại bàn, giữ giỏ.

## API

- `POST /api/sessions/scan` → thêm `{ state: 'ELSEWHERE', table, elsewhere, otherGroups[], openSessions[] }`; `elsewhere = { sessionId, table: { name, qrToken }, status, orderCount, itemCount, clientCount, canMoveNow, moveRequest }`.
- `POST /api/sessions/{id}/move-here` `{ qrToken }` (khách, thuộc nhóm) → `{ session, table }`; lỗi `409 GUEST_MOVE_BLOCKED`, `403 NOT_SESSION_MEMBER`, `400 SAME_TABLE`, `404 TABLE_NOT_FOUND`.
- `POST /api/sessions/{id}/move-request` `{ qrToken }` (khách, thuộc nhóm) → `201` yêu cầu `{ callId, type: 'MOVE', table, toTable, requestedAt }`.
- `POST /api/staff-calls/{id}/move` (nhân viên, vị trí Phục vụ, ca mở) → như chuyển bàn F-049 + `call`; `409 ALREADY_PROCESSED`.
- Phiên: thêm `moveRequest`, `clientCount`, `closeReason`. Gọi nhân viên: thêm `type`, `toTable`.

## Acceptance Criteria

- AC-086-01: Điện thoại có nhóm ở Bàn 01 quét Bàn 02 → `ELSEWHERE` (tên + mã QR Bàn 01, 0 món, `canMoveNow`), không tạo nhóm ở Bàn 02; quét lại Bàn 01 → vào nhóm cũ; nhóm mở quá 6 giờ → quét bàn khác vào thẳng.
- AC-086-02: Nhóm chưa có món, một điện thoại → "Chuyển sang bàn này": nhóm (cùng mã) sang bàn mới, bàn cũ trống, lịch sử `ByGuest = 1`, quầy nhận `session.table_changed`; có món / hai điện thoại / không thuộc nhóm / cùng bàn / mã sai → từ chối, không đổi gì.
- AC-086-03: Nhóm đã có món → "Nhờ quầy chuyển": yêu cầu `MOVE` ở `/api/staff-calls` (bàn đi → bàn đến), phiên có `moveRequest`, không tính `openCalls`, Gọi nhân viên vẫn gọi được ngay; đổi ý → cùng yêu cầu, bàn đích mới; quầy "Chuyển" → nhóm + đơn sang bàn mới, yêu cầu xong; bấm lại → 409; nhân viên không phải Phục vụ → 403; "Bỏ qua" = Đã xử lý; chuyển bằng ngăn kéo tự đóng yêu cầu.
- AC-086-04: "Gọi món riêng" → nhóm mới ở bàn mới, nhóm cũ giữ nguyên, quét lại bàn nào vào đúng nhóm bàn đó; điện thoại có hai nhóm quét bàn thứ ba → hỏi nhóm đã gửi món trước, nhóm còn lại trong `otherGroups`.
- AC-086-05: Job `close-idle-tables`: nhóm trống 31 phút → đóng (`IDLE_EMPTY`, `session.closed` có `reason`); nhóm có món / vừa có người vào / đang gọi nhân viên / 29 phút → giữ; đóng bàn trống tay báo `reason: 'EMPTY'`.
- AC-086-06: (điện thoại) Chọn 2 món chưa gửi ở Bàn X1, quét Bàn X2 → màn hỏi → "Chuyển sang Bàn X2" → thực đơn Bàn X2 giỏ còn 2 món; quầy: X1 trống, X2 "Chuyển từ Bàn X1"; quầy đóng bàn trống X2 → điện thoại mở lại bàn, giỏ còn 2 món, lời nhắn "Quầy vừa đóng bàn trống…".
- AC-086-07: (điện thoại + máy quầy) Gửi đơn ở Bàn X3, quét Bàn X4 → "Nhờ quầy chuyển" → trang theo dõi X3 có dòng chờ; máy quầy thấy thẻ "Bàn X3 → Bàn X4" → "Chuyển" → điện thoại tự sang X4, đơn còn, thẻ biến mất.

## Bằng chứng

`tests/table-change.test.js` (AC-086-01…05) · E2E "đổi bàn khi quét (chưa gửi món)…" (AC-086-06), "đổi bàn khi quét (đã gửi món)…" (AC-086-07).
