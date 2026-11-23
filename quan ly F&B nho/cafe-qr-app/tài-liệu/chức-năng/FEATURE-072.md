# FEATURE-072 — Chấm công nhiều người: màn chấm công chung, PIN riêng (đổi người đã bỏ — ADR-050)

> **Nguồn:** chủ dự án 05/11/2026 (duyệt phương án chấm công, bỏ máy khuôn mặt). Quyết định: [ADR-030](../quyết-định/ADR-030-cham-cong-tinh-luong.md) D-124…D-130.
> **Bổ sung 06/11/2026:** quên PIN, nhắc chấm công, báo quên chấm công — [ADR-031](../quyết-định/ADR-031-nhac-va-bao-quen-cham-cong.md) D-135…D-139 (chủ dự án: "ok tiến hành đi").
> **Bổ sung 14/11/2026:** bỏ "Đổi người" — [ADR-050](../quyết-định/ADR-050-bo-doi-nguoi.md) D-221 (chủ dự án: "bỏ chức năng đổi người ở màn hình quầy"); người khác đứng máy thì đăng xuất / đăng nhập.
> **Bổ sung 23/11/2026:** chỉ người đã được sắp ca mới chấm vào được — [ADR-067](../quyết-định/ADR-067-chi-cham-cong-trong-ca.md) D-259 (chủ dự án: "người ko có sắp ca làm thì sẽ không thấy chỗ chấm và mã pin… admin hoặc quản lý nhập ca thì mới xuất hiện và chấm công"); [TASK-131](../công-việc/TASK-131.md).

- **Status:** CONFIRMED (ADR-030, ADR-031) · Triển khai: [TASK-089](../công-việc/TASK-089.md), [TASK-090](../công-việc/TASK-090.md)
- **Actor:** **ACT-STAFF / ACT-LEAD** (đặt PIN, chấm vào / ra, nhập PIN thao tác tiền, xem giờ công, báo sai, đóng ca); **ACT-ADMIN** (chọn cách chấm công, bật PIN thao tác tiền, xóa PIN, báo cáo tuần).
- **Màn hình:**
  - **Máy quầy** (mọi trang S-10…S-17): nút **Chấm công** (hộp chọn người + bàn phím PIN), dải "Bạn chưa đặt PIN" → **Đặt PIN**; bàn phím PIN tự hiện khi thao tác tiền cần PIN. ADR-031: dải **nhắc chấm công**; người chưa có PIN chạm tên để đặt; dòng **Quên PIN?** trên bàn phím.
  - **Ca** (SCR-15): hộp đóng ca có mục **Chấm công trong ca** (chấm ra hộ, có mặt / không có mặt).
  - **Giờ công của tôi** `/pos/me` (SCR-52) — ADR-031: thẻ **Quên chấm công?** + nút **Báo quên chấm công**.
  - **Lương** `/admin/payroll` (SCR-51) — ADR-031: việc chờ "Nhân viên báo quên chấm công" → **Duyệt…** / **Không duyệt**.
  - **Nhân sự** (SCR-37): thẻ **Cách chấm công**, tab **Báo cáo tuần**. **Tài khoản** (SCR-20): **Xóa PIN**.
- **Dữ liệu:** `Users.PinHash`, cột mới của `Attendance`, `AttendanceDisputes`, `AuthFailures.Kind = 'PIN'`; cài đặt `attendance.mode`, `security.money_pin`. ADR-031: `MissedPunches` (migration 0050).

## User Story

- **US-072-1:** Là nhân viên, tôi muốn chấm vào / ra ở màn chung bằng PIN của riêng mình (kể cả khi không dùng máy quầy), để giờ làm của tôi được ghi đúng.
- **US-072-2:** Là chủ quán, tôi muốn mỗi thao tác tiền ghi đúng người làm (mỗi người đăng nhập tài khoản của mình, nhập PIN mỗi lần thao tác tiền), để không ai đổ được trách nhiệm cho người khác.
- **US-072-3:** Là chủ quán, tôi muốn người đóng ca xác nhận ai có mặt và tôi xem được báo cáo tuần (lịch vs giờ được tính, sửa tay, % lương theo ca), để phát hiện chấm hộ và ca thừa người.
- **US-072-4:** Là nhân viên, tôi muốn được nhắc khi quên chấm vào / ra, tự báo khi quên hẳn một ngày và tự đặt lại PIN khi quên, để giờ công không bị mất mà không phải nhờ ai sửa giúp.

## Quy tắc (BR-109)

1. `attendance.mode`: `KIOSK` (mặc định) — chấm công ở màn chung bằng PIN, đăng nhập / đăng xuất không chấm công; `LOGIN` — như F-035 (quên đăng xuất → máy tự đóng và đánh dấu cần xem lại, như màn chung — DEF-021, 08/11/2026). Màn chung khi đang ở `LOGIN` → `409 KIOSK_OFF`.
2. PIN 4–6 số, tự đặt sau khi nhập mật khẩu (`403 PASSWORD_INVALID`), không dãy dễ đoán (`400 PIN_WEAK`), lưu bcrypt; quản lý chỉ xóa. Sai 5 lần / 15 phút cùng người bị thử + cùng người đứng quầy → `429 PIN_LOCKED` + cảnh báo `AUTH_LOCK`.
3. Vào ca khi đang có lần mở → `409 ALREADY_IN`; ra ca khi không có → `409 NOT_IN`. Quản lý không có trên màn chung.
4. ~~Đổi người bằng PIN~~ — **đã bỏ** (ADR-050 D-221): người khác đứng máy thì đăng xuất rồi đăng nhập tài khoản của mình.
5. `security.money_pin` (mặc định bật): giảm giá tay, hoàn tiền, xóa món đã tiếp nhận / đã pha, ghi chi sổ quỹ, hủy / sửa khoản sổ quỹ, tự duyệt khoản chi → `403 PIN_REQUIRED` khi thiếu, `403 PIN_INVALID` khi sai; quản lý miễn; thu thêm (khoản thu) không cần.
6. Đóng ca (chế độ màn chung): chấm ra hộ → `NeedsReview`, ghi người chấm hộ; có mặt `OK` / không có mặt `DISPUTED`; không đánh dấu được bản ghi của chính người đóng ca. Mở quá 14 giờ → tự đóng ở giờ vào + 8 giờ, `NeedsReview`.

## Quy tắc bổ sung (BR-111, ADR-031)

7. Quên / chưa có PIN: ở màn chung nhập **mật khẩu đăng nhập** của người đó + PIN mới (không cho tài khoản quản lý → `404`); sai mật khẩu → `403 PASSWORD_INVALID`, tính như đăng nhập sai (10 lần / 15 phút cùng tên + cùng máy → `429 LOGIN_LOCKED`). Đặt PIN mới hoặc quản lý xóa PIN → xóa mọi lần sai PIN cũ của người đó.
8. Nhắc (chỉ `KIOSK`): có lịch, qua giờ bắt đầu ≥ 10 phút, chưa tới giờ hết, không có lần chấm công nào giao với lịch → `NOT_IN`; đang làm, lịch gần nhất đã hết > 15 phút, không lịch nào đang chạy / bắt đầu trong 30 phút → `NOT_OUT`. Không nhắc người làm ngoài lịch, người đã nghỉ việc, quản lý.
9. Báo quên chấm công: giờ vào + giờ ra (ra sau vào, không tương lai, ≤ 24 giờ) + lý do ≥ 3 ký tự; trong 7 ngày (`400 MISSED_PUNCH_TOO_OLD`); trùng chấm công đã có `409 ATTENDANCE_OVERLAP`; trùng báo quên đang chờ `409 MISSED_PUNCH_OPEN`; tháng đã chốt `409 PAYROLL_LOCKED`; quản lý không tự gửi `403 MISSED_PUNCH_ADMIN`. Đang chờ → việc chờ `MISSED_PUNCH` (chặn chốt lương). Duyệt (chỉ quản lý, sửa giờ được) → lần chấm công `MANUAL`, người sửa = người duyệt, lý do "Báo quên chấm công: …"; không duyệt bắt buộc lý do. Không xóa được.

## Quy tắc bổ sung (BR-130, ADR-067)

10. **Chỉ chấm vào trong ca đã sắp** (chế độ `KIOSK`):
    - **Khung được chấm vào:** từ 60 phút trước giờ bắt đầu ca ở Lịch làm tuần tới giờ kết thúc. Ca qua đêm tính sang ngày sau.
    - **Màn Chấm công** chỉ liệt kê người đang có khung (ô người ghi "Ca hh:mm–hh:mm · Chưa vào ca") và người đang trong ca (để ra ca, kể cả khi lịch bị xóa). Chưa ai → "Chưa có ai có ca lúc này. Quản lý sắp ca ở …".
    - **Chấm `IN` ngoài khung** → `409 NOT_SCHEDULED`, kiểm trước PIN: không thử PIN, không tính lần sai, không tạo chấm công.
    - **Chấm ra không cần lịch.**

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/auth/pin` | Nhân viên | `{ password, pin }` → `{ hasPin: true }` |
| ~~`POST /api/auth/switch`~~ | — | Đã bỏ (ADR-050) → `404` |
| `GET /api/attendance/board` | Nhân viên | `{ mode, people: [{ userId, fullName, role, hasPin, workingSince, roster }] }` — (ADR-067) chỉ người có ca lúc này hoặc đang trong ca; `roster` = giờ ca đang cho chấm vào |
| `POST /api/attendance/punch` | Nhân viên | `{ userId, pin, action: IN \| OUT }` → bản ghi chấm công |
| `GET /api/attendance/shift/{id}` | Nhân viên | `{ mode, rows: [bản ghi + self] }` |
| `POST /api/shifts/{id}/close` | Nhân viên | Thêm `attendance: { clockOut, present, absent }` → trả `attendance: { closed, checked, disputed }` |
| `GET /api/auth/me` | Nhân viên | Thêm `attendance: { mode, moneyPin }`, `user.hasPin` |
| `GET` · `PUT /api/admin/attendance-settings` | ADMIN | `{ attendanceMode, moneyPin }` |
| `POST /api/admin/users/{id}/pin-reset` | ADMIN | Xóa PIN (ADR-031: xóa luôn lần sai PIN cũ) |
| `POST /api/auth/pin/kiosk` | Nhân viên | ADR-031: `{ userId, password, pin }` → `{ hasPin: true }` — đặt PIN ở màn chung bằng mật khẩu của người đó |
| `GET /api/attendance/reminders` | Nhân viên | ADR-031: `{ items: [{ kind: NOT_IN \| NOT_OUT, userId, fullName, rosterStart?, rosterEnd, since? }] }` |
| `POST /api/me/missed-punches` | Nhân viên | ADR-031: `{ clockIn, clockOut, note }` → `201` báo quên `{ requestId, status: PENDING, … }` |
| `GET /api/me/attendance` | Nhân viên | ADR-031 thêm `missingDays [{ workDate, startTime, endTime, reported, canReport }]`, `missedPunches`, `missedPunchDays` |
| `POST /api/admin/missed-punches/{id}/approve` | ADMIN | ADR-031: `{ clockIn?, clockOut?, note? }` → `{ status: APPROVED, attendance }` |
| `POST /api/admin/missed-punches/{id}/reject` | ADMIN | ADR-031: `{ reason }` → `{ status: REJECTED }` |
| `GET /api/admin/payroll-week?from=` | ADMIN | Báo cáo tuần `{ people, edits, shifts }` |

## Acceptance Criteria

- AC-072-01: (unit) PIN 4–6 số không dễ đoán; luật tính giờ: theo lịch, đến sớm / về muộn ≤ 15 phút không tính, không phải duyệt; dư > 15 phút chờ duyệt; đi trễ > 15 phút; ngoài lịch chờ xác nhận; quyết định giờ thật / theo lịch / không tính; giờ đêm và ngày lễ theo phút; chia thưởng theo phút (dư cho người làm nhiều nhất).
- AC-072-02: Tự đặt PIN cần mật khẩu (sai 403), PIN yếu 400; `/auth/me` báo cách chấm công + `hasPin`; lưu mã băm; quản lý xóa PIN, nhân viên không xóa được.
- AC-072-03: Màn chung liệt kê người (không có quản lý); vào / ra bằng PIN; vào hai lần 409, ra khi chưa vào 409; đăng xuất không chấm ra; sai PIN 5 lần → 429 PIN_LOCKED + một cảnh báo; người đứng quầy khác vẫn chấm được; chế độ đăng nhập → 409 KIOSK_OFF.
- AC-072-04: "Đổi người" đã bỏ (ADR-050): `POST /api/auth/switch` → `404` kể cả PIN đúng, không cấp phiên mới; phiên máy quầy vẫn đứng tên người đã đăng nhập, thao tác ghi người đó, không tạo chấm công cho người kia.
- AC-072-05: PIN thao tác tiền: giảm giá tay, hoàn tiền, chi sổ quỹ, hủy khoản sổ quỹ — thiếu 403 PIN_REQUIRED, sai 403 PIN_INVALID, đúng thì làm; thu thêm không cần; quản lý miễn; tắt cài đặt không hỏi.
- AC-072-06: Đóng ca: chấm ra hộ → cần xem lại + ghi người chấm hộ; báo không có mặt; bản ghi của chính người đóng ca không đổi; mở quá 14 giờ → tự đóng ở 8 giờ, cần xem lại.
- AC-072-07: Trên trình duyệt: nhân viên mới đặt PIN từ dải nhắc; màn Chấm công vào ca bằng PIN (bàn phím 12 nút); chi tiền hỏi PIN người đứng máy (sai báo lỗi, đúng ghi khoản); không còn nút "Đổi người" — người khác đứng máy thì đăng xuất / đăng nhập, tên trên thanh trên đổi; Giờ công của tôi chỉ có của mình.
- AC-072-08: Bị khóa PIN (sai 5 lần) → ở màn chung đặt PIN mới bằng mật khẩu đăng nhập (máy quầy đứng tên người khác) → hết khóa, PIN cũ hết dùng, chấm công được ngay; sai mật khẩu 403 và tính như đăng nhập sai; PIN yếu 400; tài khoản quản lý 404; quản lý xóa PIN người đang bị khóa → hết khóa, báo `PIN_NOT_SET`; tự đổi PIN trong phiên của mình cũng xóa lần sai cũ. _(bổ sung — TASK-090, 06/11/2026)_
- AC-072-09: Nhắc chấm công: có lịch quá 10 phút chưa chấm vào → `NOT_IN`; hết lịch 30 phút vẫn đang làm → `NOT_OUT`; mới trễ 5 phút, làm ngoài lịch, người đã nghỉ việc → không nhắc; chấm vào / ra xong → hết; chế độ đăng nhập → không nhắc. _(bổ sung — TASK-090, 06/11/2026)_
- AC-072-10: Ngày có lịch đã qua mà không chấm công → Giờ công của tôi có trong `missingDays` (báo được); nhân viên gửi báo quên (giờ thật + lý do) → `PENDING`, ngày đó "đã báo", việc chờ `MISSED_PUNCH` ở bảng lương tháng đó; lý do ngắn 400, giờ ra không sau giờ vào 400, quá 7 ngày 400, giờ tương lai 400, trùng báo quên 409, trùng chấm công đã có 409, quản lý tự gửi 403. _(bổ sung — TASK-090, 06/11/2026)_
- AC-072-11: Trưởng ca duyệt 403; quản lý duyệt có sửa giờ → lần chấm công `MANUAL` ghi người duyệt + lý do, ngày đó hết vắng, giờ được tính theo lịch, hết việc chờ, có nhật ký thao tác; duyệt lại 404; không duyệt thiếu lý do 400, có lý do → `REJECTED`, không tạo chấm công, nhân viên thấy lý do; không xóa được (`HISTORY_NO_DELETE`); báo quên đang chờ chặn chốt lương (`409 PAYROLL_PENDING`); tháng đã chốt không duyệt được (`409 PAYROLL_LOCKED`). _(bổ sung — TASK-090, 06/11/2026)_
- AC-072-12: Trên trình duyệt: máy quầy hiện dải "… có lịch … nhưng chưa chấm vào ca" → Mở Chấm công → người chưa có PIN chạm tên, đặt PIN bằng mật khẩu → vào ca bằng PIN → hết dải nhắc; bàn phím PIN có "Quên PIN?" mở hộp đặt lại PIN; Giờ công của tôi → "Quên chấm công?" → Báo quên chấm công (điền sẵn giờ lịch) → "Đã báo quên", "chờ quản lý duyệt"; trang Lương → Duyệt… (điền sẵn giờ) → hết việc chờ. _(bổ sung — TASK-090, 06/11/2026)_
- AC-072-13: (ADR-067) Người không có ca lúc này không có trên `GET /api/attendance/board`; `POST /api/attendance/punch` `IN` (PIN đúng hay sai) → `409 NOT_SCHEDULED`, không thêm lần sai PIN, không tạo chấm công; ca còn hơn 60 phút mới bắt đầu → chưa có tên, `409 NOT_SCHEDULED`; ca bắt đầu trong 45 phút → có tên kèm giờ ca, chấm vào `200`; quản lý xóa lịch khi người đó đang trong ca → vẫn có tên, ra ca `200`, ra xong hết tên. Hàm `clockInOpen`: ca 08:00–14:00 cho chấm 07:00…13:59, không cho 06:59 / 14:00; ca qua đêm 22:00–02:00 cho chấm 21:00…01:59 hôm sau.
- AC-072-14: (ADR-067, trình duyệt) Máy quầy → Chấm công: hộp có dòng "Chỉ người có ca lúc này mới có tên. Không thấy tên mình → nhờ quản lý sắp ca."; người được sắp ca quanh giờ hiện tại có ô "Ca hh:mm–hh:mm · Chưa vào ca" và vào ca bằng PIN được; người đang đứng máy nhưng không có ca không có ô.

## Bằng chứng

`tests/attendance-kiosk.test.js` (AC-072-01…06, AC-072-13) · E2E "chấm công nhiều người + lương…" (AC-072-07, AC-072-14) · `tests/attendance-missed.test.js` (AC-072-08…11) · E2E "nhắc & báo quên chấm công…" (AC-072-12).
