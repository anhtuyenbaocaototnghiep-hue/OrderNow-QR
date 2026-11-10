# TASK-105 — Kế hoạch: hoàn thiện đổi bàn (F-087, ADR-048)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Đơn sau khi chuyển bàn | `sp_MoveSession` cập nhật `Orders.TableId` cả nhóm; lịch sử `SessionTableMoves (MoveId, SessionId, FromTableId, ToTableId, MovedAt DATETIME2(0))`, chỉ mục `IX_Moves_Session (SessionId, MoveId)` | Thẻ đơn chỉ đổi tên bàn, không có dấu hiệu đổi bàn |
| In | `print.js printUrl` (khung ẩn, `autoprint=1&embed=1&w=`), trang `pos/receipt.html` + `pos-receipt.js` (phiên / đơn mang đi / phần chia bill) | **Không có phiếu pha** — chỉ hóa đơn / tạm tính |
| Thẻ đơn máy quầy | `pos-dashboard.js ticket / heldTicket`, khóa vẽ lại `ticketKey`, đồng hồ 1 giây `setInterval` | — |
| Tự đóng bàn trống | `sessionService.closeIdleEmpty(IDLE_EMPTY_MINUTES = 30)`, job `close-idle-tables` | Cố định 30 phút |
| Cài đặt | `settingsService` (map key ↔ tên), `PUT /api/admin/settings` (zod ở `routes/operations.js`), `STORE_MGR_SETTINGS`, `admin-settings.js` | — |
| Thẻ xin chuyển | `staffCallsRepo.SELECT`, `pos-dashboard.js renderCalls` (`.move-card`) | Không biết bàn đích có người |
| Nhóm mở | `session.opened` chỉ phát ở `openTable` (nhân viên) | Khách quét QR mở nhóm → quầy không được báo |

## Thiết kế
- `ordersRepo.ORDER_SELECT`: `OUTER APPLY` lần chuyển đầu tiên có `MovedAt >= o.CreatedAt` (bàn lúc đặt) + `MAX(MovedAt)` (lần cuối); `mapOrder.tableMove` khi bàn lúc đặt ≠ bàn hiện tại. Không thêm cột.
- `settingsService`: `IDLE_CLOSE_CHOICES = [0, 15, 30, 60]`, `idleCloseMinutes` (`tables.idle_close_minutes`, mặc định 30); zod `idleCloseMinutes` (chủ quán); `closeIdleEmpty()` đọc cài đặt, 0 → `{ off: true }`; nhãn job.
- `staffCallsRepo.SELECT`: đếm nhóm chưa đóng ở bàn đích (trừ nhóm xin chuyển) → `toTable.openGroups`.
- `sessionService.announceOpened` ở `scan` (NEW) + `createSession` → `session.opened` (`byGuest: true`).
- Máy quầy: `moveFlag(o)` (nhãn + nút in), `moveActive` 10 phút, khóa `ticketKey` + đồng hồ 1 giây gỡ nhãn khi hết hạn; thông báo khi `session.table_changed` còn đơn chưa ra món; `moveInfo(c)` + `groupsAt` (từ `state.sessions`), `renderCalls()` sau mỗi lần tải lại nhóm; thông báo "Thu chung" khi chuyển tới bàn có người.
- `pos-receipt.js mode=ticket` (`renderSlip`), `print.css .slip-table`; `admin-settings.js` thẻ "Bàn trống".

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Giờ lưu tới giây → đơn đặt cùng giây với lần chuyển | So `>=`: không bao giờ sót nhãn; nhãn dư chỉ nhắc mang ra bàn hiện tại (vô hại). Test lùi giờ để chắc chắn |
| Câu lệnh đơn chậm hơn vì `OUTER APPLY` | Dùng chỉ mục `IX_Moves_Session`; chỉ nhóm có lịch sử chuyển mới có dòng |
| Quản lý cửa hàng đổi thời gian tự trả bàn | Không thêm vào `STORE_MGR_SETTINGS` → `403 OWNER_ONLY` (test) |
| Thẻ xin chuyển ghi sai khi nhóm mở / đóng | Tính từ danh sách nhóm đang mở, vẽ lại sau mỗi lần tải lại; khách mở nhóm giờ phát `session.opened` (DEF-029) |
| Đơn đang giữ (chưa làm) bị báo "đang làm" (tìm ra khi đi thử) | Câu thông báo "còn n đơn chưa ra món"; đơn đang giữ chỉ nhãn, không nút in |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · đi luồng thật: điện thoại 390 + máy quầy 1366 / 1920 (staff1) + chủ quán Cài đặt (10 bước, có đồng hồ giả để thấy nhãn tự mất sau 10 phút).
