---
name: doi-ban-khi-quet
description: Khách đổi bàn khi quét QR của cafe-qr-app (F-086, ADR-047 D-206…D-210, BR-124, TASK-104, migration 0057) — POST /api/sessions/scan trả state ELSEWHERE khi điện thoại có nhóm mở ở bàn khác (6 giờ, nhóm đã gửi món trước, otherGroups); nhóm không món + một điện thoại + OPEN → POST /sessions/{id}/move-here (sp_MoveSession @ByGuest, @ClientToken, lỗi 50125/50126, giỏ đi theo vì cùng sessionId); còn lại → POST /sessions/{id}/move-request tạo StaffCalls Type MOVE + ToTableId (UX_StaffCalls_OpenMove, upsertMove), máy quầy thẻ .move-card "Bàn A → Bàn B" → POST /staff-calls/{id}/move (vị trí Phục vụ, ca mở) hoặc Bỏ qua; job close-idle-tables 5 phút đóng nhóm trống 30 phút (sp_CloseEmptySession @Reason IDLE_EMPTY, lỗi 50127); session.closed có reason EMPTY / IDLE_EMPTY → t-menu cất giỏ (carryCart) và nhóm mới lấy lại (takeCarriedCart). Dùng khi sửa luồng quét QR, chuyển bàn, gọi nhân viên, đóng bàn trống, giỏ hàng khách, hoặc khi nhắc "đổi bàn", "quét bàn khác", "bàn ma", "bàn trống", "xin chuyển bàn".
---

# Mục đích

Ghi lại F-086 (10/11/2026) để người làm sau không phá các bảo đảm: món không mang ra nhầm bàn, khách không mất giỏ, quầy không còn "bàn ma", không có hai yêu cầu chuyển bàn cho một nhóm.

| Tài liệu   | Đường dẫn                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Quyết định | `tài-liệu/quyết-định/ADR-047-doi-ban-khi-quet.md` (D-206…D-210)                                           |
| Chức năng  | `tài-liệu/chức-năng/FEATURE-086.md` (US-086-1/2, AC-086-01…07, BR-124)                                    |
| Việc       | `tài-liệu/công-việc/TASK-104.md`, kế hoạch `tài-liệu/kế-hoạch/TASK-104-plan.md`                           |
| Dữ liệu    | `cơ-sở-dữ-liệu/chuyển-đổi/0057_doi_ban_khi_quet.sql`; `sp_MoveSession`, `sp_CloseEmptySession` (thủ-tục/) |

# Luật (đã chạy)

- **Quét QR** (`sessionService.scan`): có nhóm của chính điện thoại ở bàn vừa quét → `MEMBER` như cũ. Không có, mà có nhóm mở ở **bàn khác** (mở trong `ELSEWHERE_HOURS = 6` giờ) → `ELSEWHERE`, **không tạo nhóm**. `listOpenForClientElsewhere` sắp **nhóm đã gửi món trước** rồi mới tới nhóm mở gần nhất (tối đa 3): `elsewhere` = nhóm cần hỏi, `otherGroups` = phần còn lại, `openSessions` = các nhóm đang ở bàn vừa quét (cho "Gọi món riêng" → màn Gộp chung / Tạo đơn cá nhân).
- **Tự chuyển** (`move-here`): chỉ khi nhóm `OPEN`, không món (`Status NOT IN ('CANCELLED','VOIDED')`), một điện thoại — **SP kiểm lại trong khóa phiên** (UPDLOCK, cùng khóa với `sp_SubmitOrder`). Repo: truyền `{ clientToken }` (kể cả rỗng) là chế độ khách (`ByGuest = 1`, `MovedBy` NULL). Không cần ca mở. Giỏ đi theo vì giỏ lưu theo `sessionId` (`cf_cart_{sessionId}`), phía khách chỉ đổi `cf_session_{qr}`.
- **Nhờ quầy** (`move-request`): `staffCallsRepo.upsertMove` — một batch có khóa + chỉ mục duy nhất `UX_StaffCalls_OpenMove` → mỗi nhóm một yêu cầu đang chờ, đổi ý thì cập nhật `ToTableId`. Quầy "Chuyển" = `staffCallService.acceptMove` → `moveSession` (F-049: vị trí Phục vụ, ca mở); **mọi lần chuyển bàn** (khách / ngăn kéo / yêu cầu) đều tự đóng yêu cầu MOVE đang chờ trong `sp_MoveSession`.
- **Không lẫn với Gọi nhân viên:** `openCalls` và chờ 60 giây chỉ tính `Type = 'STAFF'`; trang theo dõi không đặt `lastCall` cho sự kiện `MOVE`.
- **Tự đóng bàn trống** (`closeIdleEmpty`, job `close-idle-tables`): không món, không yêu cầu đang chờ, `OpenedAt` và mọi `SessionClients.JoinedAt` cũ hơn `IDLE_EMPTY_MINUTES = 30` phút; SP kiểm lại (`NOT_IDLE` 50127 → bỏ qua). `CloseReason = 'IDLE_EMPTY'`, `ClosedBy` NULL.
- **Giữ giỏ** (`customer.js carryCart / takeCarriedCart`, `t-menu.js adoptCart / leaveClosed`): mọi lối nhóm bị đóng ở trang thực đơn (sự kiện `session.closed`, tải trang thấy `CLOSED`, gửi đơn bị `SESSION_CLOSED`) đều cất giỏ chưa gửi theo bàn (2 giờ) rồi về màn quét → nhóm mới lấy lại. Lời nhắn theo `reason` / `closeReason` (`IDLE_EMPTY` "Bàn trống lâu…", `EMPTY` "Quầy vừa đóng bàn trống…"). `t-entry.js` vào thẳng thực đơn thì **chuyển tiếp** lời nhắn (`setFlash` lại) — không thì khách không kịp đọc.

# Cạm bẫy đã gặp (10/11/2026)

- **Điện thoại có hai nhóm** (đã "Gọi món riêng" trước đó) → bản đầu hỏi về nhóm mở **gần nhất** (nhóm trống) và bỏ quên nhóm có món — tìm ra khi đi thử đóng vai khách. Luôn sắp nhóm có món trước (test AC-086-04).
- `String.prototype.replace` với chuỗi thay thế có `$\`` / `$'`chèn nhầm nội dung — dùng hàm thay thế`() => to` trong script sửa tệp.
- Chạy `npm test` khi máy chủ E2E (cổng 3100) đang chạy → CafeQrTest bị dọn giữa chừng; luôn chạy tuần tự.
- Máy quầy dùng `announce` (đọc cho trình đọc màn hình) — nhớ import từ `ui.js`.

# Chưa làm (đề xuất, chờ chủ dự án)

Xem mục "Đề xuất thêm" trong `tài-liệu/công-việc/TASK-104.md`.

# Kiểm thử

`npm run lint` · `npm run format:check` · `npm test` (`tests/table-change.test.js` — AC-086-01…05) · `npm run test:e2e` (AC-086-06, 07) · `npm run trace -- --check` · `npm run db:migrate` (0057) · đi luồng thật: điện thoại 390 px + máy quầy 1366 px, 6 tình huống (chưa gửi món → tự chuyển; đã gửi → nhờ quầy → Chuyển; Gọi món riêng; Bỏ qua; hai người chung nhóm + Quay lại; quầy đóng bàn trống khi khách đang chọn).
