# TASK-050 — Giới thiệu bạn & voucher
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-038 (AC-038-01…05)
Nguồn: skill `advanced-features` §4 F-038 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-28 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Hội viên mới đăng ký kèm SĐT người giới thiệu; lần thanh toán đầu ≥ 30.000đ thì cả hai nhận voucher 10 %, hạn 30 ngày. Quầy áp voucher (của hội viên hoặc nhập mã) khi thu tiền; mỗi voucher dùng một lần, hai quầy dùng cùng mã chỉ một bên thắng. Quản lý tạo voucher tay.

## Phạm vi
- Migration `0030_gioi_thieu.sql` (`Members.ReferredByMemberId/ReferralRewardedAt`; `Vouchers` — unique `UsedPaymentId`; `Payments.VoucherId/VoucherDiscount` + `CK_Payments_Voucher`; Settings `referral.*`).
- SP: `sp_ApplyLoyalty` (file `sp_Loyalty.sql`) đánh dấu voucher đã dùng (một lần, còn hạn, đúng chủ) và tạo 2 voucher giới thiệu trong cùng transaction lượt thu đầu.
- Backend:
  - đăng ký có người giới thiệu: `REFERRER_NOT_FOUND`, `SELF_REFERRAL`, `REFERRAL_LIMIT` (5 lượt / tháng, đếm trong transaction có khóa dòng người giới thiệu);
  - `pricing` thêm dòng voucher (sau chiết khấu hội viên, trước đổi thưởng / giảm tay / làm tròn; `MaxDiscount`, `StackWithMember`);
  - route `POST /api/members` (+ `referrerPhone`), `GET /api/members/:id/vouchers`, `POST /api/vouchers/validate`, `/api/admin/vouchers`; trường `voucherCode` trong body thu tiền;
  - realtime `member.vouchers_issued` (quầy có mã; màn khách không có mã).
- UI:
  - ô "SĐT người giới thiệu (không bắt buộc)" khi đăng ký (khách + quầy);
  - quầy: nút voucher của hội viên, ô "Mã voucher" + "Áp mã"; thông báo "Đã tặng 2 voucher giới thiệu…";
  - khách: "🎉 Bạn và người giới thiệu mỗi người nhận 1 voucher…";
  - trang Tích điểm, voucher & chiến dịch → tab Voucher (+ Tạo voucher).

## Phụ thuộc
TASK-023 (hội viên), TASK-049 (`sp_ApplyLoyalty`, khung thu tiền).

## Validation
`loyalty.test.js` → "Giới thiệu bạn + voucher (F-038)" (6 test, gồm đăng ký đồng thời không vượt giới hạn và hai quầy dùng cùng mã); bất biến `VOUCHER_PAYMENT_MISMATCH`; E2E "CRM: …" (đăng ký có người giới thiệu ở quầy, tặng voucher, dùng voucher); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-038, ADR-006); hướng dẫn `chức-năng-mới/21-tích-điểm-tem-voucher-giới-thiệu.md`.
