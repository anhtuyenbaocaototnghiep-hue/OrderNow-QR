---
name: nhac-va-bao-quen-cham-cong
description: Quên PIN, nhắc chấm công và nhân viên báo quên chấm công cho cafe-qr-app (bổ sung F-072, ADR-031, TASK-090) — đặt PIN ngay ở màn chấm công chung bằng mật khẩu đăng nhập (POST /api/auth/pin/kiosk, sai mật khẩu tính như đăng nhập sai), dòng "Quên PIN?" trên bàn phím PIN, xóa lần sai PIN khi đặt PIN mới / quản lý xóa PIN, dải nhắc ở máy quầy (có lịch quá 10 phút chưa chấm vào, hết lịch 15 phút chưa chấm ra — GET /api/attendance/reminders), thẻ "Quên chấm công?" + nút "Báo quên chấm công" ở Giờ công của tôi (bảng MissedPunches, 7 ngày), việc chờ MISSED_PUNCH ở trang Lương (Duyệt… tạo lần chấm công MANUAL / Không duyệt có lý do). Dùng khi task giao ADR-031 / TASK-090 / AC-072-08…12, hoặc nhắc "quên PIN", "khóa PIN", "nhắc chấm công", "quên chấm công", "báo quên", "missed punch", "chưa chấm vào", "chưa chấm ra".
---

# Mục đích

Ghi lại phần **quên PIN + nhắc + báo quên chấm công** (làm ngày 06/11/2026, TASK-090) để agent sau sửa, mở rộng hoặc làm lại mà không mở đường dò mật khẩu, không để nhân viên tự cộng giờ công, không làm hỏng luật tính giờ ADR-030.

Nền là skill `cham-cong-tinh-luong` (F-072 / F-073, ADR-030) — đọc nó trước. Nguồn chính là tài liệu trong repo; lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-031-nhac-va-bao-quen-cham-cong.md` (D-135…D-139) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-072.md` — US-072-4, quy tắc 7–9, AC-072-08…12 |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-111 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-090.md`, `tài-liệu/kế-hoạch/TASK-090-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "Bổ sung … ADR-031" |

# Khi dùng

- Đổi ngưỡng nhắc (10 / 15 / 30 phút), hạn báo quên (7 ngày), thêm kênh nhắc (Zalo, chuông).
- Chủ quán hỏi "nhân viên quên chấm công thì sao", "quên PIN làm sao", "sao không chốt được lương" (mục 6).
- Cho trưởng ca duyệt báo quên, thêm báo quên giờ ra cho lần đang mở — đọc mục 5 trước.

# Điều kiện trước

- Đã có F-072 / F-073 (migration 0049): PIN, màn chung, `AuthFailures`, bảng lương có việc chờ.
- Chủ dự án duyệt nếu đổi nguyên tắc "giờ chưa xác nhận thì không tự trả lương" hoặc cho người khác ngoài quản lý duyệt.

# 1. Bước 0: khảo sát rồi mới sửa

Đọc: `services/pinService.js` (`setPinWithPassword`, `setPinAtKiosk`, `resetPin`), `services/authGuardService.js` (`clearFailures`), `services/attendanceService.js` (`reminders`, `reportMissed`, `resolveMissed`, `assertSpan`), `services/payrollService.js` (`missedRows`, `absentRosters`, `missedFor`), `repositories/attendanceRepo.js` (mục "Báo quên chấm công"), `routes/payroll.js`; giao diện `pin-pad.js` (`onForgot`), `staff-pin.js` (`pinForm`, `kioskPinDialog`), `pos-shell.js` (`loadReminders`), `pages/pos-me.js` (`missedDialog`, `missingCard`), `pages/admin-payroll.js` (`approveMissedDialog`).

# 2. Quy tắc (BR-111)

- **Đặt PIN ở màn chung:** chạm tên (ô "Chưa đặt PIN — chạm để đặt", viền đứt) hoặc "Quên PIN?" trên bàn phím → mật khẩu đăng nhập **của người đó** + PIN mới. Không cho tài khoản quản lý (`404`). Sai mật khẩu → `403 PASSWORD_INVALID`, ghi `AuthFailures` loại **`LOGIN`** theo tên + IP (10 lần / 15 phút → `429 LOGIN_LOCKED`) — **không** dùng khóa `PIN`, vì người vừa bị khóa PIN phải đặt lại được ngay.
- **Xóa lần sai PIN:** đặt PIN mới (`/auth/pin`, `/auth/pin/kiosk`) hoặc quản lý xóa PIN → `DELETE AuthFailures WHERE Kind = 'PIN' AND Username = …` (mọi máy, mọi người đứng quầy). Không xóa lần sai `LOGIN`.
- **Nhắc (chỉ `KIOSK`):** `NOT_IN` — lịch đã qua giờ bắt đầu ≥ 10 phút, chưa tới giờ hết, không lần chấm công nào giao với khung lịch (đừng so giờ vào với "bây giờ": DATETIME2(0) làm tròn lên, người vừa chấm vào có giờ vào sau "bây giờ" — lỗi E2E đã gặp). `NOT_OUT` — đang mở, có lịch hết sau (giờ vào − 1 giờ), không lịch nào trong `[bắt đầu − 30 phút, hết + 15 phút]` chứa "bây giờ", lịch gần nhất đã hết. Bỏ quản lý, người nghỉ việc, người làm ngoài lịch.
- **Báo quên:** giờ ra > giờ vào, không tương lai, ≤ 24 giờ, lý do ≥ 3 ký tự, giờ vào trong 7 ngày (`400 MISSED_PUNCH_TOO_OLD`), tháng chưa chốt, không trùng chấm công đã có (`409 ATTENDANCE_OVERLAP` → dùng "Báo sai") hay báo quên đang chờ (`409 MISSED_PUNCH_OPEN`); quản lý không tự gửi (`403 MISSED_PUNCH_ADMIN`). Bị từ chối thì gửi lại được.
- **Duyệt / không duyệt:** chỉ quản lý (`payrollAdminRouter`). Duyệt (giờ sửa được) → một giao dịch: giữ phiếu `WHERE Status = 'PENDING'` → `INSERT Attendance` `MANUAL`, `EditedBy` = người duyệt, `EditReason` "Báo quên chấm công: {lý do}" → gắn `AttId`. Lần chấm công này đi qua luật ADR-030 như mọi lần khác. Không duyệt bắt buộc lý do. Báo quên đang chờ = việc chờ `MISSED_PUNCH` → chặn chốt lương. Không xóa được.

# 3. Dữ liệu và API

- Migration `0050_bao_quen_cham_cong.sql`: `MissedPunches` + trigger `TR_MissedPunches_NoDelete` (50250). Nhật ký thao tác: `ADMIN_ENTITY['missed-punches'] = 'MissedPunch'`, `SNAP.MissedPunch`.
- API: `POST /api/auth/pin/kiosk`, `GET /api/attendance/reminders`, `POST /api/me/missed-punches`, `POST /api/admin/missed-punches/{id}/approve | reject`; `GET /api/me/attendance` thêm `missingDays`, `missedPunches`, `missedPunchDays`; `GET /api/admin/payroll` `pending` có mục `MISSED_PUNCH` (`requestId`, `note`, giờ).

# 4. Giao diện

- `pinPad({ …, onForgot })`: có `onForgot` → dòng "Quên PIN? Đặt lại bằng mật khẩu đăng nhập" — bấm thì đóng bàn phím (trả `null`) rồi gọi `onForgot()`. Hỏi PIN thao tác tiền → `setPinDialog()` (của chính mình); màn chung / Đổi người → `kioskPinDialog(người đó)`.
- `pos-shell.js`: `#att-remind` sau dải "Chưa mở ca"; `loadReminders()` lúc mở trang, mỗi 60 giây, khi quay lại tab, sau khi đóng hộp Chấm công; **Ẩn** lưu chữ ký `kind:userId,…` vào `sessionStorage` (`att-remind-hidden`) — đọc / ghi bọc `try`.
- `/pos/me`: thẻ "Quên chấm công?" (ngày vắng + báo quên đã gửi), nút chung `#missed-btn` ở thẻ Chấm công (chỉ tháng còn trong hạn 7 ngày). Hộp báo quên: `#mp-date` (min = hôm nay − 7), `#mp-in`, `#mp-out` (giờ ra ≤ giờ vào = hôm sau), `#mp-note`.
- `/admin/payroll`: việc chờ `MISSED_PUNCH` → **Duyệt…** (`#mpa-date`, `#mpa-in`, `#mpa-out`, `#mpa-note`) / **Không duyệt** (`reasonDialog`).

# 5. Mở rộng — chỗ dễ sai

- **Đừng** dùng khóa `PIN` cho đặt PIN bằng mật khẩu (người bị khóa PIN sẽ không thoát được) và **đừng** bỏ hẳn đếm sai mật khẩu (thành chỗ dò mật khẩu không giới hạn).
- **Đừng** tự tạo chấm công khi nhân viên báo — chỉ khi quản lý duyệt (nguyên tắc ADR-030).
- Thêm "báo quên giờ ra" cho lần **đang mở**: hiện đã có chấm ra hộ lúc đóng ca + tự đóng 14 giờ + "Báo sai" sau khi đóng — cân nhắc trước khi thêm luồng thứ tư.
- Cho trưởng ca duyệt: cần quyết định của chủ dự án (ADR-031 chọn chỉ quản lý); nếu làm, giữ `assertNotSelf` và chỉ trong ngày như F-035.
- Nhắc qua điện thoại / Zalo: cần dịch vụ ngoài + số điện thoại nhân viên — ADR mới.
- Test dựng lịch theo **giờ VN của "bây giờ"** (`vnOf(now − 30 phút)`), không viết cứng giờ — chạy lúc nửa đêm vẫn đúng (ca qua đêm do `rosterWindow` xử lý). Người dùng cho test nhắc phải **chưa có lần chấm công nào** trong khung lịch (lần vào/ra vài giây trước cũng tính là "đã chấm").
- SQL Server: biến bảng phải `DECLARE` riêng một dòng (`DECLARE @uid INT, @att TABLE (…)` lỗi cú pháp — đã gặp khi làm).

# 6. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Nhân viên quên chấm công thì sao?" | Quên vào: máy quầy nhắc sau 10 phút; quên cả ngày: nhân viên bấm "Báo quên chấm công" ở Giờ công → bạn duyệt ở Lương. Quên ra: người đóng ca chấm ra hộ / app tự đóng sau 14 giờ → bạn chọn tính theo lịch / giờ thật / không tính |
| "Quên PIN" | Màn Chấm công → chạm tên → "Quên PIN?" → mật khẩu đăng nhập + PIN mới. Quên cả mật khẩu → Tài khoản → đặt lại mật khẩu |
| "Bị khóa PIN 15 phút" | Đặt PIN mới (như trên) là hết khóa ngay; hoặc quản lý bấm Xóa PIN |
| "Dải nhắc hiện hoài" | Người đó nghỉ có báo → xóa lịch của họ ở Nhân sự, hoặc bấm Ẩn |
| "Không chốt được lương" | Còn báo quên chưa duyệt / không duyệt trong Việc chờ |
| "Nhân viên báo khống" | Không duyệt (ghi lý do — nhân viên thấy); báo quên không xóa được, có tên người gửi |

# 7. Làm lại từ đầu (bản code chưa có TASK-090)

1. Docs: ADR-031, FEATURE-072 (US-072-4, AC-072-08…12), BR-111, tc-map, api-contract, data-model, screens, UAT-42.
2. Migration 0050 (mục 3).
3. Server: `authGuardRepo.clear` + `clearFailures` → `pinService` (mục 2) → `attendanceRepo` báo quên → `attendanceService.reminders / reportMissed / resolveMissed` → `payrollService` (việc chờ, `missingDays`) → routes + nhật ký.
4. Giao diện (mục 4) + CSS (`.person-tile.no-pin`, `.pin-forgot`, `.banner.att-remind`, `.time-pair`).
5. Test `attendance-missed.test.js` (AC-072-08…11) + E2E "nhắc & báo quên chấm công…" (AC-072-12); chụp 1366 / 390 px.

# 8. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm). Số liệu lần làm: xem `TASK-090.md`.
