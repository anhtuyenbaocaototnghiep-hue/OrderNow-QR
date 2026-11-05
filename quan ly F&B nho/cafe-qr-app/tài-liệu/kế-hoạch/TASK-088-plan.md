# TASK-088 — Kế hoạch: chống sửa / xóa dữ liệu trái phép (F-071), ADR-029

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Sửa chấm công | `attendanceService.update` / `createManual`, quyền `attendance.edit` (MANAGER, ADMIN) | Trưởng ca sửa được bản ghi của chính mình trong ngày |
| Tài khoản duyệt ở quầy | `userService.resolveApproval` (giảm giá tay, hoàn tiền, xóa món, sổ quỹ) | Không giới hạn số lần sai |
| Đăng nhập | `POST /api/auth/login` + `loginLimiter` (5 / phút / máy) | Không khóa theo tên |
| Tự duyệt sổ quỹ | `cashService.review` / `void` | Đã chặn (người duyệt ≠ người ghi, trừ quản lý) |
| Nhật ký thao tác | `AuditLogs` + `TR_AuditLogs_ReadOnly` (0027) | Chặn sửa; xóa được bằng SQL |
| Xóa cứng | `grep DELETE` trong `src`, `thủ-tục`, `tests`, `kịch-bản` | Không chỗ nào xóa `Payments`, `Refunds`, `CashTransactions`, `Shifts`, `Attendance`, `OrderItemVoids`, `GiftDrinks`, `Alerts`; test reset bằng DROP TABLE |
| Tài khoản CSDL | `SUSER_NAME()` = `cafe_app`, `db_owner`, không `sysadmin` | Đề xuất tách (vận hành) |

## Thiết kế
- `AuthFailures (Kind, Username, ActorUserId, Ip, At)`; `authGuardService.assertNotLocked` trước khi kiểm mật khẩu, `recordFailure` khi sai; chạm ngưỡng → `alertService.onAuthLock` (cảnh báo tức thì, khóa trùng theo khung 15 phút).
- Trigger `AFTER DELETE` (không `INSTEAD OF` — bảng có khóa ngoại tự tham chiếu / nhiều bảng con): `IF EXISTS (deleted) THROW`.
- `assertNotSelf` trong `attendanceService`; màn Ca lọc `notSelf`.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Người dò khóa luôn chủ quán | Khóa theo tên + máy / tên + người đứng quầy, hạn 15 phút |
| Test cũ gõ sai mật khẩu duyệt nhiều lần | Mỗi file reset DB; số lần sai trong một file < 5 cho cùng khóa (đã rà) |
| Trigger chặn luồng app đang xóa | Đã rà mọi `DELETE` — không luồng nào xóa 8 bảng; job nhật ký chỉ xóa dòng quá 12 tháng |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
