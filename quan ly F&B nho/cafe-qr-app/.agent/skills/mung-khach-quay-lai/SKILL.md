---
name: mung-khach-quay-lai
description: Mừng khách quay lại cho cafe-qr-app — hội viên lâu không ghé (LastVisitAt ≥ 45 ngày) quay lại thì quầy thấy dải "Khách quay lại sau N ngày — lần cuối ghé dd/mm · đã ghé N lần", điện thoại khách hiện "Lâu rồi mới gặp lại bạn!", quà nhỏ (voucher nguồn WINBACK) tự trừ một lần, giữ 14 ngày nếu không dùng, tối đa một quà / 180 ngày, quà sinh nhật được áp trước; tab quản lý có chỉ số "ghé tiếp sau khi dùng quà"; bộ lọc "Lâu chưa quay lại" dùng chung số ngày. Dùng khi task giao FEATURE-069 / ADR-027 / TASK-086, hoặc nhắc "khách quay lại", "win-back", "winback", "vắng lâu", "lâu chưa quay lại", "WinbackGifts", "skipWinback", "quà quay lại".
---

# Mục đích

Ghi lại chức năng **mừng khách quay lại** (làm ngày 04/11/2026, TASK-086) để agent sau **sửa, mở rộng hoặc làm lại** mà không phát quà hai lần, không đè quà sinh nhật, không làm mất quà khách đang giữ.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-027-mung-khach-quay-lai.md` (D-107…D-111) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-069.md` (AC-069-01…06) |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-106 |
| Task, kế hoạch | `tài-liệu/công-việc/TASK-086.md`, `tài-liệu/kế-hoạch/TASK-086-plan.md` |
| API, dữ liệu, màn hình | `api-contract.md`, `data-model.md`, `screens-flows.md` — mục "F-069" |
| Nền | F-067 quà sinh nhật (skill `qua-sinh-nhat-hoi-vien` — dùng chung cách phát / tự áp / dải), F-014 hội viên, F-038 voucher, TASK-082 bộ lọc hội viên |

# Khi dùng

- Đổi số ngày vắng, quà mặc định, số ngày giữ quà, khoảng cách giữa hai quà, lời chào.
- Chủ quán báo "khách lâu không tới mà không thấy dải", "quà bị trừ hai lần", "khách có quà mà không trừ" (mục 7).
- Thêm nhắn tin "quán nhớ bạn", quà theo hạng — đọc mục 6 trước.
- Làm lại trên bản code khác — đi theo mục 8.

# Điều kiện trước

- Đã có F-067 (`birthdayService.voucherFields / giftView / giftStatus`, voucher `MenuItemId`), `Members.LastVisitAt` (ghi trong `sp_ApplyMemberPayment`).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm `cơ-sở-dữ-liệu/chuyển-đổi/0046_mung_khach_quay_lai.sql`. Chưa có → bản code cũ, làm theo mục 8.
2. Máy chủ: `domain/winback.js` (`absentDays`, `validateSettings`), `repositories/winbackRepo.js` (`latestGift`, `issue`, `stats`, `recent`, `awayCount`), `services/winbackService.js` (`statusFor`, `usableGift`, `awayBefore`, `adminGet`, `adminSave`). Chỗ móc: `loyaltyService.prepare` (sau khối quà sinh nhật) + `summary` / `memberCard` (`winback`), `billingService` (`skipWinback`, `totals.winbackApplied`), `routes/staff.js` `billingFields`, `orderService.paymentBreakdown` (`VOUCHER_LINE`), `memberService.periodMarks` (`lapsedBefore`, `lapsedDays`), `routes/marketing.js` (`/winback`).
3. Giao diện: `billing-controls.js` (`renderWinback`, `winbackSlot`, `showEarn`), `member-box.js` (`winbackNote`), `admin-loyalty.js` (`renderWinback`, tab `winback`), `admin-members.js` (câu rỗng của `lapsed`).

# 2. Quy tắc nghiệp vụ (BR-106)

| Quy tắc | Chi tiết |
| --- | --- |
| Đang vắng | `LastVisitAt` có giá trị, số ngày theo **giờ quán** từ ngày thanh toán cuối tới hôm nay ≥ `winback.after_days` (45; 14–365). Chưa thanh toán lần nào → không tính |
| Lúc gắn hội viên | `LastVisitAt` vẫn là lần thanh toán trước (chỉ đổi khi thu tiền xong) → tính được số ngày vắng |
| Phát quà | Khi hội viên xuất hiện lúc đang vắng (quầy tra cứu / gắn bàn, điện thoại khách, tính tiền). Một quà mỗi đợt vắng (`UNIQUE (MemberId, LastVisitBefore)`), tối đa một quà trong `winback.cooldown_days` (180) |
| Hạn | Hết ngày thứ `winback.hold_days` (14) kể từ hôm phát |
| Tự áp | Sau quà sinh nhật: chưa có voucher, không `skipWinback` → áp quà còn dùng được (kể cả quà đang giữ khi khách không còn vắng) |
| Quà đang giữ | Còn hạn, chưa dùng → trả `away: false, status: READY`; khách vắng đợt mới mà còn quà cũ → dùng quà cũ, không phát thêm, không báo COOLDOWN |
| Tắt | Quầy vẫn thấy dải "Khách quay lại sau N ngày" (`status: OFF`) để chào khách cũ |
| Khách | Thấy lời chào + giá trị + hạn, không thấy mã; dòng "Bạn có N voucher" không đếm quà này |
| Bộ lọc | "Lâu chưa quay lại" ở Hội viên = vắng ≥ `winback.after_days` (trước đây cố định 30) |

# 3. Dữ liệu

- Migration `0046`: `CK_Vouchers_Source` thêm `WINBACK`; bảng `WinbackGifts (GiftId, MemberId, LastVisitBefore DATETIME2(0), AbsentDays, VoucherId UNIQUE, CreatedAt, UNIQUE (MemberId, LastVisitBefore))`.
- `LastVisitBefore` cùng độ chính xác `DATETIME2(0)` với `Members.LastVisitAt` — so sánh bằng thời điểm (`sameInstant`). Đổi kiểu một bên → khóa đợt vắng hỏng.
- Cài đặt `winback.*`: `enabled` (false), `after_days` (45), `kind` (PERCENT), `value` (15), `max_discount` (30000), `menu_item_id`, `hold_days` (14), `cooldown_days` (180).

# 4. API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/admin/winback` | ADMIN | Cài đặt + `awayNow` + `stats` (90 ngày: `issued`, `used`, `returnedAgain`, `giftValue`, `usedRevenue`) + `recent` |
| `PUT /api/admin/winback` | ADMIN | Như cài đặt; sai → `400 VALIDATION_ERROR` (câu từ `validateSettings`) |
| `GET /api/members/{id}/loyalty`, phiên, Thẻ thành viên | như cũ | `winback: { away, days, lastVisitAt, visitCount, status, gift, lastGiftAt } \| null` |
| Xem trước / thu tiền | Nhân viên | `skipWinback`; `totals.winbackApplied`; nhãn "Quà quay lại" |

`returnedAgain`: quà đã dùng mà hội viên thanh toán thêm ít nhất một lần trong 30 ngày sau — **chỉ số chính** để biết quà giữ chân được khách hay không.

# 5. Giao diện

- **Quầy:** `.wb-strip` (dùng kiểu `.bday-strip`) dưới dải sinh nhật: tiêu đề "Khách quay lại sau 52 ngày" / "Quà quay lại còn giữ đến dd/mm", dòng "lần cuối ghé … · đã ghé N lần", dòng trạng thái (Đã tự áp quà + **Không dùng quà lần này** / **Dùng quà**, giữ vì đã dùng quà sinh nhật, đang dùng voucher khác, thêm món để tự trừ, đã dùng, hết hạn, chưa tới lượt, nhớ chào khách).
- **Khách:** `.wb-note` "Lâu rồi mới gặp lại bạn!" + "Quán tặng bạn: …" / "Bạn còn quà quay lại: …".
- **Quản lý:** tab "Mừng khách quay lại": 4 ô số, cài đặt (loại quà, vắng từ, giữ quà, giữa hai quà), câu xem trước `.wb-preview`, nút "Xem khách đang vắng (N)" → `/admin/members?view=lapsed`, bảng "Quà quay lại gần đây".

# 6. Mở rộng — chỗ dễ sai

- **Nhắn "quán nhớ bạn" tự động:** Zalo OA / ZNS / SMS tính phí theo tin, cần tài khoản doanh nghiệp — ADR-027 không chọn. Hiện xuất danh sách qua chiến dịch F-037.
- **Quà theo hạng / theo số lần ghé:** thêm trường vào `voucherFields` đầu vào; giữ khóa một quà mỗi đợt vắng.
- **Đổi thứ tự ưu tiên với quà sinh nhật:** sửa `prepare` + chữ ở `renderWinback` ("lượt này đã dùng quà sinh nhật") + test AC-069-03.
- **Test:** `LastVisitAt` chỉ đổi khi thu tiền → test đặt thẳng trong DB; E2E dùng hội viên mẫu "Khách Lâu Không Ghé" (0907069001, vắng 52 ngày) tạo trong `kịch-bản/e2e-server.js`. Hai lượt thu cùng giây không tính "ghé tiếp" (PaidAt tới giây).

# 7. Xử lý thắc mắc của chủ quán

| Thắc mắc | Trả lời / kiểm |
| --- | --- |
| "Khách lâu không tới mà quầy không hiện dải" | Khách chưa từng thanh toán khi gắn SĐT (không có "lần cuối ghé"), hoặc chưa đủ số ngày vắng (xem tab), hoặc chưa gắn SĐT |
| "Có dải mà không có quà" | Tính năng tắt (`OFF`), đã tặng trong 180 ngày (`COOLDOWN`), món tặng đã ngừng bán |
| "Khách có quà mà không trừ" | Lượt này đã trừ quà sinh nhật hoặc voucher khác (một lượt một voucher); quà tặng món cần có món trong bill; nhân viên bấm "Không dùng quà lần này" |
| "Quà có làm lỗ không" | Tab: "Tiền quà đã trừ" so với "Khách trả ở các lượt dùng quà" và "Ghé tiếp sau khi dùng quà" |

# 8. Làm lại từ đầu (bản code chưa có F-069)

1. Docs trước: ADR, FEATURE, BR, US, AC, tc-map (quy trình 15 bước).
2. Migration chỉ thêm (nguồn voucher + bảng quà với khóa đợt vắng).
3. `domain/winback.js` + test unit → repo (phát quà trong transaction, trùng khóa → đọc lại) → service (`statusFor` theo bảng ở mục 2).
4. Móc `prepare` sau quà sinh nhật; `summary` gọi `statusFor` **trước** khi đọc danh sách voucher (có thể vừa phát quà).
5. Giao diện quầy / khách / quản lý; bộ lọc "Lâu chưa quay lại" dùng chung số ngày.
6. Test integration (`tests/winback.test.js`) + E2E (hội viên mẫu vắng 52 ngày); chụp màn hình khung quầy và điện thoại 390 px.

# 9. Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` (407/407 lúc làm) · `npm run test:e2e` (63/63) · `npm run trace -- --check` (155 US, 422 AC) · `npm run db:migrate` (CafeQrDev, chỉ thêm).
