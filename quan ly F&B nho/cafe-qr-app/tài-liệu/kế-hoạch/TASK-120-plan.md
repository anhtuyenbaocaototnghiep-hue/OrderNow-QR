# TASK-120 — Kế hoạch: lương không tự duyệt cho mình, duyệt lại khi sửa giờ, giữ lịch sử (F-098, ADR-061)

## Các bước

### 1. CSDL — `cơ-sở-dữ-liệu/chuyển-đổi/0060_luong_khong_tu_duyet.sql`

Chỉ thêm, không đổi dữ liệu cũ:

- `PayrollAdjustments.DeletedAt`, `DeletedBy` (→ `Users`), kèm `TR_PayrollAdjustments_NoDelete`;
- `PayrollLines.PaidAmount` (dòng đã trả được điền bằng `NetPay`);
- bảng `PayrollRunVersions`, kèm `TR_PayrollRunVersions_NoDelete`;
- `CK_Alerts_Kind` thêm `PAYROLL_CHANGE`.

### 2. Kho dữ liệu — `repositories/payrollRepo.js`, `attendanceRepo.js`

`payrollRepo.js`:

- `adjustments` bỏ dòng đã ẩn; thêm `deletedAdjustments`;
- `removeAdjustment` chuyển thành `UPDATE … DeletedAt`;
- `pendingAdvances` (tạm ứng `PENDING` trong tháng);
- `lock`:
  - lưu bản trước vào `PayrollRunVersions` nếu đã có dòng;
  - bỏ `AckAt` khi `NetPay` đổi;
  - giữ `PaidAmount`;
- `versions(month)`;
- `markPaid` ghi `PaidAmount = NetPay`.

`attendanceRepo.js`:

- `update(…, clearDecision)`;
- `disputeById`;
- `workedOn(userId, date)`.

### 3. Dịch vụ — `services/payrollService.js`, `attendanceService.js`

- `assertNotSelf` (`PAYROLL_SELF`) ở:
  - `saveProfile`, `addAdjustment`, `removeAdjustment`;
  - `teamBonus`, `markPaid`;
  - `saveHoliday` / `removeHoliday`;
  - `decide`, `resolveDispute`, `resolveMissed`.
- Gọi `alertService.onPayrollChange` khi đổi hồ sơ lương của người khác / mở lại bảng lương. Lỗi gửi cảnh báo không chặn thao tác.
- `compute` thêm việc chờ `ADVANCE_PENDING`; `get` trả `deletedAdjustments`, `versions`.

### 4. Cảnh báo — `services/alertService.js`, `auth/permissions.js`

- `onPayrollChange` → cảnh báo `PAYROLL_CHANGE`, mức MEDIUM; email tức thì theo cài đặt.
- `OWNER_ONLY_ALERTS` thêm `PAYROLL_CHANGE`.

### 5. API — `routes/payroll.js`

Truyền `req.user` vào `removeAdjustment`, `saveHoliday`, `removeHoliday`. Không có endpoint mới.

### 6. Giao diện — `js/pages/admin-payroll.js`, `domain/payroll.js`

- Trang Lương:
  - "Đã xóa" (gạch ngang, người xóa, lúc xóa);
  - "Lịch sử chốt" (bấm xem từng dòng);
  - badge "Đã trả" kèm chênh;
  - việc chờ `ADVANCE_PENDING` có nút "Duyệt ở Sổ quỹ".
- `ISSUE_LABEL.ADVANCE_PENDING` (trong `domain/payroll.js`).

### 7. Test

- `tests/payroll-guard.test.js` (AC-098-01…06);
- `payroll.test.js` AC-073-05;
- kịch bản thử gian lận phần lương.

## Rủi ro

1. **Đổi phân quyền.** ADR-061 chỉ chặn việc làm cho chính mình và thêm cảnh báo, không mở quyền mới. Chủ quán giữ toàn quyền.
2. **BR-110 "chốt lại giữ đã xem" đổi.** Test AC-073-05 sửa theo. Phiếu lương của nhân viên tự hiện lại nút "Đã xem".
3. **Việc chờ `ADVANCE_PENDING` có thể chặn chốt** ở quán đang có tạm ứng chờ duyệt. Đó là mục đích: trang Lương chỉ thẳng sang Sổ quỹ.
4. **Migration chạy trên CafeQrDev** (dữ liệu thử của chủ quán). Chỉ thêm cột / bảng / trigger; `PaidAmount` của dòng đã trả được điền bằng thực nhận lúc đó.
