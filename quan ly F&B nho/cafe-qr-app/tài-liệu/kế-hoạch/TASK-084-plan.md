# TASK-084 — Kế hoạch: quà sinh nhật hội viên (F-067), ADR-025

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Ngày sinh | `Members.BirthDate` (0003), chỉ quản lý sửa (`PUT /api/admin/members/{id}`); bộ lọc "Sinh nhật tháng này" (`membersRepo` view `birthday`) |
| Voucher | `Vouchers` (0030 + nguồn `GAME` ở 0043), kiểm ở `loyaltyService.checkVoucher`, tính ở `prepare` → `settleTotals`, đánh dấu dùng trong `sp_Loyalty` (không kiểm số giảm theo `DiscountAmount`) |
| Thông tin hội viên cho quầy / khách | `loyaltyService.summary` (gọi từ `/members/{id}/loyalty`, `billingService.computeTotals`, `sessionService.withFirstOrder`), `memberCard` (Thẻ thành viên) |
| Thu tiền | `billingService.computeTotals` + `loyaltyInput` — dùng chung cho thu bàn, chia bill, mang đi; trường body ở `billingFields` (`routes/staff.js`) |
| Quầy | `billing-controls.js` (khung Hội viên · giảm giá · voucher, `showEarn(totals)` nhận số xem trước) |
| Khách | `member-box.js` (ô hội viên + Thẻ thành viên) |

## Thiết kế
- Migration 0044 + `domain/birthday.js` (hàm thuần: tuần sinh nhật, điều kiện, nhãn quà) + `birthdayRepo` + `birthdayService` (trạng thái, phát quà trong transaction, cài đặt, danh sách sắp tới, thống kê).
- `loyaltyService.summary` thêm `birthday`; `prepare` tự chọn quà khi không có voucher và không `skipBirthday`; voucher có `menuItemId` tính như tặng món.
- Nhãn "Quà sinh nhật" ở bảng tính tiền (`settleTotals` nhận `voucher.label`) và hóa đơn (`paymentBreakdown` theo nguồn voucher).
- Giao diện: dải + nút ở `billing-controls.js`; lời chúc + "Thêm ngày sinh" ở `member-box.js`; tab "Quà sinh nhật" ở `admin-loyalty.js`; nhãn nguồn voucher; trang Chính sách dữ liệu.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Hai quầy cùng mở → tạo hai quà | Khóa chính `BirthdayGifts (MemberId, GiftYear)` + tạo voucher và dòng quà trong một transaction |
| Khách khai ngày sinh hôm nay để lấy quà | Tự thêm một lần; chỉ tính khi thêm trước ≥ 30 ngày |
| Tự áp quà tặng món làm lỗi xem trước khi bill chưa có món | Tự áp chỉ khi bill có món; chọn tay mới báo lỗi rõ |
| Đổi `prepare` làm sai voucher cũ | Voucher không có `MenuItemId` đi đường cũ; toàn bộ test voucher hiện có phải xanh |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
