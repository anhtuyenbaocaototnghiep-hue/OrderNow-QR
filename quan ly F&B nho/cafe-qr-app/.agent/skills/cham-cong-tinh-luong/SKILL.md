---
name: cham-cong-tinh-luong
description: Chấm công nhiều người và tính lương cho cafe-qr-app — màn chấm công chung (nút "Chấm công" ở máy quầy, chạm tên + PIN riêng tự đặt, bàn phím số đổi chỗ), "Đổi người" đứng máy bằng PIN, PIN cho thao tác tiền (giảm giá tay, hoàn tiền, xóa món đã pha, chi / hủy sổ quỹ — header X-Actor-Pin, api.js tự hỏi PIN), đóng ca xác nhận có mặt / chấm ra hộ, luật tính giờ theo lịch + việc chờ quản lý, hồ sơ lương, bảng lương tháng chốt / mở lại, tạm ứng lương có người nhận, thưởng chung theo ca, VietQR trả lương, trang Giờ công của tôi, báo cáo tuần, Lãi/lỗ dùng lương thật. Dùng khi task giao FEATURE-072 / FEATURE-073 / ADR-030 / TASK-089, hoặc nhắc "chấm công", "PIN", "đổi người", "kiosk", "tính lương", "bảng lương", "phiếu lương", "tạm ứng", "lương giờ", "ngày lễ", "VietQR trả lương", "/admin/payroll", "/pos/me".
---

# Mục đích

Ghi lại **chấm công nhiều người + tính lương** (làm ngày 05/11/2026, TASK-089) để agent sau **sửa, mở rộng hoặc làm lại** mà không tính sai tiền lương, không mở lỗ "người này làm, tên người kia", không để sửa giờ công sau khi đã trả lương.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Quên PIN, nhắc chấm công, báo quên chấm công (TASK-090, ADR-031): skill `nhac-va-bao-quen-cham-cong`. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-030-cham-cong-tinh-luong.md` (D-124…D-134) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-072.md` (AC-072-01…07), `FEATURE-073.md` (AC-073-01…09) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-109, BR-110 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-089.md`, `tài-liệu/kế-hoạch/TASK-089-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-072 / F-073" |
| Nền | F-035 chấm công + lịch làm + nhật ký, F-036 vai trò, F-071 chống sửa (khóa tạm, `AUTH_LOCK`), F-033 sổ quỹ, F-034 Lãi/lỗ, F-060 cảnh báo |

# Khi dùng

- Đổi luật tính giờ (ngưỡng trễ / làm thêm, giờ ca tối, làm tròn), thêm loại phụ cấp, đổi cách chia thưởng.
- Chủ quán báo "lương sai", "không chốt được", "nhân viên không chấm được", "bị hỏi PIN hoài", "tạm ứng không trừ" (mục 7).
- Thêm thao tác tiền mới cần PIN; nối VietQR sang thu tiền ở quầy; thêm bảo hiểm / thuế — đọc mục 6 trước.
- Làm lại trên bản code khác — mục 8.

# Điều kiện trước

- Đã có F-035 (0027), F-071 (0048: `AuthFailures`, trigger chặn xóa), sổ quỹ `SystemCode` (0047).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm), skill `chong-sua-du-lieu`.
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm `cơ-sở-dữ-liệu/chuyển-đổi/0049_cham_cong_tinh_luong.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Hàm thuần: `domain/payroll.js` (`rosterWindow`, `pickRoster`, `evaluate`, `splitMinutes`, `intervalPay`, `hourlyEquivalent`, `payLine`, `splitByMinutes`, `pinProblem`, `ISSUE_LABEL`), `domain/vietqr.js` (`BANKS`, `crc16`, `transferContent`, `vietQrPayload`).
3. Máy chủ: `auth/actorPin.js` (`ACTOR_PIN` Symbol, `withActorPin` — gắn ở `requireStaff` / `requireAdmin` / `optionalStaff` / `requirePermission`), `services/pinService.js` (`setOwnPin`, `resetPin`, `verifyPin`, `assertActorPin`), `services/attendanceService.js` (`kioskMode`, `onLogin` / `onLogout` / `autoClose` theo chế độ, `board`, `punch`, `shiftBoard`, `applyShiftClose`, `decide`, `dispute`, `resolveDispute`, `assertMonthOpen`), `services/payrollService.js` (`compute`, `get`, `lock`, `reopen`, `teamBonus`, `payQr`, `markPaid`, `mine`, `weekReport`, `laborByDay`), `repositories/payrollRepo.js`, `routes/payroll.js` (`payrollRouter` thẳng `/api`, `payrollAdminRouter` dưới `/api/admin`), `userService.switchTo`.
4. Chỗ móc PIN thao tác tiền: `billingService.approvalFor` (giảm giá tay > 0), `refundService.refund`, `voidService.approverFor` (khi cần duyệt), `cashService.create` (khoản chi) / `review` (tự duyệt) / `voidTxn`. Lãi/lỗ: `pnlRepo.daily({ excludeAdvances })`, `pnlService.report` (`laborCosts`, `payrollActive`).
5. Giao diện: `js/pin-pad.js`, `js/staff-pin.js` (`registerPinPrompter`, `kioskDialog`, `switchUserDialog`, `setPinDialog`), `js/api.js` (`setPinPrompter` — 403 `PIN_REQUIRED` → hỏi PIN → gửi lại với header), `pos-shell.js` (nút Chấm công / Đổi người, dải `#no-pin`, mục Giờ công), `pos-shift.js` (`attendanceCheck` trong hộp đóng ca), `cash-book.js` (người nhận tạm ứng), `pages/pos-me.js` + `pos/me.html` (SCR-52), `pages/admin-payroll.js` + `admin/payroll.html` (SCR-51), `admin-staff.js` (`settingsCard`, `renderWeek`), `admin-users.js` (Xóa PIN), `admin-pnl.js` (dòng Lương nhân viên). CSS `.pin-*`, `.person-*`, `.pending-list`, `.pay-qr`, in phiếu `body.print-payslip` (`base.css`).

# 2. Quy tắc (BR-109, BR-110)

| Quy tắc | Chi tiết |
| --- | --- |
| Chế độ | `attendance.mode`: `KIOSK` (mặc định) — chấm công ở màn chung, đăng nhập / đăng xuất **không** chấm công, job mở > 14 giờ → đóng ở +8 giờ `NeedsReview`; `LOGIN` — như F-035 (token hết hạn → đóng) |
| PIN | 4–6 số, tự đặt sau mật khẩu (`PASSWORD_INVALID`), `pinProblem` chặn lặp / dãy liên tiếp (`PIN_WEAK`), bcrypt; quản lý chỉ `pin-reset`. Sai 5 / 15 phút theo (người bị thử, người đứng quầy) → `429 PIN_LOCKED` + `AUTH_LOCK` (kind `PIN`). Kiểm khóa **trước** bcrypt |
| Đổi người | `POST /api/auth/switch` → token của người đó (nhân viên / trưởng ca). Ở `LOGIN` mode sẽ chấm vào như đăng nhập |
| PIN thao tác tiền | `security.money_pin` (mặc định bật), quản lý miễn; người dùng phiên nhập **PIN của chính mình** mỗi lần — chống phiên bỏ quên bị người khác dùng, chống mạo danh. Thu thêm (khoản thu) không cần |
| Đóng ca | Chấm ra hộ → `NeedsReview`, `ClosedBy`; `CheckResult` OK / DISPUTED; không đụng bản ghi `UserId = người đóng ca` |
| Tính giờ | Có lịch → giao với lịch; dư > 15 phút → `EXTRA`; không lịch → giờ thật + `OFF_SCHEDULE`; `NeedsReview` → `AUTO_CLOSED`; bị báo vắng → `DISPUTED`; nhân viên báo sai chưa xử lý → `EMPLOYEE_DISPUTE`; đang mở → `OPEN`. Quyết định (chỉ quản lý): `ACTUAL` / `SCHEDULE` / `NONE`. Trễ: vào > lịch + 15 phút. Vắng: lịch đã qua không có lần chấm công giao. **Theo phút**, tháng theo giờ vào (VN) |
| Tiền | Lương giờ: phút/60 × giá; tháng: giữ nguyên; đêm: phút đêm (từ `NightStart` tới 06:00) × phụ cấp; lễ: phút lễ × lương giờ quy đổi (tháng ÷ 208) × (hệ số − 1); chuyên cần khi trễ = vắng = 0 và có giờ; + cộng / trừ − tạm ứng đã duyệt. Làm tròn từng khoản |
| Chốt | Chỉ tháng đã hết (`MONTH_NOT_ENDED`), hết việc chờ (`PAYROLL_PENDING`) → ảnh chụp `PayrollLines`; tháng đã chốt: sửa / thêm giờ công, quyết định, cộng trừ, báo sai → `409 PAYROLL_LOCKED`; mở lại cần lý do; chốt lại giữ `PaidAt` / `AckAt` |
| Tạm ứng | Danh mục `SALARY_ADVANCE` ("Lương tạm ứng", `RequiresApproval = 1`): bắt buộc `employeeId`; người nhận không tự duyệt (`SELF_APPROVAL`, trừ quản lý); đã duyệt + chưa hủy → trừ vào tháng của `CreatedAt` |
| VietQR | `vietQrPayload` (EMVCo + NAPAS `A000000727`, `QRIBFTTA`, `010212` khi có tiền, CRC-16/CCITT-FALSE); nội dung `transferContent` không dấu ≤ 25 ký tự; nhắc đối chiếu **tên chủ tài khoản** trong app ngân hàng |
| Lãi/lỗ | Có `PayProfiles` → `laborByDay` cộng lương theo ngày (lương tháng chia đều), bỏ `SALARY_ADVANCE` khỏi chi phí; nhắc xóa khoản lương ở Chi phí cố định |
| Riêng tư | `/api/me/*` chỉ của chính mình; bảng lương, hồ sơ chỉ quản lý (trưởng ca 403) |

# 3. Dữ liệu

- Migration `0049`: `Users.PinHash`, `PinSetAt`; `Attendance` (`KIOSK`, `NeedsReview`, `ClosedBy`, `CheckResult`, `CheckedBy`, `CheckedAt`, `PayDecision`, `DecidedBy`, `DecidedAt`, `DecisionNote`); `AuthFailures.Kind` + `PIN`; `PayProfiles`, `Holidays`, `PayrollAdjustments`, `PayrollRuns`, `PayrollLines`, `AttendanceDisputes`; `CashTransactions.EmployeeId`; danh mục `SALARY_ADVANCE` (gắn vào "Lương tạm ứng" có sẵn hoặc tạo mới); trigger chặn xóa `PayrollRuns`, `AttendanceDisputes`.
- Thủ tục: `sp_CreateCashTxn` (`@EmployeeId = NULL`), `sp_VoidCashTxn` (khoản thay thế giữ `EmployeeId` khi vẫn là tạm ứng).
- Lịch sử sửa giờ công lấy từ `AuditLogs` (`Entity = 'Attendance'`, `AfterJson.input.reason` / `.note`) — không thêm bảng lịch sử riêng.

# 4. API

Xem bảng đầy đủ ở `api-contract.md` mục F-072 / F-073. Hay dùng: `POST /api/auth/pin`, `POST /api/auth/switch`, `GET /api/attendance/board`, `POST /api/attendance/punch`, `GET /api/attendance/shift/{id}`, `POST /api/shifts/{id}/close` (+ `attendance`), `GET /api/me/attendance`, `GET /api/admin/payroll?month=`, `POST /api/admin/payroll/{month}/lock` · `/reopen`, `POST /api/admin/attendance/{id}/decision`, `GET /api/admin/payroll/{month}/lines/{userId}/qr`, `PUT /api/admin/pay-profiles/{id}`, `PUT /api/admin/attendance-settings`.

# 5. Giao diện

- **Máy quầy:** Chấm công → ô người → bàn phím PIN (12 nút, số xáo bằng `crypto.getRandomValues`) → Vào ca / Ra ca. Đổi người → ô người → PIN → lưu phiên mới (`saveStaffSession`) → tải lại trang. Thao tác tiền → `api.js` bắt `PIN_REQUIRED` → `pinPad` "Nhập PIN của …" → gửi lại; sai thì nhập lại tại chỗ.
- **Đóng ca:** mục "Chấm công trong ca" chỉ hiện ở chế độ màn chung.
- **Giờ công của tôi** (`/pos/me`), **Lương** (`/admin/payroll`), **Nhân sự** (Cách chấm công, Báo cáo tuần), **Tài khoản** (Xóa PIN), **Lãi/lỗ** (Lương nhân viên).

# 6. Mở rộng — chỗ dễ sai

- **Thêm thao tác tiền cần PIN:** gọi `await assertActorPin(user)` trong service (sau khi biết chắc là thao tác tiền), không cần sửa giao diện — `api.js` tự hỏi PIN. Đừng đọc PIN từ body; chỉ header `X-Actor-Pin` qua `user[ACTOR_PIN]`.
- **Giờ DATETIME2(0):** làm tròn lên tới nửa giây — đừng so giờ vừa ghi với `SYSUTCDATETIME()` (lỗi đã gặp: người vừa chấm vào không có trong danh sách đóng ca → `forShift` dùng `'9999-12-31'` cho ca đang mở).
- **Test cũ:** `tests/helpers/testDb.js` và `kịch-bản/e2e-server.js` ghi `attendance.mode = LOGIN`, `security.money_pin = false`. Test / E2E mới tự bật (`PUT /api/admin/attendance-settings`) và E2E trả lại cuối bài.
- **Bảo hiểm, thuế TNCN:** chưa làm — nhập thành khoản khấu trừ (`PayrollAdjustments`) theo số kế toán đưa. Nếu làm thật: cột riêng trong `PayrollLines`, cài đặt tỉ lệ, đừng trộn vào `adjustments`.
- **VietQR cho thu tiền ở quầy:** dùng lại `vietQrPayload` (tài khoản quán trong Cài đặt), mỗi bill một nội dung riêng; tự xác nhận tiền về cần nguồn báo (Android / SePay) — xem ADR-030 không bao gồm.
- **Máy chấm công khuôn mặt:** chủ dự án đã bỏ (05/11/2026) — đừng làm lại khi chưa có yêu cầu mới.
- **Người thứ hai duyệt hoàn tiền:** chưa bắt buộc — nếu làm, thêm cài đặt, đừng đổi mặc định khi chưa hỏi chủ dự án.

# 7. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Không chốt được lương" | Còn việc chờ (trang Lương, mục Việc chờ xử lý) hoặc tháng chưa hết |
| "Lương của X sai" | Mở Phiếu: giờ được tính khác giờ chấm công vì đến sớm / về muộn không tính, làm thêm chưa duyệt; xem Giờ công của X (ai sửa, quyết định gì); tạm ứng đã duyệt bị trừ |
| "Nhân viên bị báo tạm khóa PIN" | Sai 5 lần trong 15 phút — người đó bấm "Quên PIN?" đặt PIN mới bằng mật khẩu là hết khóa ngay (TASK-090); xem cảnh báo "Sai mật khẩu nhiều lần" |
| "Quên PIN" | Ở màn Chấm công chạm tên mình → "Quên PIN?" → mật khẩu đăng nhập + PIN mới (TASK-090, skill `nhac-va-bao-quen-cham-cong`); quên cả mật khẩu → quản lý đặt lại mật khẩu ở Tài khoản |
| "Bị hỏi PIN hoài" | Chỉ thao tác tiền hỏi; tắt ở Nhân sự → Cách chấm công (không khuyến nghị) |
| "Tạm ứng không trừ lương" | Khoản phải **đã duyệt**, có người nhận, chưa hủy, ghi trong tháng đó |
| "Lãi/lỗ trừ lương hai lần" | Xóa khoản lương ở Chi phí cố định khi đã nhập hồ sơ lương |
| "Đã trả lương rồi mới thấy sai" | Mở lại bảng lương (ghi lý do), sửa, chốt lại — trạng thái đã trả giữ nguyên; chênh lệch trả thêm / trừ tháng sau bằng khoản cộng / trừ |

# 8. Làm lại từ đầu (bản code chưa có F-072 / F-073)

1. Docs trước: ADR, FEATURE, BR, US, AC, tc-map (quy trình 15 bước).
2. Migration chỉ thêm (mục 3) + sửa hai thủ tục sổ quỹ.
3. `domain/payroll.js`, `domain/vietqr.js` + test unit trước (luật giờ, tiền, CRC).
4. PIN (`pinService`, `actorPin`, khóa tạm F-071) → màn chung, đổi người, đóng ca → móc PIN vào các thao tác tiền.
5. `payrollRepo` / `payrollService` / routes → khóa tháng trong `attendanceService` → Lãi/lỗ.
6. Giao diện (mục 5), thêm `/pos/me`, `/admin/payroll` vào `a11y.spec.js`.
7. Test integration (`attendance-kiosk.test.js`, `payroll.test.js` — kịch bản tháng trước tính tay từng đồng) + E2E; chụp màn hình 1366 / 390 px.

# 9. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm). Số liệu lần làm: xem `TASK-089.md`.
