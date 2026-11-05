# FEATURE-072 — Chấm công nhiều người: màn chấm công chung, PIN riêng, đổi người

> **Nguồn:** chủ dự án 05/11/2026 (duyệt phương án chấm công, bỏ máy khuôn mặt). Quyết định: [ADR-030](../quyết-định/ADR-030-cham-cong-tinh-luong.md) D-124…D-130.

- **Status:** CONFIRMED (ADR-030) · Triển khai: [TASK-089](../công-việc/TASK-089.md)
- **Actor:** **ACT-STAFF / ACT-LEAD** (đặt PIN, chấm vào / ra, đổi người, nhập PIN thao tác tiền, xem giờ công, báo sai, đóng ca); **ACT-ADMIN** (chọn cách chấm công, bật PIN thao tác tiền, xóa PIN, báo cáo tuần).
- **Màn hình:**
  - **Máy quầy** (mọi trang S-10…S-17): nút **Chấm công** (hộp chọn người + bàn phím PIN), **Đổi người**, dải "Bạn chưa đặt PIN" → **Đặt PIN**; bàn phím PIN tự hiện khi thao tác tiền cần PIN.
  - **Ca** (SCR-15): hộp đóng ca có mục **Chấm công trong ca** (chấm ra hộ, có mặt / không có mặt).
  - **Giờ công của tôi** `/pos/me` (SCR-52).
  - **Nhân sự** (SCR-37): thẻ **Cách chấm công**, tab **Báo cáo tuần**. **Tài khoản** (SCR-20): **Xóa PIN**.
- **Dữ liệu:** `Users.PinHash`, cột mới của `Attendance`, `AttendanceDisputes`, `AuthFailures.Kind = 'PIN'`; cài đặt `attendance.mode`, `security.money_pin`.

## User Story

- **US-072-1:** Là nhân viên, tôi muốn chấm vào / ra ở màn chung bằng PIN của riêng mình (kể cả khi không dùng máy quầy), để giờ làm của tôi được ghi đúng.
- **US-072-2:** Là chủ quán, tôi muốn mỗi thao tác tiền ghi đúng người làm (đổi người bằng PIN, nhập PIN mỗi lần thao tác tiền), để không ai đổ được trách nhiệm cho người khác.
- **US-072-3:** Là chủ quán, tôi muốn người đóng ca xác nhận ai có mặt và tôi xem được báo cáo tuần (lịch vs giờ được tính, sửa tay, % lương theo ca), để phát hiện chấm hộ và ca thừa người.

## Quy tắc (BR-109)

1. `attendance.mode`: `KIOSK` (mặc định) — chấm công ở màn chung bằng PIN, đăng nhập / đăng xuất không chấm công; `LOGIN` — như F-035. Màn chung khi đang ở `LOGIN` → `409 KIOSK_OFF`.
2. PIN 4–6 số, tự đặt sau khi nhập mật khẩu (`403 PASSWORD_INVALID`), không dãy dễ đoán (`400 PIN_WEAK`), lưu bcrypt; quản lý chỉ xóa. Sai 5 lần / 15 phút cùng người bị thử + cùng người đứng quầy → `429 PIN_LOCKED` + cảnh báo `AUTH_LOCK`.
3. Vào ca khi đang có lần mở → `409 ALREADY_IN`; ra ca khi không có → `409 NOT_IN`. Quản lý không có trên màn chung.
4. Đổi người: PIN đúng → phiên mới của người đó (chỉ nhân viên / trưởng ca); không tạo chấm công ở chế độ màn chung.
5. `security.money_pin` (mặc định bật): giảm giá tay, hoàn tiền, xóa món đã tiếp nhận / đã pha, ghi chi sổ quỹ, hủy / sửa khoản sổ quỹ, tự duyệt khoản chi → `403 PIN_REQUIRED` khi thiếu, `403 PIN_INVALID` khi sai; quản lý miễn; thu thêm (khoản thu) không cần.
6. Đóng ca (chế độ màn chung): chấm ra hộ → `NeedsReview`, ghi người chấm hộ; có mặt `OK` / không có mặt `DISPUTED`; không đánh dấu được bản ghi của chính người đóng ca. Mở quá 14 giờ → tự đóng ở giờ vào + 8 giờ, `NeedsReview`.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/auth/pin` | Nhân viên | `{ password, pin }` → `{ hasPin: true }` |
| `POST /api/auth/switch` | Nhân viên | `{ userId, pin }` → `{ accessToken, user }` |
| `GET /api/attendance/board` | Nhân viên | `{ mode, people: [{ userId, fullName, role, hasPin, workingSince, roster }] }` |
| `POST /api/attendance/punch` | Nhân viên | `{ userId, pin, action: IN \| OUT }` → bản ghi chấm công |
| `GET /api/attendance/shift/{id}` | Nhân viên | `{ mode, rows: [bản ghi + self] }` |
| `POST /api/shifts/{id}/close` | Nhân viên | Thêm `attendance: { clockOut, present, absent }` → trả `attendance: { closed, checked, disputed }` |
| `GET /api/auth/me` | Nhân viên | Thêm `attendance: { mode, moneyPin }`, `user.hasPin` |
| `GET` · `PUT /api/admin/attendance-settings` | ADMIN | `{ attendanceMode, moneyPin }` |
| `POST /api/admin/users/{id}/pin-reset` | ADMIN | Xóa PIN |
| `GET /api/admin/payroll-week?from=` | ADMIN | Báo cáo tuần `{ people, edits, shifts }` |

## Acceptance Criteria

- AC-072-01: (unit) PIN 4–6 số không dễ đoán; luật tính giờ: theo lịch, đến sớm / về muộn ≤ 15 phút không tính, không phải duyệt; dư > 15 phút chờ duyệt; đi trễ > 15 phút; ngoài lịch chờ xác nhận; quyết định giờ thật / theo lịch / không tính; giờ đêm và ngày lễ theo phút; chia thưởng theo phút (dư cho người làm nhiều nhất).
- AC-072-02: Tự đặt PIN cần mật khẩu (sai 403), PIN yếu 400; `/auth/me` báo cách chấm công + `hasPin`; lưu mã băm; quản lý xóa PIN, nhân viên không xóa được.
- AC-072-03: Màn chung liệt kê người (không có quản lý); vào / ra bằng PIN; vào hai lần 409, ra khi chưa vào 409; đăng xuất không chấm ra; sai PIN 5 lần → 429 PIN_LOCKED + một cảnh báo; người đứng quầy khác vẫn chấm được; chế độ đăng nhập → 409 KIOSK_OFF.
- AC-072-04: Đổi người: PIN đúng → phiên của người đó, thao tác ghi đúng người, không tạo chấm công; PIN sai 403; không đổi sang quản lý.
- AC-072-05: PIN thao tác tiền: giảm giá tay, hoàn tiền, chi sổ quỹ, hủy khoản sổ quỹ — thiếu 403 PIN_REQUIRED, sai 403 PIN_INVALID, đúng thì làm; thu thêm không cần; quản lý miễn; tắt cài đặt không hỏi.
- AC-072-06: Đóng ca: chấm ra hộ → cần xem lại + ghi người chấm hộ; báo không có mặt; bản ghi của chính người đóng ca không đổi; mở quá 14 giờ → tự đóng ở 8 giờ, cần xem lại.
- AC-072-07: Trên trình duyệt: nhân viên mới đặt PIN từ dải nhắc; màn Chấm công vào ca bằng PIN (bàn phím 12 nút); chi tiền hỏi PIN người đứng máy (sai báo lỗi, đúng ghi khoản); Đổi người → tên trên thanh trên đổi; Giờ công của tôi chỉ có của mình.

## Bằng chứng

`tests/attendance-kiosk.test.js` (AC-072-01…06) · E2E "chấm công nhiều người + lương…" (AC-072-07).
