# TASK-104 — Kế hoạch: khách đổi bàn khi quét QR (F-086, ADR-047)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Quét QR | `sessionService.scan` → `findOpenForClient(tableId, clientToken)` chỉ tìm ở **bàn vừa quét**; trống → `createWithClient`, có nhóm khác → `OCCUPIED` | Không biết điện thoại đang có nhóm ở bàn khác |
| Giỏ | `cart.js` lưu `cf_cart_{sessionId}` (localStorage); `customer.js` lưu `cf_session_{qr}` | Giỏ theo nhóm — chuyển bàn (cùng nhóm) thì giỏ đi theo; nhóm mới thì giỏ trống |
| Chuyển bàn | `sp_MoveSession` (F-049), `POST /api/sessions/{id}/move` (vị trí Phục vụ, ca mở), sự kiện `session.table_changed` + `followTable` phía khách | Chỉ nhân viên chuyển; `SessionTableMoves.MovedBy NOT NULL` |
| Gọi nhân viên | `StaffCalls` (`Type CHECK ('STAFF')`), `staffCallService`, dải `#call-strip` ở `pos-dashboard.js renderCalls` | Một loại; chờ 60 giây/nhóm tính mọi yêu cầu |
| Đóng bàn trống | `sp_CloseEmptySession` (`ClosedBy` nhận NULL), nút "Đóng bàn trống" | Chỉ đóng tay; khách đang chọn món mất giỏ (về màn quét, nhóm mới) |
| Job | `jobs/index.js registerJob`, chạy tay `POST /api/admin/jobs/{name}/run` | — |

## Thiết kế
- Migration 0057 (chỉ thêm / nới): `StaffCalls.ToTableId` + `Type IN ('STAFF','MOVE')` + `CK_StaffCalls_MoveTarget` + `UX_StaffCalls_OpenMove`; `SessionTableMoves.MovedBy NULL` + `ByGuest` + `CK_Moves_Actor`; `Sessions.CloseReason`.
- `sp_MoveSession @ByGuest/@ClientToken` (kiểm thành viên, chưa gọi thanh toán, không món, một điện thoại — trong khóa phiên) + tự đóng yêu cầu MOVE; `sp_CloseEmptySession @Reason/@IdleMinutes` (kiểm lại không hoạt động trong khóa).
- `sessionsRepo.listOpenForClientElsewhere` (nhóm đã gửi món trước), `idleEmptySessionIds`; `staffCallsRepo.upsertMove` (một batch có khóa + chỉ mục duy nhất), cooldown chỉ tính `STAFF`.
- `sessionService.scan` (ELSEWHERE), `moveHere`, `closeIdleEmpty`; `staffCallService.requestMove`, `acceptMove`; route public `move-here`, `move-request`, staff `staff-calls/{id}/move` (Phục vụ); job `close-idle-tables` (5 phút).
- Giao diện: `t-entry.js showElsewhere`, `t-track.js moveStatus`, `customer.js carryCart / takeCarriedCart`, `t-menu.js adoptCart / leaveClosed`, `pos-dashboard.js` thẻ `.move-card` + `acceptMove`.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Khách tự chuyển nhóm có món → món mang ra nhầm bàn | SP chặn (50126) — chỉ nhóm không món, một điện thoại; còn lại nhờ quầy |
| Điện thoại có nhiều nhóm → hỏi nhầm nhóm trống (tìm ra khi đi thử) | Sắp xếp nhóm đã gửi món trước; các nhóm khác là lựa chọn phụ (test AC-086-04) |
| Tự đóng nhóm khách đang chọn món | Tính theo lần cuối có người vào nhóm, 30 phút; giữ giỏ + mở lại bàn (D-210); bỏ qua nhóm có yêu cầu đang chờ |
| Bấm "Nhờ quầy" hai lần → hai yêu cầu | `upsertMove` có khóa + chỉ mục duy nhất `UX_StaffCalls_OpenMove` |
| Máy chủ demo của chủ dự án chạy bản cũ khi áp 0057 | Chỉ thêm cột / nới ràng buộc, tham số thủ tục mới có mặc định → bản cũ vẫn chạy |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0057) · đi luồng thật điện thoại 390 + máy quầy 1366 (6 tình huống).
