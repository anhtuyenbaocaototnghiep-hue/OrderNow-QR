---
name: chong-sua-du-lieu
description: Chống sửa / xóa dữ liệu trái phép cho cafe-qr-app — trưởng ca không tự sửa / tự thêm chấm công của mình (403 ATTENDANCE_SELF_EDIT); khóa tạm 15 phút khi sai mật khẩu đăng nhập (10 lần, theo tên + máy → 429 LOGIN_LOCKED) hoặc tài khoản duyệt ở quầy (5 lần, theo tên duyệt + người đứng quầy → 429 APPROVAL_LOCKED) kèm cảnh báo AUTH_LOCK cho chủ quán; trigger CSDL chặn xóa cứng Payments / Refunds / CashTransactions / Shifts / Attendance / OrderItemVoids / GiftDrinks / Alerts và nhật ký thao tác. Dùng khi task giao FEATURE-071 / ADR-029 / TASK-088, hoặc nhắc "chống sửa", "lỗ hổng", "tự sửa chấm công", "dò mật khẩu", "khóa tạm", "AuthFailures", "AUTH_LOCK", "HISTORY_NO_DELETE", "không cho xóa", "bảo mật backend".
---

# Mục đích

Ghi lại phần **chống sửa / xóa dữ liệu trái phép** (làm ngày 05/11/2026, TASK-088) để agent sau **sửa, mở rộng hoặc làm lại** mà không mở lại lỗ: người trong quán tự sửa giờ công, dò mật khẩu quản lý ở quầy, hoặc xóa dấu vết bằng SQL.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-029-chong-sua-du-lieu.md` (D-119…D-123) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-071.md` (AC-071-01…05) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-108 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-088.md`, `tài-liệu/kế-hoạch/TASK-088-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-071" |
| Nền | F-035 chấm công + nhật ký thao tác (0027, `TR_AuditLogs_ReadOnly`), F-036 ma trận quyền (`auth/permissions.js`), D-23 không tự duyệt sổ quỹ (`cashService`), F-060 cảnh báo bất thường (`alertService`, `Alerts`) |

# Khi dùng

- Đổi ngưỡng khóa (số lần, số phút), thêm loại thao tác cần khóa tạm.
- Thêm bảng mới cần "không xóa cứng" (mục 6).
- Chủ quán báo "bị khóa không đăng nhập được", "nhân viên báo tạm khóa khi nhờ duyệt", "cảnh báo Sai mật khẩu nhiều lần" (mục 7).
- Rà lỗ hổng tiếp (tự duyệt, sửa sau khi chốt, tài khoản CSDL) — đọc mục 6 trước.
- Làm lại trên bản code khác — mục 8.

# Điều kiện trước

- Đã có F-035 (0027), F-036, F-060 (0040, 0042).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm `cơ-sở-dữ-liệu/chuyển-đổi/0048_chong_sua_du_lieu.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Máy chủ: `repositories/authGuardRepo.js` (`count`, `add` — dọn dòng quá 1 ngày), `services/authGuardService.js` (`LIMITS`, `WINDOW_MINUTES`, `assertNotLocked`, `recordFailure`), `services/userService.js` (`login` nhận `{ ip }`, `resolveApproval`), `routes/public.js` (truyền `req.ip`), `services/attendanceService.js` (`assertNotSelf` trong `update` / `createManual`), `services/alertService.js` (`onAuthLock`).
3. Giao diện: `js/pages/pos-shift.js` (`notSelf` — ẩn nút Sửa + bỏ tên mình khỏi ô Thêm chấm công), `js/pages/admin-alerts.js` (`KIND.AUTH_LOCK`, dòng chi tiết trong `facts`).
4. Rà lại mọi `DELETE` trước khi thêm trigger: `grep -rn "DELETE" ứng-dụng/máy-chủ/src cơ-sở-dữ-liệu/thủ-tục ứng-dụng/máy-chủ/tests kịch-bản`.

# 2. Quy tắc (BR-108)

| Quy tắc | Chi tiết |
| --- | --- |
| Không tự sửa chấm công | Trưởng ca (MANAGER) sửa / thêm bản ghi của chính mình → `403 ATTENDANCE_SELF_EDIT`; quản lý (ADMIN) được. Kiểm ở máy chủ — giao diện chỉ ẩn nút |
| Khóa đăng nhập | 10 lần sai / 15 phút, khóa theo **tên (chữ thường, bỏ khoảng trắng) + máy (`req.ip`)** → `429 LOGIN_LOCKED`, kể cả gõ đúng. Máy khác, tên khác không bị ảnh hưởng (người dò không khóa được chủ quán ở máy khác). `loginLimiter` 5 / phút / máy vẫn giữ |
| Khóa tài khoản duyệt | 5 lần sai **tên hoặc mật khẩu** / 15 phút, khóa theo **tên duyệt + người đứng quầy** → `429 APPROVAL_LOCKED`. Đúng mật khẩu mà không đủ quyền (`roleOk` sai, tài khoản bị khóa) **không tính** — không phải dò |
| Kiểm khóa trước mật khẩu | `assertNotLocked` chạy trước `bcrypt.compare` — đang khóa thì không cho thử tiếp |
| Báo chủ quán | Lần sai **chạm đúng** ngưỡng (`n === LIMIT`) → `onAuthLock` → `Alerts` loại `AUTH_LOCK`, `HIGH`, `DedupeKey` = loại + khung 15 phút + sha1(tên, người / máy) (≤ 100 ký tự) → một cảnh báo một lần khóa; email tức thì nếu bật `alert.immediate` |
| Không lưu mật khẩu | `AuthFailures` không có cột mật khẩu; chỉ tên bị thử, người đứng quầy / máy, giờ |
| Không xóa cứng | Trigger `AFTER DELETE` `THROW 50250 HISTORY_NO_DELETE` trên 8 bảng; `AuditLogs`: `THROW 50251 AUDIT_NO_DELETE` nếu có dòng trong 12 tháng (job `audit-retention` xóa dòng quá 12 tháng vẫn chạy); sửa nhật ký vẫn bị `AUDIT_READONLY` (0027) |

# 3. Dữ liệu

- `AuthFailures (FailId, Kind LOGIN | APPROVAL, Username, ActorUserId, Ip, At)` + chỉ mục `(Kind, Username, At)`, `(At)`.
- `CK_Alerts_Kind` thêm `AUTH_LOCK` (drop + add, như 0042 thêm `COST_RISE`).
- Trigger tạo bằng vòng lặp trong migration (bảng nào chưa có thì bỏ qua). Dùng **`AFTER DELETE`**, không `INSTEAD OF` — bảng có khóa ngoại tự tham chiếu / nhiều bảng con; khóa ngoại chặn trước nếu còn dòng con (vẫn không xóa được).
- Test reset `CafeQrTest` bằng **DROP TABLE** (`db-migrate --reset`) nên trigger không cản test.

# 4. API

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/auth/login` | `429 LOGIN_LOCKED` |
| Mọi API nhận `adminUsername` / `adminPassword` | `429 APPROVAL_LOCKED` |
| `POST` / `PUT /api/attendance` | `403 ATTENDANCE_SELF_EDIT` |
| `GET /api/admin/alerts` | loại `AUTH_LOCK`, `detail: { kind, username, count, windowMinutes, actor, ip }` |

# 5. Giao diện

- **Màn Ca → Chấm công hôm nay:** dòng của chính trưởng ca không có nút **Sửa**; ô chọn người của **Thêm chấm công** không có tên mình.
- **Cảnh báo bất thường:** nhãn "Sai mật khẩu nhiều lần"; dòng chi tiết: loại, tên bị thử, số lần, người đứng quầy / máy gửi.
- Thông báo tạm khóa đi qua `errorMessage(err)` có sẵn (đăng nhập, hộp tài khoản duyệt) — không cần sửa từng màn.

# 6. Mở rộng — chỗ dễ sai

- **Thêm bảng "không xóa cứng":** trước hết `grep DELETE` xem có luồng nào xóa bảng đó (vd. `OrderItems` bị `sp_VoidOrderItem` xóa — **không** được chặn). Thêm migration mới tạo `TR_{bảng}_NoDelete` cùng mẫu; thêm tên bảng vào `PROTECTED` trong `tamper-guard.test.js`.
- **Đổi ngưỡng:** `LIMITS` / `WINDOW_MINUTES` trong `authGuardService.js`; câu báo dùng `WINDOW_MINUTES`. Test cũ gõ sai tài khoản duyệt < 5 lần cho cùng (tên, người đứng quầy) trong một file — tăng thì không sao, giảm thì rà lại.
- **Khóa hẳn tài khoản sau N lần:** đừng — người đứng quầy cố tình gõ sai sẽ khóa được quản lý ở mọi máy.
- **Chuỗi mã kiểm (hash chain) cho nhật ký:** chỉ có ích khi có neo ngoài (email mã đầu chuỗi mỗi ngày) **và** tách tài khoản CSDL — khóa bí mật nằm cùng `.env` với mật khẩu CSDL, mã nguồn công khai.
- **Tách tài khoản CSDL (vận hành, chủ dự án làm):** `cafe_app` hiện là `db_owner` (cần cho migration) — đề xuất login chạy app chỉ `db_datareader` / `db_datawriter` + `EXECUTE`, login riêng cho migration. Mật khẩu do chủ dự án tạo và dán vào `.env` — agent không tự tạo, không in.
- **Bắt buộc người thứ hai duyệt hoàn tiền / xóa món của chính lượt mình thu:** đổi cách làm ca một người — chờ chủ dự án quyết (đi cùng phương án chấm công).

# 7. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Tôi bị báo tạm khóa khi đăng nhập" | Tên đó đã sai 10 lần trên máy này trong 15 phút — đợi hết 15 phút, hoặc đăng nhập từ máy khác; xem trang Cảnh báo có ai thử không |
| "Nhân viên nhờ duyệt bị báo tạm khóa" | Người đó đã gõ sai tài khoản duyệt 5 lần — quản lý tự nhập ở máy của mình, hoặc nhân viên khác nhờ duyệt; xem cảnh báo "Sai mật khẩu nhiều lần" ghi tên người đã nhập |
| "Trưởng ca không sửa được giờ của mình" | Đúng thiết kế — quản lý sửa giúp (có lý do, có nhật ký) |
| "Muốn xóa giao dịch nhập nhầm" | Không xóa: dùng Hủy / Sửa (sổ quỹ), Hoàn tiền (lượt thu), sửa chấm công — đều có lý do và nhật ký |

# 8. Làm lại từ đầu (bản code chưa có F-071)

1. Docs trước: ADR, FEATURE, BR, US, AC, tc-map (quy trình 15 bước).
2. Rà: mọi chỗ sửa dữ liệu có kiểm "người làm ≠ người hưởng"? Mọi chỗ kiểm mật khẩu có giới hạn số lần? Có luồng nào xóa cứng bảng tiền / lịch sử?
3. Migration chỉ thêm: `AuthFailures`, mở rộng `CK_Alerts_Kind`, trigger.
4. Repo + service khóa tạm → móc vào `login` và `resolveApproval` (kiểm khóa trước, ghi lần sai khi sai tên / mật khẩu) → cảnh báo.
5. `assertNotSelf` cho chấm công; giao diện ẩn nút.
6. Test integration (`tests/tamper-guard.test.js`) + bước E2E trên màn Ca.

# 9. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm). Số liệu lần làm: xem `TASK-088.md`.
