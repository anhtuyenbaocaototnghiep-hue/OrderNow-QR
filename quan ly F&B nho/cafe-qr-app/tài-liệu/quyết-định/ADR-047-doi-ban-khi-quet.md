# ADR-047 — Khách đổi bàn khi quét QR

- **Trạng thái:** ACCEPTED (10/11/2026). Chủ dự án hỏi "khách ngồi bàn này quét đặt món (chưa gửi hoặc đã gửi) rồi đi qua bàn khác quét QR thì chuyện gì xảy ra, giải quyết thế nào"; agent đề xuất 2 điểm (hỏi khách khi quét bàn khác + tự đóng bàn trống quá 30 phút), chủ dự án: "ok tiến hành làm… nhớ là chuyên gia và là một khách hàng, test kỹ".
- **Bối cảnh (trước F-086):**
  - Quét QR chỉ tìm nhóm của điện thoại **ở đúng bàn vừa quét** → sang bàn khác quét là mở nhóm mới, không biết điện thoại đang có nhóm ở bàn cũ.
  - Chưa gửi món: giỏ (lưu theo nhóm) ở lại bàn cũ, bàn cũ thành "bàn ma" (nhóm trống) tới khi nhân viên bấm "Đóng bàn trống".
  - Đã gửi món: món làm xong mang ra **bàn cũ**; màn "Đơn của bạn" ở bàn mới trống → khách tưởng mất đơn, dễ gọi lại (làm trùng), gọi thêm thành bill thứ hai. Chỉ xử lý được khi nhân viên tự biết khách đổi chỗ (Chuyển bàn F-049, Thu chung F-057).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-206 | Quét QR bàn B mà điện thoại **đang có nhóm mở ở bàn khác** (mở trong 6 giờ gần nhất — cũ hơn coi như khách đã rời quán) → **không tự mở nhóm mới**, trả `state: 'ELSEWHERE'` và hỏi khách: "Bạn đang gọi món ở Bàn A (đã gửi n món / chưa gửi món nào). Bạn đã chuyển sang Bàn B?" Có nhóm ở B của chính điện thoại này → vào thẳng như cũ. Điện thoại có nhiều nhóm (đã "gọi riêng" trước đó) → hỏi về **nhóm đã gửi món trước** (món có thể mang ra nhầm bàn), rồi nhóm mở gần nhất; các nhóm còn lại là lựa chọn phụ (tối đa 3). Luôn có "Quay lại Bàn A". |
| D-207 | Nhóm ở A **chưa có món nào** (trừ đơn đã hủy), **chỉ một điện thoại**, **chưa gọi thanh toán** → nút **"Chuyển sang Bàn B"**: khách tự chuyển ngay (`POST /api/sessions/{id}/move-here`), dùng chung thủ tục chuyển bàn F-049 với `@ByGuest = 1` (kiểm lại các điều kiện trong cùng khóa phiên), cùng mã nhóm nên **giỏ đi theo**, bàn A trống ngay; lịch sử chuyển bàn ghi `ByGuest = 1`, `MovedBy` để trống. Không cần ca mở (không xử lý đơn). |
| D-208 | Còn lại (đã gửi món / có người khác trong nhóm / đang gọi thanh toán) → **"Nhờ quầy chuyển nhóm sang Bàn B"** (`POST /api/sessions/{id}/move-request`): tạo yêu cầu loại `MOVE` ở bảng gọi nhân viên (bàn đích `ToTableId`, mỗi nhóm tối đa một yêu cầu đang chờ — đổi ý thì cập nhật bàn đích), hiện ở dải **"Gọi nhân viên"** của máy quầy: "Bàn A → Bàn B · Khách xin chuyển bàn · [Chuyển] [Bỏ qua]". "Chuyển" = chuyển bàn F-049 (quyền Phục vụ, cần ca mở); "Bỏ qua" = "Đã xử lý". Khách về trang của nhóm ở bàn A với dòng "Đã nhờ quầy chuyển nhóm sang Bàn B…"; quầy chuyển xong → điện thoại tự mở lại ở bàn B (sự kiện F-049). Bỏ qua → khách được báo "Quầy chưa chuyển bàn…". Chuyển bàn bằng ngăn kéo cũng tự đóng yêu cầu đang chờ. Yêu cầu chuyển bàn **không** tính là "đã gọi nhân viên" và không dính chờ 60 giây của Gọi nhân viên. Thêm lựa chọn **"Gọi món riêng ở Bàn B"** (nhóm A giữ nguyên, bill riêng — như "Tạo đơn cá nhân"). |
| D-209 | **Tự đóng bàn trống:** job `close-idle-tables` mỗi 5 phút đóng nhóm **không có món nào** mà **30 phút** không ai vào thêm (tính từ lúc mở nhóm / điện thoại cuối cùng vào nhóm), **trừ** nhóm đang có yêu cầu gọi nhân viên / xin chuyển bàn chưa xử lý. Thủ tục đóng bàn trống kiểm lại trong cùng khóa (vừa có món / có người vào → bỏ qua). Lưu `Sessions.CloseReason = 'IDLE_EMPTY'`, `ClosedBy` để trống; báo `session.closed` có `reason`. |
| D-210 | Nhóm trống bị đóng (tự động, hoặc quầy bấm "Đóng bàn trống") khi khách **đang mở thực đơn** → điện thoại cất giỏ chưa gửi theo bàn, tự mở nhóm mới ở cùng bàn và **lấy lại giỏ** (trong 2 giờ), kèm lời nhắn đúng lý do ("Bàn trống lâu nên đã được đóng…" / "Quầy vừa đóng bàn trống…"). Gửi đơn trúng nhóm đã đóng cũng giữ giỏ. |

## Phương án đã cân nhắc

- **Khách đã gửi món cũng tự chuyển luôn (không qua quầy):** nhanh hơn, nhưng món có thể đang được mang ra bàn cũ và bạn cùng nhóm có thể vẫn ngồi ở bàn cũ → để nhân viên xác nhận một chạm.
- **Tự gộp nhóm bàn A vào nhóm ở bàn B:** có thể gộp nhầm bill của người khác đang ngồi ở B; giữ quy tắc F-049 (nhóm chuyển tới vẫn là bill riêng), muốn trả chung thì "Thu chung" F-057.
- **Đóng bàn trống tính theo giờ mở nhóm:** đóng nhầm nhóm vừa có bạn vào cùng → tính theo lần cuối có người vào nhóm.
- **Không đóng tự động, chỉ nhắc quầy:** quầy đông vẫn sót "bàn ma", khách mới quét bàn đó lại bị hỏi "Gộp chung nhóm 1 (0 món)?" → đóng tự động, giữ giỏ nếu khách còn đang chọn.

## Hệ quả

- Migration `0057_doi_ban_khi_quet.sql`: `StaffCalls.Type` thêm `MOVE` + `ToTableId` (+ ràng buộc, chỉ mục duy nhất một yêu cầu MOVE đang chờ mỗi nhóm); `SessionTableMoves.MovedBy` cho phép NULL + `ByGuest`; `Sessions.CloseReason`.
- Thủ tục: `sp_MoveSession` (`@ByGuest`, `@ClientToken`; lỗi 50125 / 50126; tự đóng yêu cầu MOVE), `sp_CloseEmptySession` (`@Reason`, `@IdleMinutes`; lỗi 50127).
- API: `POST /api/sessions/scan` thêm `state: 'ELSEWHERE'` (`elsewhere`, `otherGroups`, `openSessions`); `POST /api/sessions/{id}/move-here`; `POST /api/sessions/{id}/move-request`; `POST /api/staff-calls/{id}/move`; phiên có `moveRequest`, `clientCount`, `closeReason`; gọi nhân viên có `type`, `toTable`.
- Giao diện: `t-entry.js` (màn hỏi), `t-track.js` (dòng chờ), `t-menu.js` + `customer.js` (giữ giỏ), `pos-dashboard.js` (thẻ yêu cầu ở dải Gọi nhân viên).
- Test: `tests/table-change.test.js` (AC-086-01…05), E2E AC-086-06, 07.
- **Bổ sung (ADR-048, 10/11/2026):** D-209 — 30 phút là **mặc định**, chủ quán chọn Tắt / 15 / 30 / 60 phút (D-212); thẻ xin chuyển ghi bàn đích có người (D-213); đơn có nhãn "Đổi bàn" + phiếu pha bàn mới (D-211).
