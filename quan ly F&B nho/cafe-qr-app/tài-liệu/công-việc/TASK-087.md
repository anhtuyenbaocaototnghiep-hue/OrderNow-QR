# TASK-087 — Ly treo: mua tặng bạn một ly
Status: READY_FOR_REVIEW (04/11/2026)
Quyết định: [ADR-028](../quyết-định/ADR-028-ly-treo.md) D-112…D-118 · Feature: [FEATURE-070](../chức-năng/FEATURE-070.md) · BR-107
Module: MOD-LOYALTY, MOD-BILLING, MOD-FINANCE · Màn hình: SCR-13 / SCR-14 (Bán mang đi, ô Mã voucher), SCR-50 (trang quà — mới), SCR-40 (Tích điểm & voucher), Lãi/lỗ, Sổ quỹ
Nguồn: chủ dự án 04/11/2026 — "tiến hành làm và khi làm xong thì làm ra skill .md" (Mừng khách quay lại + Ly treo). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-087-ly-treo` chồng lên `task/TASK-086-mung-khach-quay-lai` (chưa gộp `main`) · Kế hoạch: [TASK-087-plan.md](../kế-hoạch/TASK-087-plan.md)

## Mục tiêu
Khách mua trước một ly tặng bạn, gửi qua Zalo bằng nút chia sẻ (không tốn phí); bạn tới quán đọc mã là nhận ly; tiền mặt khớp két, Lãi/lỗ đúng; chủ quán thấy ly tặng kéo được bao nhiêu khách mới.

## Phạm vi
1. Migration 0047 (nguồn `GIFT`, `GiftDrinks`, danh mục sổ quỹ hệ thống).
2. Máy chủ: `domain/giftDrink.js`, `giftDrinkRepo`, `giftDrinkService`; route nhân viên / công khai / quản lý; `loyaltyService` (nhận mã, số trừ, nhãn, `validate.gift`); `orderService` nhãn hóa đơn; `pnlRepo` / `pnlService`.
3. Giao diện: nút + hộp "Bán ly tặng" ở Bán mang đi; trang quà `/qua/{token}`; tab "Ly tặng"; nhắc mời đăng ký ở ô Mã voucher; nhắc ở Lãi/lỗ.
4. Test integration + E2E; tài liệu; skill `ly-treo-tang-ban`.

## Không được sửa
`sp_SubmitOrder`, `sp_SettleSession`, `sp_Loyalty`, `sp_CloseShift`, `sp_CreateCashTxn` (ghi sổ quỹ cùng khóa ca, không qua thủ tục vì danh mục hệ thống ẩn); quy tắc voucher F-038.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (04/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **412/412 PASS** (41 file; thêm `gift-drinks.test.js` 5 test — AC-070-01…05: sổ quỹ, chốt ca khớp két, không trừ kho, Lãi/lỗ, hủy & hoàn tiền; mọi test voucher / thu tiền cũ vẫn xanh) |
| `npm run test:e2e` | **64/64 PASS** (thêm 1 E2E — AC-070-06; a11y quét thêm trang quà `/qua/{token}` và tab Mừng khách quay lại, Ly tặng ở 320 / 390 px) |
| `npm run trace -- --check` | 158 US, 428 AC — PASS 428, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Hộp bán, màn kết quả có QR, trang quà trên điện thoại, ô Mã voucher khi nhận, tab quản lý: không cuộn ngang. Đã sửa theo ảnh: nút Tiền mặt / Chuyển khoản không thấy nút đang chọn; lời báo "Ly tặng của …" bóp hẹp ô nhập mã; hai nút Gia hạn / Hủy dính nhau |
| Lỗi tìm được khi chạy cả bộ | Hủy ly tặng đặt hạn = "bây giờ" nhưng cột tới giây làm tròn lên → mã vừa hủy còn hợp lệ ≤ nửa giây. Sửa: hạn = 1 giây trước |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
