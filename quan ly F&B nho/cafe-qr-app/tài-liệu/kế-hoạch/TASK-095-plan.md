# TASK-095 — Kế hoạch: phân quyền rõ ràng, đợt 2 — vị trí và cấp nhân viên (F-078, ADR-036)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Tài khoản | `Users` (Role…), `usersRepo` (`COLS`, `map`, OUTPUT trong create / update / setActive), `userService.create/update`, `POST/PUT /api/admin/users` | Không có vị trí / cấp |
| Việc ở quầy | `staff.js` (router dùng chung `requireStaff`), `ops.js`, `finance.js`, `giftDrinks.js`, `offlineSales.js` | Mọi nhân viên làm mọi việc |
| Giảm giá tay | `discountLimits(role)` qua `takeawayTotals` / `sessionTotals` / `splitTotals` (truyền `user.role`) | Theo vai |
| Chi quỹ | `cashService.create` → `sp_CreateCashTxn` (`@Threshold`: `Amount > Threshold` → PENDING) | Ngưỡng chung |
| Sửa / xóa món | `voidService.approverFor(user, body, needed)` (needed = đơn đã tiếp nhận / đã pha) | Đơn chờ: nhân viên tự làm |
| Máy quầy | `pos-shell.js` (menu, mở ca), `pos-dashboard.js` (phiếu, thẻ bàn, hộp bill) | Như nhau cho mọi nhân viên |

## Thiết kế
- Migration 0054: `Positions` (CSV, NULL = mọi vị trí), `StaffLevel` (mặc định OFFICIAL). Vai khác STAFF luôn NULL / OFFICIAL.
- `requirePosition` (middleware sau `requireStaff`) — chặn trước cả kiểm dữ liệu; `.positions` cho Tra cứu API.
- Thử việc: `discountRole(user)` thay `user.role` ở 6 chỗ tính giá; ngưỡng chi 0; `approverFor` luôn cần duyệt.
- Giao diện: `roles.js` (`hasPosition`, `canOpenPosPage`), menu + chuyển trang ở `mountPosShell`, nút theo vị trí ở Đơn hàng, ô vị trí / cấp ở Tài khoản.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Quán nhỏ một người làm hết bị chặn | Để trống vị trí = mọi việc (mặc định, tài khoản cũ) |
| Gửi bù đơn mất mạng bị chặn khi người đăng nhập máy không phải thu ngân | Không gắn vị trí ở `/offline-sales` |
| Không ai mở ca (chỉ có pha chế, phục vụ đăng nhập) | Trưởng ca trở lên không bị giới hạn; dải nhắc "Nhờ thu ngân mở ca" |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
