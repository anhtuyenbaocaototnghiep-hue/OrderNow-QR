---
name: canh-bao-bat-thuong-email
description: Phát hiện bất thường (dấu hiệu thất thoát) và gửi cảnh báo qua email cho cafe-qr-app — lúc đóng ca kiểm lệch két, tỉ lệ chuyển khoản, hủy món đã pha, hoàn tiền, giảm giá tay; tức thì khi hoàn tiền lớn / hủy – sửa khoản sổ quỹ đã duyệt; so ngưỡng cố định hoặc mức bình thường (trung bình + 2 độ lệch chuẩn của 30 ca); cảnh báo trong app (trang Cảnh báo bất thường) + email SMTP tới địa chỉ ghi trong Cài đặt, qua hàng đợi có thử lại. Dùng khi task giao FEATURE-060 / ADR-020 / TASK-075, hoặc nhắc "cảnh báo", "bất thường", "thất thoát", "gian lận", "email cảnh báo", "SMTP", "Gmail", "mật khẩu ứng dụng", "báo cáo đóng ca qua email", "tổng kết ngày", "AlertOutbox".
---

# Mục đích

Ghi lại đầy đủ chức năng **phát hiện bất thường, cảnh báo qua email** (làm ngày 27/10/2026, TASK-075) để agent sau có thể **sửa, mở rộng (thêm dấu hiệu, thêm kênh Zalo / Telegram) hoặc làm lại** mà không làm hỏng đóng ca / hoàn tiền / sổ quỹ.

| Phần | Một câu |
| --- | --- |
| Phát hiện | 5 dấu hiệu lúc **đóng ca** + 2 dấu hiệu **tức thì**; bất thường khi vượt ngưỡng cố định **hoặc** vượt mức bình thường của quán |
| Trong app | Trang **Quản lý → Thu chi & nhân sự → Cảnh báo** (`/admin/alerts`, SCR-47): Mới / Tất cả, Đã xem, Đã xử lý (ghi chú), link Nhật ký thao tác; tự cập nhật qua realtime |
| Email | Người **nhận** (0–5 địa chỉ) đặt trong **Cài đặt**, đổi lúc nào cũng có hiệu lực ngay; hộp thư **gửi** đặt một lần trong `.env`; 3 loại: tức thì, báo cáo đóng ca, tổng kết ngày |

Lý do gốc (chủ dự án): "phát hiện bất thường … gửi về email được ghi trong cài đặt … dễ dàng thay đổi". Zalo (ZNS cần OA xác thực + mẫu duyệt + tốn phí) và Facebook (chỉ nhắn trong 24 giờ) đã cân nhắc và **không** làm.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-020-canh-bao-bat-thuong-email.md` (D-75…D-78) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-060.md` (AC-060-01…10) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-093…BR-095 |
| Task, kết quả, review | `tài-liệu/công-việc/TASK-075.md`, `tài-liệu/kế-hoạch/TASK-075-plan.md` |
| API, dữ liệu, màn hình | `tài-liệu/kiến-trúc/api-contract.md` (mục F-060), `tài-liệu/kiến-trúc/data-model.md` (mục FEATURE-060), `tài-liệu/giao-diện/screens-flows.md` (mục F-060) |
| Bí mật, biến môi trường | `tài-liệu/vận-hành/secrets-register.md` S-11 (`SMTP_PASS`), `tài-liệu/vận-hành/local-development.md`, `.env.example` |

# Khi dùng

- Sửa ngưỡng mặc định, thêm / bớt dấu hiệu, đổi nội dung email, đổi lịch thử lại / giới hạn gửi.
- Thêm kênh gửi mới (Zalo OA, Telegram…) — cắm vào cùng hàng đợi `AlertOutbox` (mục 7).
- Chủ quán báo "không nhận được email" (mục 8).
- Làm lại chức năng này trên bản code khác — đi theo mục 9.

# Điều kiện trước

- Đã có: ca + đóng ca (F-018, `sp_CloseShift`), hoàn tiền (F-019), sổ quỹ + hủy / sửa khoản đã duyệt (F-033, F-050), chuyển khoản (F-056, `Payments.Method`), sửa / xóa món (F-046, `OrderItemVoids.StockMode`), giảm giá tay (`Payments.ManualDiscount`), Cài đặt (`settingsService`), Nhật ký thao tác (F-035), realtime Socket.io.
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm, SP `CREATE OR ALTER`).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**, migration chỉ thêm. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.
- **Không bao giờ** hỏi / in / commit mật khẩu hộp thư. Chủ dự án tự dán vào `.env`.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm migration 0040 đã có chưa: `cơ-sở-dữ-liệu/chuyển-đổi/0040_canh_bao_bat_thuong.sql`. Chưa có → bản code cũ, làm theo mục 9.
2. Đọc `ứng-dụng/máy-chủ/src/services/alertService.js`, `src/repositories/alertsRepo.js`, `src/services/mailService.js`, `src/utils/anomaly.js`, `src/jobs/alertMailer.js`.
3. Chạy test nền: `npm test` (ghi số PASS), rồi `npm run test:e2e`.
4. Thay đổi chạm DB / API / ≥ 2 module → viết `tài-liệu/kế-hoạch/TASK-xxx-plan.md` trước khi code.

---

# 2. Quyết định đã chốt (ADR-020) — không tự đổi

| Mã | Quyết định | KHÔNG chọn |
| --- | --- | --- |
| D-75 | Luật dễ giải thích: ngưỡng cố định (chỉnh trong Cài đặt) **hoặc** — khi đã có ≥ 10 ca đóng — vượt **trung bình + 2 độ lệch chuẩn** của 30 ca gần nhất và không dưới mức tối thiểu. Lệch két chỉ dùng ngưỡng cố định. Cảnh báo là **gợi ý kiểm tra**, không kết luận ai sai | Học máy / mô hình dự đoán (khó giải thích khi phản biện, dữ liệu ít) |
| D-76 | Kênh: **trong app (luôn có) + email SMTP** (`nodemailer`). Người nhận trong Cài đặt; hộp thư gửi (`SMTP_*`, `MAIL_FROM`) **chỉ ở `.env`** | Zalo ZNS, tin tư vấn Zalo OA, Messenger, Telegram (chưa làm); lưu mật khẩu SMTP trong CSDL |
| D-77 | **Hàng đợi `AlertOutbox`**: đóng ca / hoàn tiền / sổ quỹ không bao giờ chờ hoặc lỗi vì email. Thử lại 5 lần sau 1 → 5 → 15 → 60 → 240 phút (6 lần gửi), vẫn lỗi `FAILED` + nút "Gửi lại email lỗi"; chống trùng; tối đa `MAIL_HOURLY_MAX` (20) / giờ, tính cả email thử; giờ yên lặng hoãn email cảnh báo / báo cáo ca; tổng kết ngày = 24 giờ tính tới giờ gửi, **hôm qua** bị lỡ được gửi bù | Gửi email đồng bộ trong request đóng ca |
| D-78 | Chỉ ADMIN; realtime `alert.created` chỉ tới phòng **`admin`**; email không có SĐT / tên hội viên; **đổi bất kỳ cài đặt cảnh báo nào (email nhận, loại email, giờ, ngưỡng) → thư báo tới cả địa chỉ cũ lẫn mới** + Nhật ký thao tác | Chặn quản lý tự xử lý cảnh báo về chính mình (quán thường một quản lý — chỉ ghi người + giờ) |

Muốn đổi một dòng trên → hỏi chủ dự án, viết ADR mới. Không tự làm.

---

# 3. Dấu hiệu, ngưỡng, mức bình thường

| Mã | Khi nào | Giá trị đo (nguồn) | Ngưỡng cố định mặc định (khóa Settings) | Mức tối thiểu khi so mức bình thường | Mức độ |
| --- | --- | --- | --- | --- | --- |
| `CASH_DIFF` | Đóng ca | \|`Shifts.Difference`\| | > 20.000đ (`alert.cash_diff_max`) | không so | HIGH |
| `TRANSFER_SHARE` | Đóng ca, **ca ≥ 5 lượt thu** | % lượt `Payments.Method = 'TRANSFER'` | > 60% (`alert.transfer_share_max`) | 40% | MEDIUM |
| `VOIDS` | Đóng ca | Σ `OrderItemVoids.Qty` có `StockMode = 'WASTE'` (món **đã pha**) trong giờ mở–đóng ca | > 3 (`alert.voids_max`) | 2 | MEDIUM |
| `REFUNDS` | Đóng ca | Số `Refunds` của ca | > 2 (`alert.refunds_max`) | 2 | MEDIUM |
| `MANUAL_DISCOUNT` | Đóng ca | Số lượt thu `ManualDiscount > 0` | > 5 (`alert.manual_discount_max`) | 3 | MEDIUM |
| `BIG_REFUND` | Ngay khi hoàn | Một lượt hoàn | ≥ 200.000đ (`alert.refund_big`) | — | HIGH |
| `CASH_VOID` | Ngay khi hủy / sửa | Khoản sổ quỹ **đã duyệt** bị hủy / sửa | luôn | — | MEDIUM |

- `utils/anomaly.js` (hàm thuần, có unit test): `baseline(values)` → `{ n, mean, sd (mẫu, chia n−1), limit = mean + 2·sd }`; `judge({ value, fixed, floor, base, useStats })` → `{ anomalous, byFixed, byStats }` với `byStats = useStats && n ≥ 10 && value > limit && value > mean && value ≥ floor`. `quietMinutesLeft(minutes, start, end)` xử lý giờ yên lặng qua nửa đêm.
- Lịch sử: `alertsRepo.metricsHistory(shiftId, 30)` — 30 ca **đã đóng trước** ca đang xét, cùng câu `METRICS` với `shiftMetrics`.
- Người liên quan: `alertsRepo.byUser(shiftId, kind)` (ai thu chuyển khoản / hủy món / hoàn / giảm tay nhiều nhất); `CASH_DIFF` gán người đóng ca.
- Tắt phần so mức bình thường: `alert.use_stats = false`.

---

# 4. Dữ liệu (migration 0040)

- `Alerts`: `Kind` (CHECK 7 mã), `Severity` MEDIUM / HIGH, `ShiftId` FK, `UserId` FK (người liên quan chính), `Title`, `Detail` (JSON: giá trị, `fixed`, `normal`, `people`, …), **`DedupeKey` UNIQUE**, `Status` NEW / SEEN / RESOLVED, `Note`, `HandledBy`, `HandledAt`.
- `AlertOutbox`: `Kind` ALERT / SHIFT / DIGEST / NOTICE / TEST, `AlertId`, `DedupeKey` (duy nhất khi khác NULL), `Recipients` (ảnh chụp lúc tạo), `Subject`, `BodyText`, `BodyHtml`, `Status` PENDING / SENDING / SENT / FAILED, `Attempts`, `NextAttemptAt`, `LastError`, `SentAt`.
- Khóa chống trùng — cảnh báo: `SHIFT:{shiftId}:{KIND}`, `REFUND:{refundId}`, `CASHVOID:{cashTxnId}`; email: `SHIFT:{shiftId}`, `ALERT:{alertId}`, `DIGEST:{yyyy-mm-dd}`. Trùng (lỗi 2601 / 2627) → repo trả `null`, không ném lỗi.
- `sp_DeleteUser`: `Alerts.UserId` / `HandledBy` là lịch sử → chỉ xóa mềm (`ARCHIVED`).
- Cài đặt: khóa `alert.*` trong `Settings`, mặc định trong code (`settingsService.toSettings`), không cần seed. `alert.emails` lưu CSV.

---

# 5. Luồng chạy

```
Đóng ca (shiftService.close) ──commit──▶ alertService.onShiftClosed(shiftId)
Hoàn tiền (refundService.refund) ──────▶ alertService.onRefund(refund, { user, shiftId })
Hủy / sửa sổ quỹ (cashService.voidTxn) ▶ alertService.onCashVoided(voided, replacement, user)
        │  mỗi hook bọc .catch(log) — lỗi KHÔNG làm hỏng thao tác chính; bên trong withDeadlockRetry (chạy lại an toàn nhờ DedupeKey)
        ▼
  createAlert (DedupeKey) ──▶ publish(ROOMS.admin, 'alert.created', { alert })
        ▼
  alertsRepo.enqueue(...)  (người nhận lấy từ Cài đặt lúc tạo; trống → không xếp email)
        ▼
  mailService.kick()  +  jobs/alertMailer.js (setInterval 60 giây: runDigests → flushOnce)
        │  kick() và bộ gửi nền dùng chung một lượt gửi (flushOnce) — không chạy chồng, không vượt giới hạn giờ
        ▼
  flush(): claimDue (UPDATE TOP … READPAST → SENDING) → sendMail → markSent | markFailed(thử lại / FAILED)
```

- **Báo cáo đóng ca**: một email mỗi ca (`SHIFT:{id}`), tiêu đề `[Quán] Ca #N đã đóng — ⚠️ K dấu hiệu bất thường` hoặc `— ✔ không có dấu hiệu bất thường`.
- **Tức thì** (`enqueueImmediate`) chỉ khi `alert.immediate` bật; cảnh báo trong app luôn có.
- **Tổng kết ngày** `dailyDigest(date)`: số liệu **24 giờ tính tới mốc gửi** của ngày `date` (22:00 hôm trước → 22:00 hôm nay; mốc 00:00 = trọn ngày hôm trước, tiêu đề ghi ngày của phút trước mốc) — tiền mặt / chuyển khoản, số lượt thu, hoàn, đánh giá thấp, các ca + lệch két, cảnh báo (giờ quán UTC+7). `runDigests(now)`: mốc hôm nay khi đã tới `alert.digest_time`; mốc hôm qua chỉ gửi bù khi `Settings.UpdatedAt` của `alert.emails` **trước** mốc đó.
- **Đổi cài đặt cảnh báo** (`PUT /api/admin/settings` có khóa `alert*`) → `onAlertSettingsChanged(before, after, user)`: so từng khóa trong `WATCHED` + danh sách email (không kể thứ tự) → NOTICE tới hợp cũ ∪ mới, ghi Trước → Sau, không bị giờ yên lặng hoãn. Tiêu đề "Đổi email nhận cảnh báo" khi đổi người nhận, ngược lại "Đổi cài đặt cảnh báo".
- **Giờ yên lặng** (`alert.quiet_start` / `alert.quiet_end`, trống = tắt): email ALERT / SHIFT tạo trong khoảng đó có `NextAttemptAt` = hết giờ yên lặng.
- `alertMailer` **không** đăng ký vào scheduler (`registerJob`) để không ghi `JobRuns` mỗi phút; tắt khi `JOBS_ENABLED=false` (test, E2E).

**API** (chỉ ADMIN, `routes/operations.js`): `GET /api/admin/alerts?status=NEW|ALL&limit=`, `PATCH /api/admin/alerts/{id}` `{ status: SEEN|RESOLVED, note? }`, `GET /api/admin/alerts/mail-status` (không có mật khẩu), `POST /api/admin/alerts/test-email` `{ emails }` (gửi thẳng, không qua hàng đợi nhưng ghi dòng `SENT` để tính vào giới hạn giờ → `{ ok, error? }`), `POST /api/admin/alerts/mail-retry` (`FAILED` → `PENDING` → `{ requeued }`). Cài đặt thêm 14 khóa `alert*` — kiểm bằng zod (`zAlertEmails`: tối đa 5, đúng dạng, không trùng, ≤ 200 ký tự; giờ `HH:MM`).

**Giao diện:** `public/js/pages/admin-settings.js` (thẻ "Cảnh báo bất thường qua email", `loadMailStatus` + nút "Gửi lại n email lỗi", nút "Gửi email thử", `fixPaths` đổi `alertEmails.N` → `alertEmails`, `numOrKeep` — ô ngưỡng trống giữ giá trị cũ); `public/admin/alerts.html` + `public/js/pages/admin-alerts.js`; `public/js/admin-shell.js` (mục "Cảnh báo" nhóm Thu chi & nhân sự); `admin-audit.js` đọc `?from=&to=&userId=`; CSS `.alert-list`, `.alert-card` trong `admin.css`.

---

# 6. Bẫy đã gặp — giữ nguyên cách xử lý

1. **`DATETIME2(0)` làm tròn LÊN tới giây**: email vừa xếp hàng có `NextAttemptAt` lớn hơn `SYSUTCDATETIME()` vài trăm mili-giây → `flush()` ngay sau đó bỏ sót. `claimDue` so `NextAttemptAt <= DATEADD(SECOND, 1, SYSUTCDATETIME())`.
2. **`flush()` phải lặp tới khi hết** email tới giờ (từng đợt 10) — chỉ gửi một đợt thì email thứ 11 trở đi chờ thêm một phút.
3. **Giới hạn mỗi giờ** đọc từ `config.mail.hourlyMax` (`MAIL_HOURLY_MAX`); bộ test gửi > 20 email nên đặt `MAIL_HOURLY_MAX=100000` trước `startApp()`.
4. **Hủy món trước khi hoàn tất là `RELEASE`** (chưa pha, trả kho) → không tính `VOIDS`. Test phải `POST /api/orders/{id}/complete` rồi mới hủy kiểu `WASTE`.
5. `OrderItemVoids` **không có `ShiftId`** → gán ca theo giờ mở–đóng ca.
6. Hook gọi **sau** khi thao tác chính đã commit, bọc `.catch(log)` — test AC-060-06 ép SMTP lỗi mà đóng ca vẫn `200`.
7. Test **không bao giờ gửi email thật**: `alerts.test.js` xóa `SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_TRANSPORT` khỏi `process.env` trước khi nạp app và thay bộ gửi bằng `_setTransport(fake)`; E2E đặt `MAIL_TRANSPORT=json`.
8. `after()` của test phải chịu được `before()` lỗi giữa chừng (`mailService?.`, `app?.close()`), nếu không tiến trình test treo khi chạy trên code cũ.
9. Chỉ thêm dòng `api-contract.md` cho endpoint **có thật** — test F-052 báo dòng mồ côi. Hoàn tiền là `POST /api/payments/{id}/refunds`, hủy sổ quỹ là `POST /api/cash-transactions/{id}/void`.
10. Xóa tài khoản: thêm bảng mới có FK tới `Users` → nhớ thêm vào `sp_DeleteUser`, nếu không xóa quản lý từng bấm "Đã xem" bị lỗi khóa ngoại.

**Từ review G3 (đã sửa — đừng làm hỏng lại):**

11. **Tổng kết ngày tính trọn ngày [00:00, 24:00) mà gửi lúc 22:00** → ca đóng / tiền thu sau 22:00 không bao giờ vào tổng kết nào. Đúng: 24 giờ tính tới mốc gửi.
12. **`MAX_ATTEMPTS = RETRY_MINUTES.length`** làm khoảng chờ 240 phút không bao giờ dùng → `MAX_ATTEMPTS = RETRY_MINUTES.length + 1`. Email `FAILED` không tự gửi lại → phải có "Gửi lại email lỗi".
13. **Chỉ báo khi đổi người nhận là chưa đủ** — tắt loại email / nâng ngưỡng / bật giờ yên lặng cả ngày cũng "giấu" được cảnh báo → báo mọi khóa trong `WATCHED`. So danh sách email **không kể thứ tự**.
14. **Che SĐT** phải bắt cả `0912 345 678`, `0912.345.678`, `+84 912…`, `091-234-5678` mà không che số tiền `1.000.000.000đ` (regex có `(?<![\d.,])` … `(?!\d)`). Test phải đưa SĐT vào **email thật sự được gửi** (hoàn tiền lớn), không phải email không bao giờ tạo.
15. **Hai lượt gửi chồng nhau** (bộ gửi nền gọi `flush()` thẳng, bỏ qua cờ của `kick()`) → vượt giới hạn giờ, có thể nhận lại dòng SENDING của nhau → dùng chung `flushOnce()`.
16. **"Gửi email thử" gửi thẳng không giới hạn** → token quản lý bị lộ có thể dùng Gmail của quán gửi hàng loạt (Google khóa tài khoản) → kiểm và tính vào `MAIL_HOURLY_MAX`.
17. **`Number('')` = 0**: xóa trống ô ngưỡng làm ngưỡng thành 0 → mọi ca lệch 1đ cũng báo HIGH → gửi `undefined` (giữ giá trị cũ).
18. **Test chứng minh "lỗi không làm hỏng thao tác chính"** bằng cách làm ghi `Alerts` lỗi thật (tạo trigger tạm trên `dbo.Alerts` trong DB test, xóa ở `finally`), không phải bằng SMTP lỗi (SMTP không chạy trong request).
19. Mức độ cảnh báo phải có **chữ** ("Mức cao" / "Mức vừa"), không chỉ màu nhãn (WCAG 1.4.1).

---

# 7. Mở rộng

- **Thêm dấu hiệu lúc đóng ca:** thêm cột vào câu `METRICS` (`alertsRepo.js`) → thêm dòng `SHIFT_CHECKS` + `metricOf` / `fixedOf` (`alertService.js`) → thêm mã vào `CK_Alerts_Kind` (**migration mới**, không sửa 0040) → khóa Settings + zod + ô ngưỡng ở Cài đặt → nhãn `KIND` ở `admin-alerts.js` → BR + AC + test.
- **Thêm kênh (Zalo OA / Telegram):** thêm `Channel` cho `AlertOutbox` bằng migration mới, `flush()` chọn bộ gửi theo kênh; bí mật kênh để ở `.env`, ghi vào `secrets-register.md`. Không gửi SĐT khách qua kênh nào.
- **Đổi lịch thử lại:** `RETRY_MINUTES` trong `mailService.js` (độ dài mảng = số lần thử tối đa) + tài liệu ADR / BR.

---

# 8. Khi thất bại / không chắc

| Triệu chứng | Kiểm |
| --- | --- |
| Không nhận được email | Cài đặt → dòng trạng thái hộp thư: "Chưa cấu hình" → điền `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` trong `.env` rồi **khởi động lại app**; "Lỗi gần nhất: Invalid login" → Gmail cần **mật khẩu ứng dụng** (bật xác minh 2 bước), không phải mật khẩu đăng nhập; email nằm trong thư mục Spam; danh sách email nhận đang trống |
| Email đến chậm | Giờ yên lặng đang bật; đã chạm `MAIL_HOURLY_MAX`; `JOBS_ENABLED=false` (bộ gửi nền và `kick()` đều tắt) |
| "Gửi lỗi: n" ở Cài đặt | Sửa `SMTP_*` trong `.env` → khởi động lại app → bấm "Gửi lại n email lỗi" |
| Cảnh báo trùng | Kiểm `DedupeKey` còn UNIQUE và hook không tự tạo khóa mới mỗi lần |
| Đóng ca lỗi sau khi sửa | Hook phải gọi sau commit và có `.catch`; chạy `alerts.test.js` AC-060-06 |
| Quá nhiều cảnh báo giả | Tăng ngưỡng trong Cài đặt hoặc tắt "So thêm với mức bình thường"; không đổi công thức khi chưa hỏi chủ dự án |

---

# 9. Làm lại trên bản code chưa có (thứ tự)

1. Tài liệu trước: ADR-020, FEATURE-060, BR-093…095, US-060-1/2, dòng tc-map, TASK + plan.
2. `npm install nodemailer@10.1.0 --save-exact`; biến môi trường trong `config.js` (`mail: { transport, host, port, secure, user, pass, from, hourlyMax }`) + `.env.example`.
3. Migration 0040 → `sp_DeleteUser`.
4. `utils/anomaly.js` (+ unit test) → `alertsRepo` → `mailService` → `alertService` → `jobs/alertMailer.js` (gọi `startAlertMailer()` trong `server.js`).
5. Phòng realtime `admin` (`publisher.js` `ROOMS.admin`, `io.js` cho role ADMIN vào phòng) → hook ở `shiftService.close`, `refundService.refund`, `cashService.voidTxn` → cài đặt + route.
6. Giao diện: thẻ Cài đặt → trang Cảnh báo (`pages.js` thêm `/admin/alerts`, `admin-shell.js` thêm mục) → Nhật ký nhận bộ lọc từ URL.
7. Test integration (bộ gửi giả) → E2E (`MAIL_TRANSPORT=json` trong `kịch-bản/e2e-server.js`, thêm `alerts` vào danh sách trang a11y) → api-contract, data-model, screens-flows, sitemap, secrets-register, local-development, test-strategy, traceability.
8. Review độc lập (agent chỉ đọc) → sửa → chứng minh test mới đỏ trên code cũ (worktree tách rời) → commit theo Task ID, tác giả là chủ dự án → `npm run db:migrate` lên `CafeQrDev` (chỉ thêm) → khởi động lại app.

---

# 10. Kiểm chứng

| Lớp | Ở đâu | Gồm |
| --- | --- | --- |
| Unit + Integration | `ứng-dụng/máy-chủ/tests/alerts.test.js` (13) | AC-060-01…08, 10: mức bình thường, cài đặt + quyền, đổi người nhận / ngưỡng / loại email (không kể thứ tự), mail-status không lộ mật khẩu, email thử tính giới hạn giờ, che SĐT 5 dạng, 5 dấu hiệu đóng ca + một email, ca khớp ✔, tức thì, thử lại đúng lịch / FAILED / gửi lại, ghi cảnh báo lỗi không làm hỏng thao tác chính, giờ yên lặng, tổng kết 24 giờ + gửi bù + mốc 00:00, trang cảnh báo + realtime chỉ admin + xóa mềm người xử lý |
| E2E | `kiểm-thử/e2e/flow.spec.js` (test "cảnh báo bất thường qua email…") | AC-060-09: nhập email + Gửi email thử → toast; đóng ca thừa 50.000đ → thẻ Lệch két hiện qua realtime → Đã xem; a11y quét `/admin/alerts` |

Lệnh (lấy từ `package.json`): `npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate`.

Kết quả lúc làm (27/10/2026): `npm test` 346/346, E2E 50/50, trace 140 US / 363 AC PASS. Test mới chạy trên code cũ: không bài nào qua (thiếu module cảnh báo).

# 11. Không làm

- Không lưu / hiện / ghi nhật ký mật khẩu hộp thư; không hỏi mật khẩu trong chat.
- Không gửi email đồng bộ trong request; không để lỗi email làm lỗi thao tác chính.
- Không đưa SĐT / tên hội viên vào email; không gửi `alert.created` cho nhân viên / trưởng ca.
- Không kết luận "ai gian lận" trong nội dung cảnh báo — chỉ nêu số liệu và người liên quan.
- Không reset `CafeQrDev`; không đẩy GitHub / gộp `main` khi chủ dự án chưa bảo.

# 12. Hoàn thành khi

- AC-060-01…10 PASS, có test chạy được; test mới đỏ trên code cũ.
- Đóng ca lệch két → cảnh báo trong app ngay + email báo cáo ca (khi đã cấu hình SMTP); đổi email nhận → cả địa chỉ cũ nhận thư báo.
- Lint, format, `npm test`, E2E, `trace --check` sạch; tài liệu liên quan cập nhật cùng task; TASK ghi kết quả và chuyển `READY_FOR_REVIEW`.
