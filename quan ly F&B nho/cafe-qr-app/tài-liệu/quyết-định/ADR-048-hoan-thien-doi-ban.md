# ADR-048 — Hoàn thiện đổi bàn: nhãn đổi bàn trên đơn, chủ quán chọn thời gian tự trả bàn, bàn đích có người

- **Trạng thái:** ACCEPTED (10/11/2026). Sau TASK-104 (F-086) agent báo 4 đề xuất thêm; chủ dự án chọn 1–3: "Món đang pha lúc khách đổi bàn… Thẻ đơn ở quầy nên hiện nhãn "Đổi bàn → Bàn B" trong 10 phút, kèm nút in lại phiếu. Thời gian tự đóng bàn trống: cho chủ quán chọn 15 / 30 / 60 phút hoặc tắt. Thẻ xin chuyển bàn nên ghi bàn đích đang có người hay không, để nhân viên quyết chuyển hay thu chung — tiến hành làm cho tôi". Đề xuất 4 (chống gọi món từ xa) **không** làm.
- **Đính chính:** đề xuất 1 viết "phiếu pha đã in vẫn ghi bàn cũ" — kiểm lại thì app **chưa có in phiếu pha** (chỉ in hóa đơn / tạm tính). Rủi ro thật là người pha / người mang món **nhớ bàn cũ** khi nhóm đổi bàn giữa chừng. Vì vậy nút là **"In phiếu bàn mới"** — in một phiếu pha mới ghi bàn mới, không phải "in lại".
- **Bối cảnh (sau F-086):**
  - Chuyển bàn (F-049 / F-086) đổi `Orders.TableId` của cả nhóm → thẻ đơn ở máy quầy chỉ đổi chữ tên bàn, không có gì nổi bật; người đang pha một món của "Bàn A" dễ mang ra Bàn A.
  - Tự đóng bàn trống cố định 30 phút (ADR-047 D-209) — quán có khách hay ngồi chờ bạn lâu mới gọi thì 30 phút là quá ngắn; quán nhỏ muốn tắt.
  - Thẻ "Bàn A → Bàn B · Khách xin chuyển bàn" không cho biết Bàn B đang có nhóm khác → nhân viên không biết chuyển xong sẽ thành hai bill ở một bàn.
  - Khách quét QR **tự mở nhóm** không phát sự kiện tới quầy (chỉ nhân viên mở bàn mới phát `session.opened`) → lưới bàn và thẻ "xin chuyển bàn" đứng yên tới sự kiện khác (tìm ra khi chạy E2E — DEF-029).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-211 | **Nhãn "Đổi bàn" trên thẻ đơn + phiếu pha bàn mới.** Máy chủ tính cho mỗi đơn `tableMove = { fromTable, fromTableId, movedAt }` từ lịch sử chuyển bàn `SessionTableMoves`: bàn lúc đặt đơn = `FromTableId` của **lần chuyển đầu tiên sau giờ đặt**, `movedAt` = **lần chuyển cuối**; quay về đúng bàn lúc đặt → không tính (giờ lưu tới giây, so `MovedAt >= CreatedAt`: đơn đặt cùng giây với lần chuyển có thể bị gắn nhãn dư — vô hại vì nhãn chỉ nhắc mang ra bàn hiện tại; không bao giờ sót). Máy quầy: đơn **mới / đang pha** (kể cả đơn đang giữ F-066) có nhãn nổi **"Đổi bàn: ~~Bàn A~~ → Bàn B"** trong **10 phút** tính từ lần chuyển cuối (tự mất, không cần tải lại), kèm nút **"In phiếu bàn mới"** (đơn đang giữ chưa làm → chỉ nhãn); có nhóm đổi bàn mà còn đơn chưa ra món → thông báo "Bàn A đã chuyển sang Bàn B — còn n đơn chưa ra món, mang ra Bàn B". **Phiếu pha** = trang in sẵn có `/pos/orders/{id}/receipt?mode=ticket` (khổ 58 / 80 mm theo máy): "PHIẾU PHA — ĐỔI BÀN", tên bàn mới thật to, "(đổi từ Bàn A lúc HH:MM)", mã đơn, giờ đặt, món + tùy chọn + combo + ghi chú, **không giá**. Không thêm cột / bảng. |
| D-212 | **Chủ quán chọn thời gian tự trả bàn trống:** cài đặt `tables.idle_close_minutes` ∈ {0 = Tắt, 15, 30, 60}, mặc định 30 (giữ hành vi ADR-047). Cài đặt → thẻ **"Bàn trống"** (ô chọn "Tự trả bàn khách quét QR nhưng không gọi món"). Job `close-idle-tables` (mỗi 5 phút) đọc cài đặt mỗi lần chạy; Tắt → không đóng (`{ off: true }`). Chỉ **chủ quán** đổi (quản lý cửa hàng không có trong `STORE_MGR_SETTINGS` — đúng lời "cho chủ quán chọn"). Các điều kiện đóng giữ nguyên D-209. |
| D-213 | **Thẻ "xin chuyển bàn" ghi bàn đích đang trống / có nhóm khác:** yêu cầu `MOVE` (danh sách `/api/staff-calls`, sự kiện `session.staff_called`) có `toTable.openGroups` = số nhóm chưa đóng ở bàn đích (trừ chính nhóm xin chuyển). Máy quầy tính lại từ danh sách nhóm đang mở mỗi khi có nhóm mở / đóng / đổi bàn → thẻ ghi **"Bàn B đang trống"** (xanh) hoặc **"Bàn B đang có n nhóm khác"** (nâu cảnh báo). Bấm "Chuyển" sang bàn có người → thông báo "bàn này giờ có n + 1 nhóm, tính tiền riêng. Khách muốn trả chung thì bấm "Thu chung với bàn khác" khi tính tiền" (giữ F-049: chuyển tới bàn có người vẫn bill riêng; F-057 thu chung). Để thẻ và lưới bàn cập nhật ngay, khách quét QR **mở nhóm mới** (bàn trống / "Gọi món riêng" / "Tạo đơn cá nhân") giờ phát `session.opened` tới room `staff` với `byGuest: true` (cùng payload nhân viên mở bàn). |

## Phương án đã cân nhắc

- **In tự động phiếu pha khi đổi bàn:** quán chưa dùng phiếu pha giấy, máy in hóa đơn có thể đang in bill → in tay một chạm khi cần.
- **Lưu "bàn lúc đặt" vào cột mới `Orders.OriginalTableId`:** cần migration + sửa mọi thủ tục tạo đơn; lịch sử chuyển bàn đã đủ để suy ra → không thêm cột.
- **Nhãn giữ tới khi đơn xong:** đơn pha lâu thì nhãn thành "nhiễu"; 10 phút đủ cho món đang pha (chủ dự án chọn 10 phút).
- **Cho quản lý cửa hàng đổi thời gian tự trả bàn:** chủ dự án nói "cho chủ quán chọn" → chỉ chủ quán; muốn mở thêm thì thêm vào `STORE_MGR_SETTINGS` sau.
- **Tự gộp bill khi chuyển tới bàn có người:** có thể gộp nhầm bill người lạ → chỉ báo cho nhân viên và nhắc "Thu chung" (như ADR-047).

## Hệ quả

- Không migration. Cài đặt mới `tables.idle_close_minutes` (bảng `Settings` key-value, thiếu = 30).
- API: đơn hàng (`GET /api/orders`, `GET /api/orders/{id}`, sự kiện `order.*`, `POST /api/orders` phần `order`) thêm `tableMove`; `GET/PUT /api/admin/settings` thêm `idleCloseMinutes` (0 / 15 / 30 / 60, chủ quán); job `close-idle-tables` trả `{ minutes, checked, closed }` hoặc `{ off: true, … }`; gọi nhân viên `toTable.openGroups`.
- Realtime: `session.opened` thêm trường hợp khách tự mở nhóm (`byGuest: true`).
- Giao diện: `pos-dashboard.js` (nhãn `.move-flag`, nút in, thông báo, dòng `.dest` trên thẻ xin chuyển), `pos-receipt.js` (`mode=ticket`), `print.css` (`.slip-table`), `admin-settings.js` (thẻ "Bàn trống").
- Test: `tests/table-move-followup.test.js` (AC-087-01…03), E2E AC-087-04, 05.
- Bổ sung ADR-047 D-209: 30 phút là **mặc định**, chủ quán đổi được (D-212).
