# TASK-061 — Chuyển bàn
Status: READY_FOR_REVIEW (21/10/2026)
Feature: [FEATURE-049](../chức-năng/FEATURE-049.md) · Quyết định: [ADR-010](../quyết-định/ADR-010-chuyen-ban-so-quy-danh-gia.md) D-43 · Module: MOD-TABLE, MOD-ORDER, MOD-NOTIFY · Màn hình: SCR-10 (Đơn hàng + ngăn kéo Thu tiền bàn), SCR-02 / SCR-05 (khách)
Nguồn: chủ dự án yêu cầu 21/10/2026 ("bạn làm chuyển bàn"); chọn "bàn bất kỳ, bill vẫn riêng". · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-061-chuyen-ban` · Phụ thuộc: F-001 (phiên / Gộp – Cá nhân), F-024 (gọi món tại bàn), F-026 (chia bill)

## Mục tiêu
Nhân viên chuyển cả nhóm sang bàn khác (trống hoặc có nhóm khác, bill riêng) trong một thao tác. Đơn, phiếu pha, bill hiện bàn mới. Chia bill, hội viên, gọi thanh toán đi theo. Điện thoại khách tự sang bàn mới, kể cả khi bỏ lỡ sự kiện.

## Phạm vi sửa
- **CSDL:**
  - `chuyển-đổi/0036_chuyen_ban.sql` (bảng `SessionTableMoves`);
  - `thủ-tục/sp_MoveSession.sql`.
- **Server:**
  - `errors.js` (50200…50204);
  - `sessionsRepo` (`move`, lần chuyển gần nhất);
  - `sessionService.moveSession` + `table.qrToken` cho khách trong nhóm;
  - `routes/staff.js`;
  - `middleware/audit.js` (`session.move`).
- **Giao diện:**
  - `pos-dashboard.js` (nút Chuyển bàn ở thẻ bàn + ngăn kéo, hộp chọn bàn, nghe `session.table_changed`);
  - `pos-table-order.js` (nghe sự kiện);
  - `customer.js` (`followTable`), `t-menu.js`, `t-track.js`;
  - `css/pos.css`.
- **Test:**
  - `tests/table-move.test.js`;
  - bất biến `ORDER_TABLE_MISMATCH`;
  - E2E "chuyển bàn…".
- **Tài liệu:**
  - ADR-010, FEATURE-049, BR-078, US-049-1…2, AF-GUEST-18, AF-STAFF-32;
  - `tc-map`, `api-contract`, `data-model`, `realtime-events`, `roles-permissions`, `sitemap`;
  - hướng dẫn `chức-năng-mới/27-chuyển-bàn.md`.

## Không được sửa
- Cách thu tiền / chia bill / hội viên.
- Luồng quét QR (Gộp / Cá nhân).
- Không gộp bill hai nhóm (D-43).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · migrate `CafeQrDev`.

## Cần hỏi duyệt nếu
- Muốn gộp bill khi chuyển.
- Phải đổi luồng quét QR.

## Kết quả thực chạy (21/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **272/272 PASS** (21 file — thêm `table-move.test.js` 4 test; bất biến `ORDER_TABLE_MISMATCH` đúng sau mọi bộ) |
| `npm run test:e2e` | **37/37 PASS**. Lần chạy đầu E2E mới **FAIL đúng chỗ**: thẻ đơn ở quầy vẫn ghi bàn cũ vì bộ nhớ thẻ đơn không tính bàn → sửa `ticketKey` (thêm bàn), chạy lại PASS |
| `node kịch-bản/traceability.js --check` | 121 US, 305 AC — PASS 305, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Sau khi sửa theo review G3 | `npm test` **273/273**, E2E **37/37**, truy vết 305/305. Code trước khi sửa **FAIL 3 test** (lộ mã QR, chuyển nhầm khi máy khác đã chuyển, xóa bàn / tài khoản) — đã khôi phục |

## Review G3 (agent độc lập, 21/10/2026)
Kết luận lần 1: **Request changes**. Đã sửa:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (bảo mật) | `GET /api/sessions/{id}` trả mã QR bàn hiện tại cho **mọi** người từng vào nhóm, kể cả phiên đã đóng. Hậu quả: người từng quét (ví dụ chụp lại QR) vẫn lấy được mã mới sau "Tạo lại QR" và gọi món từ xa (AC-010-04) | Chỉ trả `qrToken` khi nhóm **còn mở và đã chuyển bàn**; `t-track` không tự chuyển với phiên đã đóng. Test: nhóm chưa chuyển / đã đóng (kể cả sau Tạo lại QR) không có `qrToken` |
| M2 | Khóa ngoại `SessionTableMoves` làm xóa bàn cũ / tài khoản chỉ từng chuyển bàn lỗi 500 | `sp_DeleteTable`, `sp_DeleteUser` coi lịch sử chuyển bàn là "đã dùng" → xóa mềm. Test với tài khoản quản lý (không chấm công) |
| M3 | Màn Gọi món tại bàn đang soạn món cho nhóm bị chuyển → báo nhầm "đã thanh toán", gửi món vào nhóm ma ở bàn cũ. Bàn trống bỗng có nhóm chuyển tới → tự gộp bill | `loadTables` tìm nhóm ở bàn khác → `followGroup`: đi theo nhóm, chuyển giỏ đang soạn. Nhóm **chuyển tới** không tự gộp → gửi thành nhóm mới. E2E: soạn món → máy khác chuyển nhóm → thấy bàn mới, gửi đúng bàn mới, bàn cũ không có nhóm ma |
| N1 | Điện thoại: chuyển trang theo nhóm chen với "đã thanh toán" / đang gửi đơn | Cờ `leaving`; đang gửi đơn thì đợi gửi xong mới chuyển |
| N2 | Hai máy cùng chuyển một nhóm theo dữ liệu cũ | `fromTableId` (bàn máy đang thấy) → `409 SESSION_MOVED`, có test |
| N3 | Bấm đúp ở hộp chọn bàn | Khóa nút khi đang gửi |
| N4 | Test: phép kiểm vô nghĩa; AC-049-03 chưa thu từng phần; thiếu 404 phiên; nhóm trống còn mở; E2E mất mạng chưa thật sự bỏ lỡ sự kiện | Sửa hết. E2E: rời trang (`about:blank`) → chuyển → mở URL bàn cũ |
| N5 | FEATURE-049 ghi `lastMove.movedBy` không có thật | Sửa tài liệu |
| N6 | Báo cáo / in lại lượt thu cũ ghi bàn cuối của phiên | Đúng quyết định ADR-010 ("bàn cuối cùng") — giữ nguyên |
