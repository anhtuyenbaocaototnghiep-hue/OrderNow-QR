# TASK-090 — Kế hoạch: quên PIN, nhắc chấm công, nhân viên báo quên chấm công (F-072 bổ sung, ADR-031)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Khóa PIN | `authGuardService` (`AuthFailures`, khóa theo tên bị thử + người đứng quầy, 5 lần / 15 phút) | Đặt PIN mới / quản lý xóa PIN **không** xóa lần sai → vẫn bị khóa tới hết 15 phút |
| Đặt PIN | `pinService.setOwnPin` (`POST /api/auth/pin`, phiên của chính mình) | Người chưa có PIN phải đăng xuất máy quầy, đăng nhập bằng tài khoản mình để đặt; ô ở màn chung bị khóa (`disabled`) |
| Bàn phím PIN | `pin-pad.js` | Không chỉ cách xử lý khi quên PIN |
| Phát hiện quên chấm vào | `attendanceService.rosters` (`ABSENT` sau 15 phút), `payrollService.absences` | Chỉ biết sau (lịch ghi "Vắng"), không nhắc |
| Quên hẳn một ngày | `attendanceService.dispute` (báo sai cần `attId`) | Không có dòng chấm công → không bấm "Báo sai" được |
| Việc chờ | `payrollService.compute().pending` (chặn chốt) | Chỉ từ lần chấm công đã có |

## Thiết kế
- **PIN:** `setPinWithPassword(target, body, guard)` dùng chung; đặt ở màn chung (`setPinAtKiosk`) đếm sai mật khẩu vào khóa `LOGIN` (tên + IP) — vừa không mở đường dò mật khẩu thứ hai, vừa không bị khóa PIN đang có chặn mất lối thoát. `authGuard.clearFailures('PIN', username)` sau khi đặt PIN mới / quản lý xóa.
- **Nhắc:** `attendanceService.reminders()` — hàm đọc (lịch hôm qua + hôm nay, chấm công 36 giờ), dùng lại `rosterWindow` của `domain/payroll.js`; máy quầy gọi mỗi phút (`pos-shell.js`), ẩn theo "chữ ký" danh sách trong `sessionStorage`.
- **Báo quên:** bảng mới `MissedPunches` (không sửa `AttendanceDisputes` — nó gắn với một `AttId`). Duyệt trong một giao dịch SQL (giữ phiếu → tạo `Attendance` `MANUAL` → gắn `AttId`) để hai người bấm cùng lúc chỉ tạo một lần chấm công. Việc chờ `MISSED_PUNCH` thêm vào `compute()` → chặn chốt như việc chờ khác. Lần chấm công tạo ra đi qua đúng luật tính giờ ADR-030 (cắt theo lịch, làm thêm chờ duyệt…).

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Dùng "đặt PIN ở màn chung" để dò mật khẩu | Tính chung khóa đăng nhập (10 lần / 15 phút tên + máy), không cho tài khoản quản lý, có cảnh báo `AUTH_LOCK` sẵn |
| Nhân viên báo khống giờ | Chỉ là yêu cầu — không tự tính lương; quản lý duyệt / sửa giờ / không duyệt; 7 ngày; không trùng; không xóa được; nhật ký thao tác |
| Dải nhắc làm phiền khi người đó nghỉ có báo trước | Nút **Ẩn** (tới khi danh sách đổi); không nhắc người làm ngoài lịch; quản lý xóa lịch là hết |
| Duyệt hai lần / tạo hai lần chấm công | `UPDATE … WHERE Status = 'PENDING'` trong giao dịch; duyệt lại → `404` |
| Giờ VN / ca qua đêm | `rosterWindow` sẵn có; giờ ra nhỏ hơn giờ vào = hôm sau (giao diện); test dựng lịch theo giờ VN của "bây giờ" |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm — migration 0050).
