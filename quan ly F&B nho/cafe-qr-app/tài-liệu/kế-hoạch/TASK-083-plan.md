# TASK-083 — Kế hoạch: vòng quay may mắn (F-065) + ra món khi bạn tới (F-066), ADR-024

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Voucher | `Vouchers` (0030: `Code`, `MemberId` NULL = mã tự do, `DiscountPercent` / `DiscountAmount`, `MaxDiscount`, `ExpiresAt`, `Source` CHECK REFERRAL / CAMPAIGN / MANUAL, `IssuedForPaymentId`); dùng ở khung thu tiền qua mã (`/api/vouchers/validate`, `voucherCode` khi thu) |
| Điểm | `Members.Points` + sổ `PointTransactions` (bất biến `POINTS_LEDGER_MISMATCH` ở test) |
| Hóa đơn | `sessionService.receipt` / `paymentReceipt`, `orderService.receipt` (đều có `payment`); in ở `pages/pos-receipt.js`; QR bằng thư viện `qrcode` (đã có) |
| Màn cảm ơn khách | `pages/t-track.js` `render()` khi phiên CLOSED (đánh giá F-051) |
| Gửi đơn | `POST /api/orders` → `orderService.submitDineIn` → `submitToSession` → `ordersRepo.submit` → `sp_SubmitOrder` (INSERT `Orders` ở bước 8) |
| Quầy | `pages/pos-dashboard.js` (`ticket()`, `onOrderEvent` kêu chuông đơn mới, đồng hồ chờ `data-since`), hàng chờ ước tính `etaRepo.queueLines` |
| Thu tiền | `sp_SettleSession` chặn đơn `PENDING` (`HAS_PENDING_ORDERS`) |

## Thiết kế
- **Migration 0043** + SP `sp_SpinLucky` (khóa lượt quay + đếm lượt trúng hôm nay với UPDLOCK/HOLDLOCK, tạo voucher / cộng điểm, ghi kết quả) + `sp_SubmitOrder` thêm `@HoldMode`, `@HoldMinutes`.
- `domain/luckySpin.js` (hàm thuần): chọn ô theo trọng số (RNG truyền vào), ô hiện theo có / không hội viên, kiểm cấu hình ô.
- `repositories/luckySpinRepo.js`, `services/luckySpinService.js`: tạo mã (lazy, idempotent theo PaymentId), xem, quay, cấu hình, thống kê, khối `luckySpin` cho hóa đơn.
- `routes/luckySpin.js` (công khai + phiên) và mục admin trong `marketing.js`.
- Ra món: `ordersRepo` đọc / ghi 3 cột; `orderService.release`; `accept` ghi `ReleasedAt`; `etaRepo` bỏ đơn đang giữ; route `POST /api/orders/{id}/release`.
- Giao diện: giỏ (`t-menu.js`), theo dõi đơn + màn cảm ơn (`t-track.js`), trang quay `quay.html` + `pages/lucky-spin.js`, quầy (`pos-dashboard.js`), hóa đơn (`pos-receipt.js`), tab Vòng quay (`admin-loyalty.js`).

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Khách sửa trình duyệt để luôn trúng | Máy chủ chọn ô; trang chỉ diễn hoạt |
| Vượt ngân sách khi quay đồng thời | Đếm + ghi trong SP có khóa phạm vi |
| Đoán mã quay | 32 ký tự hex ngẫu nhiên; giới hạn tần suất |
| Đơn giữ làm kẹt kho / quên | Tối đa 45 phút; quá hạn hiện ở cột Chờ với nhãn hỏi bàn |
| Đổi `sp_SubmitOrder` làm hỏng đơn cũ | Tham số mới có mặc định NULL; toàn bộ test đơn hiện có phải xanh |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev).
