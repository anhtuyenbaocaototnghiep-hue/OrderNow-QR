# TASK-086 — Kế hoạch: mừng khách quay lại (F-069), ADR-027

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Lần cuối ghé | `Members.LastVisitAt`, cập nhật trong `sp_ApplyMemberPayment` lúc thu tiền — lúc gắn hội viên vẫn là lần thanh toán trước |
| Mẫu quà | F-067: `birthdayService` (`statusFor`, `usableGift`, `giftFields`), `birthdayRepo.issue` (voucher + dòng quà trong một transaction) |
| Tự áp | `loyaltyService.prepare` (quà sinh nhật trước), `billingService.computeTotals` + `loyaltyInput`, `billingFields` (`routes/staff.js`) |
| Giao diện | `billing-controls.js` (`renderBirthday`, `showEarn`), `member-box.js` (`birthdayNote`), `admin-loyalty.js` (`renderBirthday`) |
| Bộ lọc vắng | `membersRepo` view `lapsed`, `overview.Lapsed`, `memberService.periodMarks` (`d30`) |

## Thiết kế
- `domain/winback.js` (ngày vắng, kiểm cài đặt) + `winbackRepo` (quà gần nhất, phát quà, thống kê, danh sách) + `winbackService` (`statusFor`, `usableGift`, `adminGet`, `adminSave`).
- `birthdayService.voucherFields()` dùng chung cho hai loại quà.
- `prepare`: sau khối quà sinh nhật, chưa có voucher và không `skipWinback` → tự áp quà quay lại.
- Giao diện: dải `winbackSlot` (cùng kiểu `.bday-strip`), lời chào ở ô hội viên, tab mới.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Hai quầy cùng mở → hai quà | Khóa duy nhất `(MemberId, LastVisitBefore)` + transaction |
| Sau khi thu tiền `LastVisitAt` đổi → mất quà đang giữ | Trạng thái đọc quà gần nhất còn hạn, không chỉ khi đang vắng |
| Đè quà sinh nhật | Quà sinh nhật xét trước; test F-067 phải xanh |
| Đổi mốc "Lâu chưa quay lại" | Ghi trong ADR; test TASK-082 đổi khách vắng 40 → 50 ngày |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
