# TASK-120 — Lương: không tự duyệt cho mình, duyệt lại khi sửa giờ, giữ lịch sử lương (F-098, ADR-061)

- **Status:** READY_FOR_REVIEW (17/11/2026)
- **Tài liệu:** [FEATURE-098](../chức-năng/FEATURE-098.md) · ADR [ADR-061](../quyết-định/ADR-061-luong-khong-tu-duyet-cho-minh.md) (D-241…D-244) · AC-098-01…06 · US-098-1 · BR-127, BR-110 (sửa) · SCR-51
- **Nguồn:** chủ dự án 17/11/2026: "BẠN CÓ THỂ GIẢI QUYẾT KHÔNG" → "TIẾN HÀNH LÀM CÁI LƯƠNG TRƯỚC ĐI".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-120-luong-khong-tu-duyet`, chồng lên `task/TASK-119-mau-theo-gio-quan`
- **Kế hoạch:** [TASK-120-plan.md](../kế-hoạch/TASK-120-plan.md)

## Phạm vi

- **Chặn làm cho chính mình** (người không phải chủ quán) → `403 PAYROLL_SELF`. Áp cho:
  - hồ sơ lương;
  - khoản cộng / trừ (thêm, xóa);
  - quyết định trả lương;
  - báo quên chấm công (duyệt / không duyệt), báo sai;
  - đánh dấu đã trả;
  - thưởng chung cho ca có mình;
  - ngày lễ vào ngày mình có chấm công.
- **Cảnh báo `PAYROLL_CHANGE`** khi người không phải chủ quán đổi lương / tài khoản ngân hàng của người khác, hoặc mở lại bảng lương đã chốt.
- **Sửa giờ đã duyệt `ACTUAL` / `SCHEDULE`** (người không phải chủ quán sửa) → bỏ quyết định.
- **Lịch sử lương:**
  - khoản cộng / trừ xóa = ẩn, kèm trigger chặn xóa;
  - tạm ứng chờ duyệt chặn chốt (`ADVANCE_PENDING`);
  - chốt lại lưu bản trước (`PayrollRunVersions`);
  - thực nhận đổi thì bỏ "Đã xem";
  - lưu số đã trả (`PaidAmount`) và hiện phần chênh.
- **Trang Lương:**
  - khoản đã xóa;
  - "Lịch sử chốt";
  - chênh "đã trả";
  - việc chờ tạm ứng, có nút "Duyệt ở Sổ quỹ".

**Ngoài phạm vi** (đợt chấm công sau): máy quầy đăng ký, ảnh khi chấm công, sửa giờ của người khác thành việc chờ, lịch làm của mình / ngày đã qua, đóng ca, xem chi tiết ca, đổi mật khẩu / PIN.

## Test

- `ứng-dụng/máy-chủ/tests/payroll-guard.test.js`: AC-098-01…06.
- `payroll.test.js` AC-073-05: "Đã xem" bỏ khi thực nhận đổi.
- Chạy lại kịch bản thử gian lận: phần lương (D) đều CHẶN.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- `npm run db:migrate`: CafeQrDev, thêm cột / bảng, không đổi dữ liệu cũ.
