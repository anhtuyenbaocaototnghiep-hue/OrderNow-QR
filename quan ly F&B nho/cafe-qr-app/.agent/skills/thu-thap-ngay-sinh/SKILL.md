---
name: thu-thap-ngay-sinh
description: Thu thập ngày sinh hội viên cho cafe-qr-app — ô "Ngày sinh" không bắt buộc lúc đăng ký (khách / quầy), năm sinh không bắt buộc ('--MM-DD', CSDL năm 1904), quầy nhắc hỏi khách quen chưa có ngày sinh kèm câu mẫu + "Khách không muốn cho" (nhắc lại sau 365 ngày), thẻ QR trên bàn mời tự thêm, khối "Thu thập ngày sinh" + bộ lọc "Chưa có ngày sinh" cho chủ quán. Dùng khi task giao FEATURE-068 / ADR-026 / TASK-085, hoặc nhắc "lấy ngày sinh", "hỏi ngày sinh", "năm sinh không bắt buộc", "--MM-DD", "1904", "BirthDateDeclinedAt", "khách không muốn cho", "chưa có ngày sinh", "nobirth", "birthDateInput".
---

# Mục đích

Ghi lại chức năng **thu thập ngày sinh hội viên** (làm ngày 04/11/2026, TASK-085) — phần "nuôi" dữ liệu cho quà sinh nhật (skill `qua-sinh-nhat-hoi-vien`, F-067). Agent sau đọc để **sửa, mở rộng hoặc làm lại** mà không làm sai quà sinh nhật, không để khách / nhân viên đổi ngày sinh lấy quà, không làm khách khó chịu vì bị hỏi mãi.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-026-thu-thap-ngay-sinh.md` (D-101…D-106) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-068.md` (AC-068-01…05) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-105 (dựa trên BR-104) |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-085.md`, `tài-liệu/kế-hoạch/TASK-085-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-068" |
| Nền | F-067 quà sinh nhật (skill `qua-sinh-nhat-hoi-vien`), F-014 hội viên, F-047 Thẻ thành viên, F-010 in QR, F-062 Chính sách dữ liệu |

# Khi dùng

- Đổi câu hỏi mẫu, thời gian nhắc lại sau "khách không muốn cho", nơi hiện ô ngày sinh.
- Chủ quán hỏi "làm sao biết khách sinh nhật", "sao quầy cứ nhắc hỏi", "sao khách mới khai mà chưa có quà" (mục 7).
- Thêm kênh thu ngày sinh (Zalo, phiếu giấy, nhập hàng loạt) — đọc mục 6 trước.
- Làm lại trên bản code khác — đi theo mục 8.

# Điều kiện trước

- Đã có F-067 (migration 0044, `birthdayService`, `domain/birthday.js`). Chưa có → làm skill `qua-sinh-nhat-hoi-vien` trước.
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm `cơ-sở-dữ-liệu/chuyển-đổi/0045_thu_thap_ngay_sinh.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Máy chủ: `domain/birthday.js` (`parseBirthDate`, `toDbBirthDate` / `fromDbBirthDate`, `staffShouldAsk`, `birthdayIn` đọc 5 ký tự cuối), `membersRepo` (map, `create`, view `nobirth`, `overview.noBirthDate`), `birthdayRepo` (`setSelfBirthDate`, `declineBirthDate`, `coverage`), `birthdayService` (`requireBirthDate`, `askOnSignup`, `staffAsk`, `selfSet`, `decline`), `memberService.lookup` / `register` / `adminUpdate`, `loyaltyService.summary` (`askBirthDate` khi `staff`), `routes/loyalty.js` (2 route mới), `middleware/validate.js` (`zBirthDate`).
3. Giao diện: `ui.js` (`birthDateInput`, `birthLabel`), `member-box.js` (đăng ký khách, `birthDateForm`), `billing-controls.js` (`lookup` đăng ký nhanh, `renderAskBirth`), `admin-members.js` (`VIEWS` `nobirth`, `?view=`, form hồ sơ), `admin-loyalty.js` (`birthCoverage`), `admin-qr-print.js` (`.qr-bday`), `chinh-sach-du-lieu.html`; CSS `.birth-*`, `.bday-ask` (`base.css`), `.qr-bday`, `.bday-cover`, `.bday-tips` (`admin.css`).
4. `grep -rn "birthDate" ứng-dụng` trước khi đổi dạng ngày sinh — mọi chỗ hiển thị phải qua `birthLabel`, không `slice(8, 10)`.

# 2. Quy tắc nghiệp vụ (BR-105)

| Quy tắc | Chi tiết |
| --- | --- |
| Dạng ngày sinh | API: `YYYY-MM-DD` hoặc `--MM-DD` (ISO 8601, không năm). Năm 1910…năm nay, ngày không sau hôm nay; 29/02 không năm hợp lệ. Sai → `400 VALIDATION_ERROR` "Ngày sinh không hợp lệ" |
| Lưu CSDL | Không năm → **năm 1904** (`NO_YEAR`, năm nhuận). Chỉ repository biết; `MIN_YEAR = 1910` để 1904 không trùng năm thật |
| Hỏi lúc đăng ký | Form khách + "Đăng ký nhanh" ở quầy có ô ngày sinh **không bắt buộc**, chỉ khi quà sinh nhật bật (`lookup` trả `askBirthDate`). Ngày sai → không tạo hội viên |
| Tự khai | Ngày sinh lúc đăng ký, khách tự thêm, nhân viên ghi hộ → `BirthDateSelfAt` = lúc ghi → điều kiện 30 ngày của BR-104. Quản lý lưu hồ sơ → `BirthDateSelfAt = NULL` (đã xác minh) |
| Quầy nhắc | Hội viên chưa có ngày sinh + tính năng bật + không có "khách không muốn cho" trong 365 ngày (`DECLINE_DAYS`) → `loyalty.askBirthDate` (chỉ quầy; khách không nhận cờ này) |
| Nhân viên | Chỉ **thêm** khi còn trống (`UPDATE … WHERE BirthDate IS NULL`); đã có → `409 BIRTHDATE_SET`. Sửa vẫn chỉ quản lý |
| Từ chối | "Khách không muốn cho" → `BirthDateDeclinedAt`; Thẻ thành viên của khách vẫn mời tự thêm (khách đổi ý được) |
| Thẻ QR | Quà sinh nhật bật → mỗi thẻ in thêm dòng mời thêm ngày sinh |

# 3. Dữ liệu

- Migration `0045`: `Members.BirthDateDeclinedAt DATETIME2(0) NULL`; ẩn danh → NULL (`membersRepo.anonymize`).
- `Members.BirthDate` không đổi kiểu; SQL dùng `MONTH()` / `DAY()` (bộ lọc "Sinh nhật tháng này", phân khúc chiến dịch) chạy đúng với năm 1904.
- `membersRepo.map` / `birthdayRepo.membersWithBirthDate` trả `--MM-DD`; `create` / `update` / `setSelfBirthDate` nhận `--MM-DD` và đổi sang 1904.

# 4. API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `POST /api/members/lookup` | công khai / nhân viên | Không thấy → `{ found: false, member: null, askBirthDate }` |
| `POST /api/members` | công khai / nhân viên | `birthDate` không bắt buộc |
| `POST /api/members/{id}/birth-date` | nhân viên | `{ birthDate }` → như `GET …/loyalty`; 409 khi đã có |
| `POST /api/members/{id}/birth-date/decline` | nhân viên | → như `GET …/loyalty`; 409 khi đã có ngày sinh |
| `GET /api/admin/members?view=nobirth` | ADMIN | Ghé gần đây trước; dòng có `birthDateDeclinedAt`; `overview.noBirthDate` |
| `GET /api/admin/birthday` | ADMIN | Thêm `coverage { total, withBirthDate, recentTotal, recentWithBirthDate }` (đang hoạt động; recent = ghé 30 ngày) |

# 5. Giao diện

- **`birthDateInput({ id, label, value })`** (`ui.js`): `role=group` + nhãn; chọn Ngày (`{id}-day`), Tháng (`{id}-month`, "Tháng 1…12"), ô Năm (`{id}-year`). `read()` → `{ value: '' | 'YYYY-MM-DD' | '--MM-DD', error }`. Id đang dùng: `reg-birth` (khách đăng ký), `self-birth` (Thẻ thành viên), `pos-reg-birth`, `pos-ask-birth` (quầy), `mem-birth` (hồ sơ). Lưới 3 cột `1fr 1.25fr 0.9fr` — khung quầy ~300 px không cắt chữ; trong form hai cột của hồ sơ để `.field.span-all`.
- **Quầy** (`billing-controls.js`): khung `.bday-ask` (`role=status`) dưới dải sinh nhật: "Chưa có ngày sinh — hỏi khách:", câu mẫu *"Anh/chị cho em xin ngày sinh để quán tặng quà tuần sinh nhật nhé?"*, ô ngày sinh, **Lưu ngày sinh**, **Khách không muốn cho**; xong thì thay `st.loyalty` bằng kết quả trả về và vẽ lại.
- **Khách**: ô ngày sinh trong form đăng ký (chỉ khi `askBirthDate`), câu đồng ý thêm "ngày sinh (nếu có)"; Thẻ thành viên dùng cùng ô.
- **Quản lý**: tab Quà sinh nhật → khối "Thu thập ngày sinh" (thanh %, khách ghé 30 ngày, 4 cách lấy ngày sinh, nút **Xem ai chưa có ngày sinh (N)** → `/admin/members?view=nobirth`); hồ sơ hội viên ghi "(khách tự khai)" khi `birthDateSelfAt`.

# 6. Mở rộng — chỗ dễ sai

- **Đổi cách lưu không năm** (cột riêng ngày / tháng): phải sửa cả `MONTH()` trong `membersRepo` (view `birthday`, `overview`) và `campaignRepo`; giữ API `--MM-DD` để giao diện không đổi.
- **Thêm kênh nhập** (nhập Excel, Zalo): ngày sinh không do quản lý nhập tay trên hồ sơ → luôn là tự khai (`setSelfBirthDate`), không đè ngày đã có.
- **Tặng điểm để đổi lấy ngày sinh**: ADR-026 không chọn (khuyến khích khai bừa). Muốn làm → ADR mới.
- **Hiển thị ngày sinh**: dùng `birthLabel(s)` / `birthLabel(s, { withYear: false })`; `slice` trên `--MM-DD` sẽ ra chuỗi rỗng.
- **Tra cứu trả thêm trường**: test cũ `members.test.js` so khớp nguyên object `lookup` — đổi shape thì cập nhật test đó.

# 7. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Làm sao biết khách tới sinh nhật?" | App so ngày sinh trong hồ sơ với hôm nay (± số ngày ở tab Quà sinh nhật). Không có ngày sinh thì không biết → dùng 5 cách: hỏi lúc đăng ký, năm không bắt buộc, nhân viên hỏi khi quầy nhắc, thẻ QR trên bàn, hỏi dần hội viên cũ theo danh sách "Chưa có ngày sinh" |
| "Khách mới khai mà chưa có quà" | Đúng luật: ngày sinh tự khai phải trước sinh nhật ≥ 30 ngày. Khách đưa giấy tờ → quản lý mở hồ sơ, bấm Lưu → đã xác minh, có quà ngay |
| "Quầy không nhắc hỏi nữa" | Khách đã có ngày sinh, hoặc nhân viên đã bấm "Khách không muốn cho" (nhắc lại sau 365 ngày), hoặc quà sinh nhật đang tắt |
| "Ô ngày sinh không hiện khi đăng ký" | Quà sinh nhật đang tắt (D-101) |
| "Nhân viên ghi sai ngày sinh" | Nhân viên không sửa được; quản lý sửa ở Hội viên → hồ sơ → Sửa thông tin |

# 8. Làm lại từ đầu (bản code chưa có F-068)

1. Docs trước: ADR, FEATURE, BR, US, AC, tc-map (quy trình 15 bước).
2. Migration chỉ thêm `BirthDateDeclinedAt`.
3. `domain/birthday.js`: `parseBirthDate`, `toDbBirthDate` / `fromDbBirthDate`, `staffShouldAsk`; sửa `birthdayIn` đọc `slice(-5)` → test unit.
4. Repository đổi dạng ở cửa vào / ra; `create` nhận `birthDate` + `BirthDateSelfAt`; view `nobirth`; `coverage`; `declineBirthDate`.
5. Service + route; `lookup` thêm `askBirthDate`; `summary(staff)` thêm `askBirthDate`.
6. `birthDateInput` / `birthLabel` rồi thay 5 chỗ nhập + mọi chỗ hiển thị.
7. Test integration (`tests/birthdate-collect.test.js`) + E2E; chụp màn hình 390 px (khách) và khung quầy (~300 px) để kiểm chữ trong ô chọn không bị cắt.

# 9. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` (402/402 lúc làm) · `npm run test:e2e` (62/62) · `npm run trace -- --check` (153 US, 416 AC) · `npm run db:migrate` (CafeQrDev, chỉ thêm).
