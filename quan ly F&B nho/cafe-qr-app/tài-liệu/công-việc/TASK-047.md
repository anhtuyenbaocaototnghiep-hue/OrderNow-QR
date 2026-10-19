# TASK-047 — Chấm công, lịch làm, năng suất, nhật ký thao tác
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-035 (AC-035-01…06)
Nguồn: skill `advanced-features` §4 F-035 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-25, D-26 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Chấm công tự động theo đăng nhập / đăng xuất / đóng ca, sửa tay có lý do; lịch làm tuần có cảnh báo đi muộn / vắng; báo cáo năng suất theo người. Ghi nhật ký mọi thao tác đổi tiền / kho / quyền / giá (trước / sau), chỉ đọc, giữ 12 tháng.

## Phạm vi
- Migration `0027_cham_cong_audit.sql` (`Attendance`, `Rosters`, `AuditLogs`; trigger `TR_AuditLogs_ReadOnly` chặn UPDATE — 50160).
- SP:
  - `sp_ClockIn` (file `sp_Attendance.sql`): khóa theo người dùng, đăng nhập đồng thời chỉ tạo một bản ghi mở;
  - `sp_CloseShift`: chấm công ra cho người đóng ca;
  - `sp_DeleteUser`: chấm công / lịch làm tính là lịch sử.
- Backend:
  - `attendanceService` / `attendanceRepo` (sửa tay: lý do bắt buộc, trưởng ca chỉ trong ngày → `403 ATTENDANCE_NOT_TODAY`, chồng giờ → `409 ATTENDANCE_OVERLAP`);
  - middleware `src/middleware/audit.js` + `auditRepo` (bảng luật, che mật khẩu / token, SĐT còn 3 số cuối, ghi sau khi response xong);
  - route `POST /api/auth/logout`, `/api/attendance*`, `/api/admin/rosters*` (+ `copy-week`), `GET /api/admin/reports/productivity`, `/api/admin/audit-logs` (+ `facets`).
- Job: `attendance-autoclose` mỗi 15 phút, `audit-retention` 03:00 (xóa nhật ký quá 12 tháng theo lô).
- UI:
  - Ca & hoàn tiền: thẻ "Chấm công hôm nay" (trưởng ca / quản lý);
  - trang mới `/admin/staff` "Nhân sự & chấm công" (tab Chấm công, Lịch làm tuần — kéo thả ca, chép tuần trước; Năng suất);
  - trang mới `/admin/audit` "Nhật ký thao tác".

## Phụ thuộc
TASK-045 (quyền `attendance.edit`), TASK-046 (đóng ca, sổ quỹ ghi nhật ký), TASK-037 (bộ lập lịch).

## Validation
`finance.test.js` → "Chấm công, lịch làm, năng suất (F-035)" (6 test, gồm đăng nhập đồng thời 5 lần) và "Nhật ký thao tác (F-035, D-26)" (3 test); `finance-unit.test.js` → "Luật nhật ký thao tác (D-26)" (3 test), thời hạn token; bất biến `MANY_OPEN_ATTENDANCE`; E2E "trưởng ca + sổ quỹ…" (kéo ca, nhật ký, đăng xuất); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-035, ADR-006); hướng dẫn `chức-năng-mới/19-chấm-công-lịch-làm-nhật-ký.md`.
