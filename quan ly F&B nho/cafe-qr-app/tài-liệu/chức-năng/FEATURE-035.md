# FEATURE-035 — Chấm công, lịch làm, năng suất, nhật ký thao tác

> **Nguồn:** skill `advanced-features` §4 F-035. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-25, D-26.

- **Status:** CONFIRMED (ADR-006 D-25, D-26) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:**
  - hệ thống (chấm công tự động, ghi nhật ký);
  - MANAGER (sửa chấm công trong ngày);
  - ADMIN (lịch làm, năng suất, nhật ký, sửa mọi ngày).
- **Màn hình:**
  - **Quầy → Ca & hoàn tiền:** thẻ "Chấm công hôm nay" (trưởng ca / quản lý), nút Sửa / Thêm chấm công.
  - **Quản lý → Nhân sự & chấm công:**
    - tab **Chấm công**: lọc ngày / người, tổng giờ;
    - tab **Lịch làm tuần**: lưới người × ngày, kéo thả ca sang ô khác, + thêm ca, chép lịch tuần trước, cảnh báo đi muộn / vắng;
    - tab **Năng suất**.
  - **Quản lý → Nhật ký thao tác:** chỉ đọc, lọc, xem trước / sau.
- **Dữ liệu:** migration `0027_cham_cong_audit.sql`:
  - `Attendance(UserId, ClockIn, ClockOut, ShiftId, Source LOGIN|MANUAL, EditedBy, EditReason, EditedAt)`;
  - `Rosters(UserId, WorkDate, StartTime, EndTime, Note, CreatedBy)`;
  - `AuditLogs(AuditId BIGINT, UserId (không FK), UserName, Role, Action, Entity, EntityId, BeforeJson, AfterJson, Ip, UserAgent, At)`;
  - trigger `TR_AuditLogs_ReadOnly` chặn mọi UPDATE (50160).
- **SP:**
  - `sp_ClockIn`: khóa theo người dùng → đăng nhập đồng thời chỉ tạo một bản ghi mở;
  - `sp_CloseShift`: chấm công ra cho người đóng ca;
  - `sp_DeleteUser`: chấm công / lịch làm tính là lịch sử.
- **Job:**
  - `attendance-autoclose`: mỗi 15 phút;
  - `audit-retention`: 03:00, xóa nhật ký quá 12 tháng theo lô 5.000 dòng.

## Quy tắc

1. **Chấm công tự động:**
   - đăng nhập (nhân viên, trưởng ca) → `ClockIn` nếu chưa có bản ghi mở. Quản lý không tự chấm — thêm tay nếu cần.
   - Bản ghi mở quá 12 giờ (quên đăng xuất) → đóng tại `ClockIn + 12 giờ` rồi tạo bản ghi mới.
   - Đăng xuất (`POST /api/auth/logout`) hoặc đóng ca → `ClockOut`.
   - Token hết hạn (`JWT_EXPIRES_IN`, mặc định 8 giờ) → job đóng tại `ClockIn + thời hạn`.
2. **Sửa tay:**
   - bắt buộc lý do (400 nếu thiếu);
   - trưởng ca chỉ sửa / thêm bản ghi trong ngày hôm nay (giờ VN), khác ngày → `403 ATTENDANCE_NOT_TODAY`; quản lý sửa mọi ngày;
   - không cho chồng giờ với bản ghi khác của cùng người (`409 ATTENDANCE_OVERLAP`);
   - một lần không quá 24 giờ, không ở tương lai;
   - ghi người sửa, lý do và nhật ký thao tác.
3. **Lịch làm:**
   - giờ kết thúc nhỏ hơn giờ bắt đầu = ca qua nửa đêm.
   - Trạng thái mỗi ca:
     - `LATE`: lần chấm công vào đầu tiên trong ngày muộn hơn giờ bắt đầu quá 15 phút;
     - `ABSENT`: đã qua giờ bắt đầu 15 phút mà chưa chấm;
     - `ON_TIME`, `UPCOMING`.
   - Chép tuần bỏ qua ca đã có (cùng người, ngày, giờ bắt đầu).
4. **Năng suất** trong kỳ:
   - tiền thu = Σ `Payments.AmountDue` theo `ReceivedBy`;
   - đơn hoàn tất theo `CompletedBy`;
   - giờ làm = phần chấm công giao với kỳ;
   - tiền thu / giờ.
5. **Nhật ký thao tác** (middleware `src/middleware/audit.js`, theo bảng luật):
   - ghi mọi request đổi dữ liệu dưới `/api/admin/*` và các route quầy đổi tiền / kho / ca: hoàn tiền, thu tiền, đơn mang đi, hủy đơn, mở / đóng ca, sổ quỹ, sơ chế, hủy hàng, hủy lô, nhận PO, điều chỉnh / kiểm kê của trưởng ca, chấm công, tạm ngưng nhận đơn.
   - Không ghi tiếp nhận / hoàn tất / gọi món thường.
   - "Trước" = ảnh chụp dòng DB (FOR JSON) trước khi xử lý; "sau" = dữ liệu gửi lên + kết quả.
   - Chỉ ghi khi thành công, sau khi response xong (sau commit).
   - Bỏ mọi khóa chứa password / hash / token / secret / otp; số điện thoại chỉ còn 3 số cuối; ảnh chỉ ghi kích thước.
   - ADMIN chỉ xem; không sửa / xóa qua ứng dụng.

## API

| Method & path | Quyền / ghi chú |
| --- | --- |
| `POST /api/auth/logout` | nhân viên → `{ clockedOut }` |
| `GET /api/attendance/me` | nhân viên — bản ghi đang mở |
| `GET /api/attendance?from&to&userId` · `GET /api/attendance/users` | `attendance.edit` |
| `POST /api/attendance` | `{ userId, clockIn, clockOut?, reason }` (ISO có múi giờ) |
| `PUT /api/attendance/{id}` | `{ clockIn, clockOut?, reason }` |
| `GET /api/admin/rosters?from&to` · `POST` · `PUT/DELETE …/{id}` · `POST /api/admin/rosters/copy-week {fromWeek,toWeek}` | ADMIN |
| `GET /api/admin/reports/productivity?from&to` | ADMIN |
| `GET /api/admin/audit-logs?from&to&userId&entity&entityId&action&page&pageSize` · `GET /api/admin/audit-logs/facets` | ADMIN |

## Acceptance Criteria

- AC-035-01: Đăng nhập → có `ClockIn`; đăng nhập lại / đồng thời 5 lần → vẫn một bản ghi mở; đăng xuất / đóng ca → `ClockOut`.
- AC-035-02: Sửa chấm công thiếu lý do → 400; trưởng ca sửa ngày trước → 403; chồng giờ → 409.
- AC-035-03: Hoàn tiền → đúng một dòng nhật ký `payment.refund` có trước / sau.
- AC-035-04: Nhật ký không chứa `PasswordHash`, mật khẩu, token; UPDATE `AuditLogs` bị chặn.
- AC-035-05: Lịch làm cảnh báo vắng / đi muộn > 15 phút; kéo ca sang ngày khác cập nhật đúng.
- AC-035-06: Bất biến `MANY_OPEN_ATTENDANCE`: mỗi người tối đa một lần chấm công đang mở.

## Bằng chứng

- `tests/finance.test.js`:
  - "Chấm công, lịch làm, năng suất (F-035)": 6 test;
  - "Nhật ký thao tác": 3 test.
- `tests/finance-unit.test.js` → luật nhật ký, che dữ liệu, thời hạn token.
- E2E "trưởng ca + sổ quỹ…" (kéo ca, nhật ký, đăng xuất).
