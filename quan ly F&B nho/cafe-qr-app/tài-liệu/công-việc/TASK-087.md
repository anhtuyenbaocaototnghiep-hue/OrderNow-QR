# TASK-087 — Ly treo: mua tặng bạn một ly
Status: IN_PROGRESS (04/11/2026)
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
