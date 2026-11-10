---
name: doi-ban-khi-quet
description: Khách đổi bàn khi quét QR của cafe-qr-app (F-086, ADR-047 D-206…D-210, BR-124, TASK-104, migration 0057) và phần hoàn thiện (F-087, ADR-048 D-211…D-213, BR-125, TASK-105, không migration) — POST /api/sessions/scan trả state ELSEWHERE khi điện thoại có nhóm mở ở bàn khác (6 giờ, nhóm đã gửi món trước, otherGroups); nhóm không món + một điện thoại + OPEN → POST /sessions/{id}/move-here (sp_MoveSession @ByGuest, @ClientToken, lỗi 50125/50126, giỏ đi theo vì cùng sessionId); còn lại → POST /sessions/{id}/move-request tạo StaffCalls Type MOVE + ToTableId (UX_StaffCalls_OpenMove, upsertMove), máy quầy thẻ .move-card "Bàn A → Bàn B" + dòng "Bàn B đang trống / đang có n nhóm khác" (toTable.openGroups, groupsAt từ state.sessions) → POST /staff-calls/{id}/move (vị trí Phục vụ, ca mở) hoặc Bỏ qua; đơn có tableMove {fromTable, movedAt} suy từ SessionTableMoves (OUTER APPLY trong ordersRepo.ORDER_SELECT) → thẻ đơn nhãn .move-flag "Đổi bàn" 10 phút + nút "In phiếu bàn mới" = /pos/orders/{id}/receipt?mode=ticket (phiếu pha không giá); job close-idle-tables 5 phút đóng nhóm trống theo cài đặt idleCloseMinutes (tables.idle_close_minutes: 0 tắt / 15 / 30 / 60, mặc định 30, chỉ chủ quán; sp_CloseEmptySession @Reason IDLE_EMPTY, lỗi 50127); session.closed có reason EMPTY / IDLE_EMPTY → t-menu cất giỏ (carryCart) và nhóm mới lấy lại (takeCarriedCart); khách tự mở nhóm phát session.opened byGuest. Dùng khi sửa luồng quét QR, chuyển bàn, gọi nhân viên, thẻ đơn máy quầy, in phiếu, đóng bàn trống, cài đặt bàn trống, giỏ hàng khách, hoặc khi nhắc "đổi bàn", "quét bàn khác", "bàn ma", "bàn trống", "xin chuyển bàn", "phiếu pha", "nhãn đổi bàn".
---

# Mục đích

Ghi lại F-086 + F-087 (10/11/2026) để người làm sau không phá các bảo đảm: món không mang ra nhầm bàn, khách không mất giỏ, quầy không còn "bàn ma", không có hai yêu cầu chuyển bàn cho một nhóm, nhân viên biết bàn đích có người trước khi chuyển.

| Tài liệu   | Đường dẫn                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Quyết định | `tài-liệu/quyết-định/ADR-047-doi-ban-khi-quet.md` (D-206…D-210), `ADR-048-hoan-thien-doi-ban.md` (D-211…D-213)                   |
| Chức năng  | `tài-liệu/chức-năng/FEATURE-086.md` (AC-086-01…07, BR-124), `FEATURE-087.md` (AC-087-01…05, BR-125)                              |
| Việc       | `tài-liệu/công-việc/TASK-104.md`, `TASK-105.md`; kế hoạch `tài-liệu/kế-hoạch/TASK-104-plan.md`, `TASK-105-plan.md`              |
| Dữ liệu    | `cơ-sở-dữ-liệu/chuyển-đổi/0057_doi_ban_khi_quet.sql`; `sp_MoveSession`, `sp_CloseEmptySession` (thủ-tục/); F-087 không migration |

# Luật (đã chạy)

- **Quét QR** (`sessionService.scan`): có nhóm của chính điện thoại ở bàn vừa quét → `MEMBER` như cũ. Không có, mà có nhóm mở ở **bàn khác** (mở trong `ELSEWHERE_HOURS = 6` giờ) → `ELSEWHERE`, **không tạo nhóm**. `listOpenForClientElsewhere` sắp **nhóm đã gửi món trước** rồi mới tới nhóm mở gần nhất (tối đa 3): `elsewhere` = nhóm cần hỏi, `otherGroups` = phần còn lại, `openSessions` = các nhóm đang ở bàn vừa quét (cho "Gọi món riêng" → màn Gộp chung / Tạo đơn cá nhân).
- **Khách mở nhóm** (`scan` NEW, `createSession`) → `announceOpened` phát `session.opened` (room `staff`, `byGuest: true`) — máy quầy tải lại nhóm (lưới bàn + thẻ xin chuyển). Trước TASK-105 không phát (DEF-029).
- **Tự chuyển** (`move-here`): chỉ khi nhóm `OPEN`, không món (`Status NOT IN ('CANCELLED','VOIDED')`), một điện thoại — **SP kiểm lại trong khóa phiên** (UPDLOCK, cùng khóa với `sp_SubmitOrder`). Repo: truyền `{ clientToken }` (kể cả rỗng) là chế độ khách (`ByGuest = 1`, `MovedBy` NULL). Không cần ca mở. Giỏ đi theo vì giỏ lưu theo `sessionId` (`cf_cart_{sessionId}`), phía khách chỉ đổi `cf_session_{qr}`.
- **Nhờ quầy** (`move-request`): `staffCallsRepo.upsertMove` — một batch có khóa + chỉ mục duy nhất `UX_StaffCalls_OpenMove` → mỗi nhóm một yêu cầu đang chờ, đổi ý thì cập nhật `ToTableId`. Quầy "Chuyển" = `staffCallService.acceptMove` → `moveSession` (F-049: vị trí Phục vụ, ca mở); **mọi lần chuyển bàn** (khách / ngăn kéo / yêu cầu) đều tự đóng yêu cầu MOVE đang chờ trong `sp_MoveSession`.
- **Bàn đích có người** (F-087 D-213): `staffCallsRepo.SELECT` đếm nhóm chưa đóng ở `ToTableId` trừ nhóm xin chuyển → `toTable.openGroups` (dùng trong thông báo). Thẻ `.move-card` tính **trực tiếp** từ `state.sessions` (`groupsAt`) và `refreshSessionsSoon` gọi `renderCalls()` → tự cập nhật khi nhóm mở / đóng / đổi bàn. Chuyển tới bàn có người vẫn **bill riêng** (F-049) → thông báo nhắc "Thu chung với bàn khác" (F-057).
- **Không lẫn với Gọi nhân viên:** `openCalls` và chờ 60 giây chỉ tính `Type = 'STAFF'`; trang theo dõi không đặt `lastCall` cho sự kiện `MOVE`.
- **Nhãn "Đổi bàn" + phiếu pha** (F-087 D-211): `ordersRepo.ORDER_SELECT` có `OUTER APPLY` lần chuyển đầu tiên `MovedAt >= o.CreatedAt` (bàn lúc đặt) + `MAX(MovedAt)` → `mapOrder.tableMove` khi bàn lúc đặt ≠ bàn hiện tại. Máy quầy: `moveActive(o)` = đơn PENDING / PREPARING và trong `MOVE_FLAG_MS = 10 phút` từ lần chuyển cuối → `moveFlag(o)` trong `ticket` (có nút "In phiếu bàn mới") và `heldTicket` (chỉ nhãn). `ticketKey` có `movedAt` khi còn hiệu lực, đồng hồ 1 giây thấy `[data-move-until]` hết hạn → `renderBoard()`. `session.table_changed` → `loadAll()` rồi thông báo "còn n đơn chưa ra món, mang ra Bàn B". Phiếu: `printUrl('/pos/orders/{id}/receipt?mode=ticket')` → `pos-receipt.js renderSlip` (đọc `GET /api/orders/{id}`), `print.css .slip-table`.
- **Tự đóng bàn trống** (`closeIdleEmpty`, job `close-idle-tables` mỗi 5 phút): thời gian = cài đặt `idleCloseMinutes` (`tables.idle_close_minutes`, `IDLE_CLOSE_CHOICES = [0, 15, 30, 60]`, mặc định 30, đọc **mỗi lần chạy**; 0 → `{ off: true }`). Chỉ chủ quán đổi (không có trong `STORE_MGR_SETTINGS` → `403 OWNER_ONLY`). Điều kiện: không món, không yêu cầu đang chờ, `OpenedAt` và mọi `SessionClients.JoinedAt` cũ hơn N phút; SP kiểm lại (`NOT_IDLE` 50127 → bỏ qua). `CloseReason = 'IDLE_EMPTY'`, `ClosedBy` NULL.
- **Giữ giỏ** (`customer.js carryCart / takeCarriedCart`, `t-menu.js adoptCart / leaveClosed`): mọi lối nhóm bị đóng ở trang thực đơn (sự kiện `session.closed`, tải trang thấy `CLOSED`, gửi đơn bị `SESSION_CLOSED`) đều cất giỏ chưa gửi theo bàn (2 giờ) rồi về màn quét → nhóm mới lấy lại. Lời nhắn theo `reason` / `closeReason` (`IDLE_EMPTY` "Bàn trống lâu…", `EMPTY` "Quầy vừa đóng bàn trống…"). `t-entry.js` vào thẳng thực đơn thì **chuyển tiếp** lời nhắn (`setFlash` lại) — không thì khách không kịp đọc.

# Cạm bẫy đã gặp

- **Điện thoại có hai nhóm** (đã "Gọi món riêng" trước đó) → bản đầu hỏi về nhóm mở **gần nhất** (nhóm trống) và bỏ quên nhóm có món — tìm ra khi đi thử đóng vai khách. Luôn sắp nhóm có món trước (test AC-086-04).
- **Thêm `OUTER APPLY` mà quên đưa cột vào danh sách SELECT** của `ORDER_SELECT` → `tableMove` luôn `null`, chỉ test AC-087-01 bắt được. Lưu ý `ORDER_SELECT.replace('SELECT o.OrderId', …)` (đếm tổng) — đừng đổi chữ đầu câu.
- **Giờ lưu tới giây** (`DATETIME2(0)` cả `Orders.CreatedAt` lẫn `SessionTableMoves.MovedAt`): so `>=` để không bao giờ sót; đơn đặt cùng giây với lần chuyển có thể bị gắn nhãn dư (vô hại). Test phải **lùi giờ** đơn / lần chuyển, không thì kết quả tùy giây.
- **`POST /api/orders` trả `{ orderId, …, order }`** — thông tin đầy đủ (kể cả `tableMove`) nằm ở `.order`.
- **Thông báo "đang làm" cho đơn đang giữ** (khách hẹn, chưa làm) — sai; dùng "chưa ra món" (tìm ra khi đi thử 1920 px).
- **DEF-029:** khách quét QR tự mở nhóm không báo quầy → thẻ xin chuyển / lưới bàn đứng yên. Đã phát `session.opened` (`byGuest`); nếu thêm lối mở nhóm mới, nhớ gọi `announceOpened`.
- `String.prototype.replace` với chuỗi thay thế có `$\`` / `$'`chèn nhầm nội dung — dùng hàm thay thế`() => to` trong script sửa tệp.
- Chạy `npm test` khi máy chủ E2E (cổng 3100) đang chạy → CafeQrTest bị dọn giữa chừng; luôn chạy tuần tự. Đi thử lần hai trên cùng máy chủ E2E → dữ liệu cũ (bàn còn nhóm) làm hỏng kịch bản — khởi động lại máy chủ.
- Máy quầy dùng `announce` (đọc cho trình đọc màn hình) — nhớ import từ `ui.js`.
- Dữ liệu E2E (`seedDemo`) **không có** nhóm tùy chọn Size / Topping — muốn thấy dòng phụ trên phiếu pha thì dùng ghi chú món.

# Chưa làm

Đề xuất 4 của TASK-104 (chống gọi món từ xa bằng ảnh chụp mã QR) — chủ dự án chưa chọn.

# Kiểm thử

`npm run lint` · `npm run format:check` · `npm test` (`tests/table-change.test.js` — AC-086-01…05; `tests/table-move-followup.test.js` — AC-087-01…03) · `npm run test:e2e` (AC-086-06, 07; AC-087-04, 05) · `npm run trace -- --check` · `npm run db:migrate` (0057) · đi luồng thật: điện thoại 390 px + máy quầy 1366 / 1920 px (staff1) + chủ quán Cài đặt; F-087 dùng `page.clock` (đồng hồ giả) để thấy nhãn tự mất sau 10 phút.
