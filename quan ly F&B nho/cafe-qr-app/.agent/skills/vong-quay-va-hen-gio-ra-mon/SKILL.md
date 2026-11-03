---
name: vong-quay-va-hen-gio-ra-mon
description: Vòng quay may mắn sau khi thanh toán và "ra món khi bạn bè tới" cho cafe-qr-app — QR trên hóa đơn / nút ở màn cảm ơn, máy chủ chọn ô quà theo tỷ lệ, ngân sách lượt trúng mỗi ngày, voucher nguồn GAME, cộng điểm hội viên; khách gửi đơn hẹn "Sau 10 / 20 phút" hoặc "Khi bạn tới", quầy giữ phiếu cuối cột Mới, không kêu tới khi hết giữ. Dùng khi task giao FEATURE-065 / FEATURE-066 / ADR-024 / TASK-083, hoặc nhắc "vòng quay", "quay may mắn", "lucky spin", "SpinPrizes", "LuckySpins", "voucher GAME", "giữ món", "hẹn giờ làm", "Khi bạn tới", "Bạn đã tới", "HoldMode", "order.released".
---

# Mục đích

Ghi lại đầy đủ hai chức năng làm ngày 03/11/2026 (TASK-083) để agent sau **sửa, mở rộng hoặc làm lại** mà không làm lỗ quán (vòng quay phát quà quá tay) hay làm mất đơn (đơn giữ bị quên).

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-024-vong-quay-hen-gio-ra-mon.md` (D-89…D-94) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-065.md` (AC-065-01…07), `FEATURE-066.md` (AC-066-01…04) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-102 (vòng quay), BR-103 (giữ món) |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-083.md`, `tài-liệu/kế-hoạch/TASK-083-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-065 / F-066"; `sitemap.md` SCR-49 |
| Nền voucher / điểm | F-038 (voucher, mã ở khung thu tiền), F-039 (điểm + sổ `PointTransactions`) — skill `advanced-features` |

# Khi dùng

- Đổi ô quà mặc định, ngưỡng, cách đếm ngân sách, nội dung trang quay.
- Chủ quán báo "hóa đơn không có QR", "khách quay mãi không trúng / trúng quá nhiều", "đơn khách hẹn không thấy ở quầy", "quầy không kêu" (mục 7).
- Thêm loại quà (ví dụ tặng món), thêm hẹn giờ cho đơn nhân viên nhập — đọc mục 6 trước.
- Làm lại trên bản code khác — đi theo mục 8.

# Điều kiện trước

- Đã có: phiên bàn + gửi đơn (F-001…F-004), quầy realtime (F-007), hóa đơn (F-006, F-026), voucher (F-038), tích điểm (F-039), ước tính thời gian chờ (F-025).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm; SP sửa bằng file trong `cơ-sở-dữ-liệu/thủ-tục/`).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm migration `cơ-sở-dữ-liệu/chuyển-đổi/0043_vong_quay_hen_gio_ra_mon.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Vòng quay: `src/domain/luckySpin.js` (hàm thuần), `src/repositories/luckySpinRepo.js`, `src/services/luckySpinService.js`, `src/routes/luckySpin.js`, mục `lucky-spin` trong `src/routes/marketing.js`, `cơ-sở-dữ-liệu/thủ-tục/sp_SpinLucky.sql`.
3. Giữ món: tham số `@HoldMode`, `@HoldMinutes` trong `sp_SubmitOrder.sql`; `ordersRepo` (`submit`, `accept`, `release`, map `holdMode/holdUntil/releasedAt`); `orderService.release`; `etaRepo.queueLines`; route `POST /orders/:id/release` trong `public.js`.
4. Giao diện: `t-menu.js` (`holdPicker`), `t-track.js` (`holdLine`, `spinBlock`), `quay.html` + `pages/lucky-spin.js`, `pos-dashboard.js` (`isHeld`, `heldTicket`, `checkHolds`), `pos-receipt.js` (khối QR), `admin-loyalty.js` (`renderSpin`), `customer.js` (`holdState`).
5. Chạy test nền: `node --env-file=.env --test --test-concurrency=1 ứng-dụng/máy-chủ/tests/lucky-spin.test.js ứng-dụng/máy-chủ/tests/hold-order.test.js`.

---

# 2. Quyết định đã chốt (ADR-024) — không tự đổi

| Mã | Quyết định | KHÔNG chọn |
| --- | --- | --- |
| D-89 | Mỗi **lượt thu** (`Payments`) từ 30.000đ có **một** lượt quay, hạn 24 giờ; đã hoàn tiền thì không quay | Mỗi đơn một lượt: chia bill / thu chung làm đơn và lượt thu lệch nhau |
| D-90 | **Máy chủ chọn ô** (crypto, theo trọng số); ngân sách = số **lượt trúng** tối đa mỗi ngày | Chọn ở trình duyệt (khách sửa được); ngân sách bằng tiền (voucher % không biết trước số tiền) |
| D-91 | Quà: voucher %, voucher tiền, cộng điểm (chỉ hội viên), "Chúc may mắn"; voucher nguồn `GAME`, 14 ngày | Voucher dùng ngay cho lượt thu đang quay |
| D-92 | Mặc định **tắt**; 2–8 ô, có ô "Chúc may mắn", tổng trọng số > 0 | Bật sẵn khi nâng cấp |
| D-93 | Đơn hẹn vẫn `PENDING`, **giữ kho như đơn thường**; "Khi bạn tới" tối đa 45 phút | Trạng thái mới (`HELD`): mọi chỗ đếm đơn chờ / chặn thu tiền phải sửa |
| D-94 | Quầy: phiếu giữ cuối cột Mới, không kêu; hết giữ → đơn mới + kêu; quá 45 phút → nhãn hỏi bàn; Tiếp nhận = làm luôn | Tự hủy đơn quá hạn (món đã giữ kho, khách có thể vẫn đến) |

Muốn đổi một dòng trên → hỏi chủ dự án, viết ADR mới.

---

# 3. Vòng quay — luật và luồng

**Tạo mã (lazy, idempotent theo `PaymentId`)** — `ensureForPayment` chạy khi in hóa đơn (`forReceipt`) hoặc khi điện thoại trong phiên mở màn cảm ơn (`forSession`): tính năng bật, chưa có mã, lượt thu tồn tại, chưa hoàn tiền, `AmountDue ≥ spin.min_amount`, `PaidAt + spin.expire_hours` chưa qua → `INSERT LuckySpins` (trùng 2601/2627 → đọc lại mã cũ). In lại hóa đơn giữ đúng mã.

**Trạng thái** — `statusOf`: `SPUN` (có `SpunAt`) > `REFUNDED` > `EXPIRED` > `NEW`. Chỉ `NEW` mới in QR.

**Quay** — `luckySpinService.spin(token, rand)`:

```
byToken → đã quay? trả kết quả cũ (không gọi SP)
visibleSlices(prizes, { hasMember })      # ô điểm ẩn với khách vãng lai
pickSlice(slices, rand()) ?? ô NONE       # rand = crypto.randomInt / 1e6; test truyền rand cố định
sp_SpinLucky(@Token, @PrizeId, @NoneId, @DailyWinCap, @VoucherDays, @DayStart)
```

**`sp_SpinLucky`** (một transaction):

1. `sp_getapplock 'LuckySpinBudget'` (Exclusive, Transaction) — mọi lượt quay xếp hàng qua khóa này nên đếm ngân sách không bị hai người cùng vượt. Lượt quay ít, khóa giữ vài ms: chấp nhận.
2. Khóa dòng lượt quay (`UPDLOCK, HOLDLOCK`). Đã quay → `COMMIT`, trả về (an toàn khi bấm hai lần / hai tab).
3. Hết hạn → 50241 (`SPIN_EXPIRED` 410); có hoàn tiền → 50242 (`SPIN_REFUNDED` 409); ô không còn bật → 50243 (`PRIZE_INVALID` 409).
4. Đếm lượt trúng từ `@DayStart` (đầu ngày giờ quán, UTC) — đủ `@DailyWinCap` → đổi sang `@NoneId`.
5. `PERCENT` / `AMOUNT` → `INSERT Vouchers` (mã `QM` + 8 hex, `MemberId` của lượt thu hoặc NULL = mã tự do, `Source = 'GAME'`, `IssuedForPaymentId`). `POINTS` → `Members.Points += N` **và** `PointTransactions` ADJUST "Vòng quay may mắn" (thiếu dòng sổ → harness báo `POINTS_LEDGER_MISMATCH`).
6. Ghi `SpunAt, PrizeId, Kind, PrizeLabel, VoucherId, Points` (sao chép nhãn để đổi ô sau này không làm sai lịch sử).

**Cấu hình** — `adminSave`: `validatePrizes` (câu báo tiếng Việt) → `updateSettings` 5 khóa `spin.*` → `savePrizes`: tắt hết rồi sửa ô có `prizeId` / thêm ô mới (ô cũ chỉ tắt, vì `LuckySpins.PrizeId` tham chiếu).

**Thống kê 7 ngày** — `stats(fromUtc)`: lượt quay, lượt trúng, voucher phát, voucher đã dùng, tổng tiền các lượt thu có dùng voucher trúng, điểm đã tặng.

**Giao diện:**

- Hóa đơn: `luckySpin: { url: PUBLIC_BASE_URL + /quay/{mã}, qr: data URL, expiresAt }` — **QR dùng `PUBLIC_BASE_URL`**, chạy dev phải đặt IP Wi-Fi (xem `local-development.md`), nếu không QR trỏ `localhost`.
- Trang quay `/quay/{mã}`: vẽ SVG theo `slices`, POST rồi mới quay tới ô máy chủ trả (`angleFor`), 4,2 giây; `prefers-reduced-motion` → không quay, hiện kết quả ngay; kết quả đọc qua `#spin-live`.
- Màn cảm ơn: `GET /api/sessions/{id}/lucky-spins` (chỉ thiết bị trong phiên / nhân viên) — nút "Bạn có 1 lượt quay may mắn — quay ngay".

---

# 4. Ra món khi bạn tới — luật và luồng

**Gửi đơn:** `POST /api/orders` nhận `hold: { mode: 'TIME', minutes: 5–45 } | { mode: 'ARRIVAL' }` (zod `discriminatedUnion`) → `ordersRepo.submit` truyền `@HoldMode`, `@HoldMinutes` (ARRIVAL → 45) → `sp_SubmitOrder` kiểm (chỉ DINE_IN, không `AcceptNow`, 5–45) rồi ghi `HoldUntil = now + phút`. Sai → 50012 / 400.

**Đang giữ** = `Status = 'PENDING' AND HoldMode IS NOT NULL AND ReleasedAt IS NULL AND HoldUntil > now`. Cùng một định nghĩa ở 3 chỗ, sửa thì sửa cả 3: `etaRepo.queueLines` (SQL), `isHeld` trong `pos-dashboard.js`, `holdState` trong `customer.js`.

**Hết giữ:**

| Cách | Ở đâu | Kết quả |
| --- | --- | --- |
| Tới giờ | không có job máy chủ — `HoldUntil` qua là hết giữ | Quầy: `checkHolds()` mỗi giây phát hiện → chuông + thông báo "tới giờ làm đơn"; điện thoại: `scheduleHoldReload` tải lại đúng giờ |
| Khách bấm "Bạn đã tới — làm món" / "Làm ngay" | `POST /api/orders/{id}/release` (thiết bị trong phiên / nhân viên) | `ReleasedAt = now`, `order.released` tới phòng `staff` + phiên; đơn không đang giữ → `409 NOT_HELD` |
| Nhân viên Tiếp nhận ("Làm ngay" trên phiếu giữ) | `ordersRepo.accept` | `PREPARING` + `ReleasedAt` |

**Quầy (`pos-dashboard.js`):**

- `heldIds` nhớ các đơn đang giữ; `checkHolds()` chạy sau `loadAll`, sau mỗi sự kiện đơn và mỗi giây. Đơn rời `heldIds` mà vẫn `PENDING` → `state.fresh` + `playSound('ting')` + thông báo. **Phải gọi sau `loadAll`** — nếu chỉ chờ vòng 1 giây, khách bấm "Bạn đã tới" ngay sau khi quầy mở trang sẽ không có chuông (lỗi đã gặp ở E2E).
- Đơn mới đang giữ: không kêu, chỉ thông báo nhẹ "đặt trước đơn #… — chờ bạn tới".
- `ticketKey` có `isHeld` và `releasedAt` → phiếu được vẽ lại khi hết giữ.
- Đồng hồ chờ tính từ `readySince` (lúc hết giữ), không phải lúc đặt — nếu không đơn hẹn 20 phút vừa ra đã đỏ.
- Mất kết nối: `lateOrders` bỏ đơn đang giữ (không báo "đơn trễ" cho đơn khách hẹn).

---

# 5. Dữ liệu và cài đặt

- Migration 0043: `Orders.HoldMode` (CHECK TIME / ARRIVAL), `HoldUntil`, `ReleasedAt`, `CK_Orders_Hold`; `CK_Vouchers_Source` thêm `GAME`; bảng `SpinPrizes` (+ 4 ô mẫu: Giảm 10% tối đa 20.000đ /10, Giảm 5.000đ /20, +20 điểm /15, Chúc may mắn lần sau /55), `LuckySpins` (`PaymentId` UNIQUE, `Token` UNIQUE).
- Cài đặt (mặc định trong code, không seed): `spin.enabled` false, `spin.min_amount` 30000, `spin.daily_win_cap` 20, `spin.voucher_days` 14, `spin.expire_hours` 24. Thêm khóa mới phải sửa `settingsService` (giá trị + `KEYS`), zod trong `marketing.js`, `settingsView` / `adminSave`, form `renderSpin`.
- Lỗi SQL: 50240 `SPIN_NOT_FOUND` 404, 50241 `SPIN_EXPIRED` 410, 50242 `SPIN_REFUNDED` 409, 50243 `PRIZE_INVALID` 409 (`errors.js`).
- Hằng số: `MAX_SLICES` 8 (domain + admin), giữ tối đa 45 phút (SP + route + giao diện).

---

# 6. Giới hạn đã chấp nhận

- Ngân sách đếm **số lượt trúng**, không đếm tiền. Muốn giới hạn tiền → giảm `MaxDiscount` / trọng số ô %, hoặc viết ADR mới.
- Lượt thu hoàn tiền **sau khi** khách đã quay: quà đã phát vẫn giữ (chưa có thao tác thu hồi voucher — cần thì viết ADR mới).
- Ô điểm chỉ hiện khi lượt thu có hội viên lúc thu; gắn hội viên sau đó không thêm ô điểm.
- Hẹn giờ chỉ cho đơn khách tự gửi tại bàn. Đơn nhân viên nhập (F-024) vào thẳng "Đang chuẩn bị" nên không hẹn được.
- Giữ theo **cả đơn**, không theo từng món (ADR-003 Q-006 hoàn tất theo đơn) — người đến sau gọi đơn riêng.
- Không tự hủy đơn giữ quá 45 phút: phiếu hiện "Hết giờ giữ — hỏi bàn trước khi làm", nhân viên quyết.

---

# 7. Xử lý khi chủ quán thắc mắc

| Hiện tượng | Kiểm |
| --- | --- |
| Hóa đơn không có QR quay | Đã bật ở Tích điểm & voucher → Vòng quay? Lượt thu ≥ mức tối thiểu? Bản **tạm tính** không có QR (chỉ hóa đơn chính thức)? Lượt thu đã hoàn tiền / quá hạn? |
| Quét QR mở `localhost` / không vào được | `PUBLIC_BASE_URL` của máy chủ đang chạy; điện thoại cùng Wi-Fi |
| Không ai trúng cả buổi chiều | Đã đủ `spin.daily_win_cap` lượt trúng trong ngày (thống kê 7 ngày, `LuckySpins` hôm nay `Kind <> 'NONE'`) |
| Trúng quá nhiều | Tỷ lệ = trọng số ÷ tổng trọng số các ô **đang hiện** — khách vãng lai không thấy ô điểm nên tỷ lệ các ô voucher của họ cao hơn con số cột "Cơ hội" |
| Đơn khách hẹn không thấy ở quầy | Nằm **cuối** cột Mới, viền đứt; không kêu là đúng thiết kế |
| Tới giờ mà quầy không kêu | Tab quầy có đang mở (trình duyệt treo tab nền làm chậm `setInterval`)? Âm thanh đã bật? Đồng hồ máy quầy đúng giờ? |
| Thu tiền báo còn đơn chờ | Bàn còn đơn đang giữ — Tiếp nhận hoặc Hủy trước |

---

# 8. Làm lại trên bản code khác

1. Viết ADR, FEATURE, BR, US, AC, TASK, plan trước.
2. Migration → `sp_SubmitOrder` (tham số mặc định NULL, chạy lại toàn bộ test đơn) → `sp_SpinLucky`.
3. `domain/luckySpin.js` + unit test → repo → service → route; hóa đơn (`sessionService` 2 chỗ + `orderService`) thêm `luckySpin`.
4. Giữ món: repo (`submit`, `accept`, `release`, map), `orderService.release` + sự kiện `order.released`, `etaRepo`.
5. Giao diện theo thứ tự: giỏ → theo dõi đơn → quầy → hóa đơn → trang quay → tab quản lý. Route trang `'/quay/:token': 'quay.html'` trong `routes/pages.js`.
6. E2E: dùng `reducedMotion: 'reduce'` cho điện thoại quay (nhanh, không phụ thuộc hoạt ảnh); đặt mọi ô trừ một ô voucher về tỷ lệ 0 để kết quả chắc chắn; phần "tới giờ tự chuyển" dùng `context.clock.install()` + `clock.fastForward('11:00')` trên **một máy quầy riêng** (đừng cài đồng hồ giả vào trang quầy dùng chung).

# Validation

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

Test hay bị bỏ sót (đều có trong `tests/lucky-spin.test.js`, `tests/hold-order.test.js`): hai lượt quay cùng lúc không vượt ngân sách; quay lại không thêm quà; ô điểm ẩn với khách vãng lai; thiết bị lạ đọc lượt quay của phiên → 403; đơn đang giữ vẫn giữ kho; đơn giữ không vào hàng chờ ước tính; thu tiền khi còn đơn giữ → 409; "Bạn đã tới" hai lần → 409.

# Không làm

- Chọn kết quả ở trình duyệt hoặc gửi trọng số cho trình duyệt.
- Cộng điểm mà không ghi `PointTransactions`.
- Thêm trạng thái đơn mới cho "đang giữ".
- Tự hủy đơn giữ quá hạn; kêu chuông khi đơn giữ vừa gửi.
- Bật vòng quay sẵn trong migration.

# Hoàn thành khi

Mọi AC-065 / AC-066 có bằng chứng; test mới đỏ khi bỏ phần sửa tương ứng; docs đồng bộ; `npm run trace -- --check` PASS; agent không tự duyệt Gate.
