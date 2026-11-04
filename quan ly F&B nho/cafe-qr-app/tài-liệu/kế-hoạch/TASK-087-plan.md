# TASK-087 — Kế hoạch: ly treo — mua tặng bạn một ly (F-070), ADR-028

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Voucher tặng món / không gắn hội viên | `Vouchers.MenuItemId` (0044), `MemberId NULL`; `loyaltyService.checkVoucher` / `prepare` (`cheapestUnit`), `validate` |
| Thu tiền mang đi | `orderService.takeaway` → `sp_SubmitOrder` (trừ kho + lượt thu trong một transaction) — **không dùng** cho bán ly tặng |
| Két / chốt ca | `sp_CloseShift`: tiền dự kiến = đầu ca + lượt thu tiền mặt − hoàn + sổ quỹ thu − chi (đã duyệt) |
| Sổ quỹ | `CashTransactions`, `CashCategories (IsActive)`, `sp_CreateCashTxn` (chỉ danh mục đang bật) |
| Lãi/lỗ | `pnlRepo.daily` (doanh thu từ `Payments`), `pnlService.report`, gợi ý ở `admin-pnl.js` `hints()` |
| QR | `qrcode` (`QRCode.toDataURL`), địa chỉ `config.publicBaseUrl` (như vòng quay F-065) |
| Trang công khai mẫu | `quay.html` + `js/pages/lucky-spin.js` |

## Thiết kế
- `giftDrinkRepo.sell`: một transaction — khóa ca đang mở, INSERT voucher `GIFT`, (tiền mặt) INSERT `CashTransactions` thu "Bán ly tặng" đã duyệt, INSERT `GiftDrinks`.
- `giftDrinkRepo.cancel`: một transaction — khóa ca (tiền mặt), voucher hết hạn ngay, (tiền mặt) sổ quỹ chi "Hoàn ly tặng", đánh dấu hủy; ly đã dùng → 409.
- `prepare`: voucher `GIFT` → số trừ có trần max(đã trả, giá hiện tại); nhãn "Ly tặng — 1 …".
- `pnlRepo.daily`: số phải thu cộng `VoucherDiscount` của lượt thu dùng voucher `GIFT`.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Tiền mặt bán ly tặng làm lệch két | Sổ quỹ thu cùng transaction, khóa ca như `sp_CreateCashTxn`; test chốt ca |
| Lãi/lỗ coi ly tặng là giảm giá | Cộng lại vào phải thu; test |
| Đoán mã / đoán link | Mã 8 ký tự ngẫu nhiên (31^6 tổ hợp phần đuôi) + kiểm mã cần đăng nhập nhân viên; link 32 hex |
| Người nhận lên size để được nhiều hơn | Trần = max(đã trả, giá hiện tại của món) |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
