---
name: qua-sinh-nhat-hoi-vien
description: Quà sinh nhật hội viên cho cafe-qr-app — trong tuần sinh nhật quầy thấy dải "Sinh nhật khách", điện thoại khách hiện lời chúc, quà (giảm % / giảm tiền / tặng 1 món) là voucher nguồn BIRTHDAY phát một lần mỗi năm và tự trừ khi thu tiền; khách tự thêm ngày sinh một lần (phải trước 30 ngày); quản lý bật / chọn quà / xem sinh nhật sắp tới. Dùng khi task giao FEATURE-067 / ADR-025 / TASK-084, hoặc nhắc "sinh nhật", "quà sinh nhật", "birthday", "BirthdayGifts", "voucher BIRTHDAY", "skipBirthday", "tặng 1 món", "BirthDateSelfAt", "tuần sinh nhật".
---

# Mục đích

Ghi lại đầy đủ chức năng **quà sinh nhật hội viên** (làm ngày 03/11/2026, TASK-084) để agent sau **sửa, mở rộng hoặc làm lại** mà không phát quà hai lần, không để khách đổi ngày sinh lấy quà, không làm lỗi màn thu tiền.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-025-qua-sinh-nhat.md` (D-95…D-100) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-067.md` (AC-067-01…07) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-104 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-084.md`, `tài-liệu/kế-hoạch/TASK-084-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-067" |
| Nền | F-014 hội viên, F-038 voucher (mã, một lần, khung thu tiền), F-047 Thẻ thành viên, F-062 Chính sách dữ liệu — skill `extend-features`, `advanced-features` |
| Lấy ngày sinh | F-068 (TASK-085): hỏi lúc đăng ký, năm không bắt buộc (`--MM-DD`), quầy nhắc hỏi — skill `thu-thap-ngay-sinh` |

# Khi dùng

- Đổi quà mặc định, số ngày quanh sinh nhật, điều kiện 30 ngày, lời chúc.
- Chủ quán báo "khách sinh nhật mà không thấy quà", "quà bị trừ hai lần", "không muốn dùng quà lượt này" (mục 7).
- Thêm loại quà (tặng điểm, nhân đôi điểm), gửi lời chúc qua Zalo / SMS — đọc mục 6 trước.
- Làm lại trên bản code khác — đi theo mục 8.

# Điều kiện trước

- Đã có: hội viên + `Members.BirthDate` (F-014), voucher + khung thu tiền (F-038), Thẻ thành viên (F-047), tab Tích điểm & voucher (S-40).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm migration `cơ-sở-dữ-liệu/chuyển-đổi/0044_qua_sinh_nhat.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Đọc `ứng-dụng/máy-chủ/src/domain/birthday.js` (hàm thuần), `src/repositories/birthdayRepo.js`, `src/services/birthdayService.js`; chỗ móc vào: `loyaltyService.prepare` (tự áp) và `summary` / `memberCard` (trạng thái), `billingService.computeTotals` + `loyaltyInput` (`skipBirthday`, `totals.birthdayApplied`).
3. Giao diện: `billing-controls.js` (`renderBirthday`, `showEarn`), `member-box.js` (`birthdayNote`, `birthDateForm`), `admin-loyalty.js` (`renderBirthday`), `ui.js` (`voucherValue` tặng món), CSS `.bday-strip` / `.bday-note` trong `base.css`.
4. Chạy test nền: `node --env-file=.env --test --test-concurrency=1 ứng-dụng/máy-chủ/tests/birthday.test.js`.

---

# 2. Quyết định đã chốt (ADR-025) — không tự đổi

| Mã | Quyết định | KHÔNG chọn |
| --- | --- | --- |
| D-95 | Tuần sinh nhật = ngày sinh năm nay ± 3 ngày (giờ quán); 29/02 → 28/02; vắt qua năm | Chỉ đúng ngày sinh (khách không ghé đúng hôm đó) |
| D-96 | Quà = voucher `BIRTHDAY` gắn hội viên, **một lần mỗi năm**, phát khi hội viên xuất hiện — không job | Job phát cho mọi người sắp sinh nhật (voucher chết, cần chống chạy trùng) |
| D-97 | **Máy chủ tự áp** khi thu tiền chưa chọn voucher; `skipBirthday` để không dùng lượt này | Trình duyệt tự chọn mã (không biết bill có món tặng chưa → lỗi xem trước) |
| D-98 | Quầy: dải + trạng thái; khách: lời chúc, **không mã**; hóa đơn: "Quà sinh nhật" | Hiện mã cho khách (khách đọc mã cho người khác dùng) |
| D-99 | Khách tự thêm ngày sinh **một lần**, tính quà khi thêm trước ≥ 30 ngày; quản lý lưu hồ sơ = đã xác minh; nhân viên không sửa ngày sinh | Cho khách sửa nhiều lần (đổi ngày lấy quà) |
| D-100 | Mặc định **tắt** | Bật sẵn khi nâng cấp (chi phí bất ngờ) |

Muốn đổi một dòng trên → hỏi chủ dự án, viết ADR mới.

---

# 3. Luật và luồng

**Tuần sinh nhật** — `currentWindow(birthDate, today, windowDays)` xét ngày sinh nhật của năm trước / năm nay / năm sau, lấy cái có `|today − ngày| ≤ windowDays` → `{ date, year, offset, from, to }`. `offset` âm = chưa tới, 0 = hôm nay, dương = đã qua. `year` là năm của **ngày sinh nhật** (sinh 01/01, hôm nay 30/12/2026 → năm 2027) và là khóa `BirthdayGifts.GiftYear`.

**Trạng thái** — `birthdayService.statusFor(member, { withCode })`:

```
không ngày sinh / không hoạt động / đã ẩn danh / ngoài tuần → null
đã có quà năm đó → READY | USED | EXPIRED (theo voucher)
chưa có quà:  tính năng tắt → OFF
              ngày sinh tự thêm < 30 ngày trước sinh nhật → WAITING
              món tặng không còn bán / giá 0 → OFF
              còn lại → PHÁT QUÀ (birthdayRepo.issue) → READY
```

Phát quà: INSERT `Vouchers` (mã `SN` + 8 hex, `Source = 'BIRTHDAY'`, `MemberId`, % + trần / số tiền / `MenuItemId` + `DiscountAmount` = giá món, hạn = hết ngày `to` giờ quán) rồi INSERT `BirthdayGifts` — **cùng transaction**. Trùng khóa chính → hủy cả hai, đọc lại quà đã có. Test AC-067-02 gọi 4 yêu cầu cùng lúc.

**Ai gọi `statusFor`** (nên quà phát ở đâu cũng được): `loyaltyService.summary` (quầy `GET /members/{id}/loyalty`, xem trước thu tiền, thông tin hội viên của phiên cho khách), `memberCard`, `usableGift` trong `prepare`. Nó chạy trước khi đọc danh sách voucher để quà vừa phát có ngay trong danh sách.

**Tự áp** — `loyaltyService.prepare({ …, skipBirthday })`:

1. Chưa có `voucherCode`, có hội viên, không `skipBirthday` → `usableGift(member)`; quà tặng món chỉ lấy khi `cheapestUnit(orders, [menuItemId])` có → gán `voucherCode`.
2. Đường voucher chung: `checkVoucher` (còn hạn, chưa dùng, đúng chủ). Voucher có `menuItemId` → `amount = đơn giá món trên bill`, bỏ `percent` / trần; bill không có món → `409 VOUCHER_ITEM_NOT_IN_BILL` (chỉ xảy ra khi chọn tay).
3. Nguồn `BIRTHDAY` → `voucher.label = 'Quà sinh nhật' (+ ' — tặng 1 …')`, `birthdayApplied = true`. `settleTotals` dùng `voucher.label` cho dòng breakdown; hóa đơn (`paymentBreakdown`) đọc `voucherSource`.
4. `sp_Loyalty` đánh dấu voucher đã dùng như mọi voucher — **không sửa SP**.

Xem trước và lúc thu chạy cùng `computeTotals` nên luôn khớp. Body của quầy gửi `skipBirthday: true` khi nhân viên bấm "Không dùng quà lần này" (`billingFields` trong `routes/staff.js`, `loyaltyInput`).

**Quầy** — `billing-controls.js`: `st.loyalty.birthday` (từ `/members/{id}/loyalty`) + `st.birthdayApplied` (từ `showEarn(totals)` sau mỗi lần xem trước) → `renderBirthday()` vào `birthdaySlot` riêng (không vẽ lại ô đổi thưởng). Đổi hội viên / tải lại → `skipBirthday = false`.

**Khách** — `member-box.js`: `birthdayNote(l.birthday)` trong ô hội viên và Thẻ thành viên (dòng "Bạn có N voucher — báo nhân viên" bỏ quà sinh nhật ra vì quà tự trừ); `askBirthDate` → `birthDateForm` gọi `POST /api/sessions/{id}/member/birthday` (thiết bị trong phiên; `UPDATE … WHERE BirthDate IS NULL` nên chỉ một lần), trả về Thẻ thành viên mới.

**Quản lý** — `GET / PUT /api/admin/birthday`; `adminGet` tính danh sách sắp tới bằng JS trên mọi hội viên có ngày sinh (quán nhỏ: vài trăm–vài nghìn dòng). Trạng thái thêm `NOT_VISITED` (đang trong tuần, chưa ghé) và `UPCOMING`.

---

# 4. Dữ liệu và cài đặt

- Migration 0044: `Members.BirthDateSelfAt`; `Vouchers.MenuItemId` (FK MenuItems); `CK_Vouchers_Source` thêm `BIRTHDAY`; bảng `BirthdayGifts (MemberId, GiftYear) PK`, `VoucherId` UNIQUE.
- `membersRepo.update` (quản lý lưu hồ sơ) đặt `BirthDateSelfAt = NULL`; `anonymize` xóa cả ngày sinh lẫn dấu.
- Cài đặt (mặc định trong code): `birthday.enabled` false, `birthday.kind` PERCENT, `birthday.value` 20, `birthday.max_discount` 50000, `birthday.menu_item_id`, `birthday.window_days` 3. Giá trị trống ghi `''` (bảng `Settings` không nhận NULL). Thêm khóa mới phải sửa `settingsService` (giá trị + `KEYS`), zod ở `marketing.js`, `settingsView` / `adminSave`, form tab.
- Hằng số: `SELF_WAIT_DAYS` 30 (domain), `UPCOMING_DAYS` 14 (service), `windowDays` 0–15.

---

# 5. Kiểm thử

`tests/birthday.test.js`: ngày sinh tính theo hôm nay (`born(offset)` = năm 1996 + ngày hôm nay ± offset — năm nhuận nên 29/02 luôn hợp lệ). Đặt ngày sinh thẳng trong DB để tách khỏi luồng quản lý; AC-067-05 mới đi qua `PUT /api/admin/members/{id}`.

E2E (`flow.spec.js`, AC-067-07): bấm **nhãn** công tắc (ô tích `.switch` rộng 0, `.check()` không bấm được); gắn hội viên vào phiên bằng API rồi chờ điện thoại tự cập nhật qua realtime; kiểm dòng `.due-row` "Quà sinh nhật" trong ngăn Thu tiền; thu tiền bằng API rồi mở trang hóa đơn.

---

# 6. Giới hạn đã chấp nhận

- Chỉ chúc trong app (quầy, điện thoại đang ở quán, hóa đơn). Chưa gửi Zalo / SMS — cần kênh gửi (F-037 mới xuất CSV).
- Quà tặng món dùng chung với "đổi thưởng tặng món" cùng một món, bill chỉ 1 phần → có thể trừ hai lần giá món đó (giới hạn bởi tổng bill). Hiếm; chưa chặn.
- Quà phát lúc hội viên xuất hiện: khách không ghé trong tuần sinh nhật thì không có quà (đúng ý D-96).
- Danh sách sắp tới tính trong bộ nhớ; quán rất lớn (hàng chục nghìn hội viên) nên chuyển sang SQL theo tháng / ngày.
- Đổi loại quà giữa chừng không đổi quà đã phát năm đó.

---

# 7. Xử lý khi chủ quán thắc mắc

| Hiện tượng | Kiểm |
| --- | --- |
| Khách sinh nhật mà không có dải / lời chúc | Hội viên có ngày sinh chưa (trang Hội viên)? Hôm nay trong ± `window_days`? Bàn / lượt thu đã gắn đúng hội viên? |
| Có dải nhưng "Nhớ chúc mừng khách" (không quà) | Tính năng đang tắt (`OFF`), hoặc món tặng đã ẩn / giá 0 |
| "Quà áp dụng từ lần sinh nhật sau" | Ngày sinh khách tự thêm chưa đủ 30 ngày — quản lý mở hồ sơ, kiểm, bấm Lưu để xác minh |
| Không thấy trừ quà tặng món | Bill chưa có món đó — thêm món là tự trừ |
| Khách muốn để dành quà | Bấm "Không dùng quà lần này"; quà giữ tới hết tuần sinh nhật |
| Muốn tặng lại lần hai trong năm | Không làm được bằng quà sinh nhật — tạo voucher tay ở tab Voucher |

---

# 8. Làm lại trên bản code khác

1. Viết ADR, FEATURE, BR, US, AC, TASK, plan trước.
2. Migration → `domain/birthday.js` + unit test → `birthdayRepo` (phát quà trong transaction, bắt 2601/2627) → `birthdayService`.
3. Móc vào `loyaltyService` (`summary`, `memberCard`, `prepare`), `billingService` (`skipBirthday`, `birthdayApplied`), `routes/staff.js` (`billingFields`), `pricing.settleTotals` (`voucher.label`), `ordersRepo` (`VoucherSource`) + `paymentBreakdown`, `membersRepo` (`BirthDateSelfAt`).
4. Route: `GET / PUT /api/admin/birthday` (marketing), `POST /api/sessions/{id}/member/birthday` (public).
5. Giao diện theo thứ tự: khung thu tiền → ô hội viên / Thẻ thành viên → tab quản lý → nhãn nguồn voucher ở trang Hội viên / tab Voucher → trang Chính sách dữ liệu.
6. Thêm tab mới vào `a11y.spec.js` (quét 320 / 390 px).

# Validation

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

Test hay bị bỏ sót (đều có trong `tests/birthday.test.js`): nhiều yêu cầu cùng lúc chỉ một quà; khách không thấy mã; quà tặng món khi bill chưa có món không làm lỗi xem trước; `skipBirthday`; chọn voucher khác thì quà để dành; tự thêm ngày sinh lần hai → 409; ngày sinh tự thêm sát ngày → WAITING; quản lý lưu hồ sơ → có quà.

# Không làm

- Hiện mã quà cho khách; phát quà thứ hai trong năm; cho nhân viên sửa ngày sinh.
- Áp quà ở trình duyệt thay vì máy chủ; sửa `sp_Loyalty` cho quà sinh nhật.
- Bật quà sẵn trong migration.

# Hoàn thành khi

Mọi AC-067 có bằng chứng; test mới đỏ khi bỏ phần sửa tương ứng; docs đồng bộ; `npm run trace -- --check` PASS; agent không tự duyệt Gate.
