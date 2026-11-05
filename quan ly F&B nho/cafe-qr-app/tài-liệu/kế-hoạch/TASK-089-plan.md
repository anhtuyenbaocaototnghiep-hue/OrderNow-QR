# TASK-089 — Kế hoạch: chấm công nhiều người (F-072) + tính lương (F-073), ADR-030

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Chấm công | `attendanceService.onLogin` / `onLogout` / `autoClose`, `sp_ClockIn`, `sp_CloseShift` (chấm ra người đóng ca) | Theo đăng nhập — một máy một người |
| Lịch làm | `Rosters (WorkDate, StartTime, EndTime)`, `attendanceService.rosters` (trễ > 15 phút / vắng) | Có, chưa dùng để tính tiền |
| Duyệt ở quầy | `userService.resolveApproval` (F-071 khóa tạm) | Trưởng ca tự duyệt trong ngưỡng |
| Sổ quỹ | `sp_CreateCashTxn` (danh mục cần duyệt → PENDING), `cashService.review` (không tự duyệt khoản mình ghi) | "Lương tạm ứng" không có người nhận, `IsExpense = 1` |
| Lãi/lỗ | `pnlService.report` / `finalize`, `pnlRepo.daily` | Lương khai tay ở Chi phí cố định |
| Nhật ký | `AuditLogs.AfterJson = { input, result }` | Có sẵn — dùng làm lịch sử sửa giờ công |

## Thiết kế
- Hàm thuần `domain/payroll.js` (`rosterWindow`, `pickRoster`, `evaluate`, `splitMinutes`, `intervalPay`, `payLine`, `splitByMinutes`, `pinProblem`) — tính được, test được không cần DB.
- PIN thao tác tiền qua header `X-Actor-Pin`, gắn vào user của request bằng `Symbol` (không lọt JSON / nhật ký); `api.js` tự hỏi PIN khi gặp `403 PIN_REQUIRED` rồi gửi lại — không phải sửa từng hộp thoại.
- Bảng lương nháp tính trực tiếp; chốt lưu ảnh chụp `PayrollLines`; khóa tháng kiểm ở `attendanceService` (sửa, thêm, quyết định, báo sai) và `payrollService` (cộng trừ).
- Test cũ giữ chế độ cũ: `testDb.js` / `e2e-server.js` ghi `attendance.mode = LOGIN`, `security.money_pin = false`.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Giờ DATETIME2(0) làm tròn lên → người vừa chấm vào không có trong danh sách đóng ca | Ca đang mở lấy mọi lần chấm công từ lúc mở ca (không so với "bây giờ") — test AC-072-06 bắt được |
| Hỏi PIN làm hỏng luồng thu tiền cũ | Hỏi trong `api.js` rồi gửi lại cùng request; cài đặt tắt được; quản lý miễn |
| Tạm ứng bị tính hai lần (chi phí + lương) | Lãi/lỗ bỏ `SALARY_ADVANCE` khỏi chi phí khi đã có hồ sơ lương; nhắc xóa lương ở Chi phí cố định |
| Sửa giờ sau khi trả lương | Khóa tháng đã chốt; mở lại có lý do + nhật ký |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
