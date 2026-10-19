# TASK-049 — Tích điểm đổi quà & tem
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-039 (AC-039-01…06)
Nguồn: skill `advanced-features` §4 F-039 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-27 (thay tỷ lệ điểm D-5 của ADR-005) · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Hội viên tích điểm (1 điểm / 10.000đ thực trả, không hết hạn) và tem theo món; đổi quà / món miễn phí tại quầy lúc thu tiền. Trừ điểm / lượt quà trong cùng transaction lượt thu; hoàn tiền trả lại đúng. Sổ điểm luôn khớp số dư, điểm không âm.

## Phạm vi
- Migration `0029_tich_diem.sql` (`PointTransactions` — unique `EARN` theo `PaymentId`; `RewardCatalog`, `RewardRedemptions`, `StampPrograms`, `StampProgramItems`, `StampCards`, `StampEvents`; cột thưởng trên `Payments`; `CK_Members_Points`; số dư cũ ghi một dòng `ADJUST` "Số dư trước F-039").
- SP (file `sp_Loyalty.sql`):
  - `sp_ApplyLoyalty`: gọi trong transaction của `sp_SettleSession` / `sp_SettleSplit` / `sp_SubmitOrder` (tích điểm, tem, đổi thưởng);
  - `sp_ReverseLoyalty`: gọi trong `sp_RefundPayment`;
  - `sp_AdjustPoints`; `sp_ApplyMemberPayment` thôi cộng điểm trực tiếp.
- Backend:
  - `pricing` thêm dòng "Đổi thưởng" (sau voucher, trước làm tròn); `REWARD_WITH_MANUAL`, `MEMBER_REQUIRED`, `POINTS_INSUFFICIENT`, `STAMP_REWARD_UNAVAILABLE`;
  - `loyaltyService` / `loyaltyRepo`; trường `reward` trong body thu tiền (`settle`, `split settle`, `takeaway` + `preview` / `quote`);
  - route `GET /api/members/:id/loyalty`, `/api/admin/rewards`, `/api/admin/stamp-programs`, `GET /api/admin/members/:id/loyalty`, `POST /api/admin/members/:id/points`.
- UI:
  - quầy: khung "Hội viên · giảm giá · voucher" (điểm, thẻ tem, Đổi thưởng, "Lượt này tích +N điểm, +M tem"); bill in "Tích +N điểm" / "Tích +M tem";
  - khách (giỏ, theo dõi đơn): điểm, thẻ tem, số voucher;
  - trang mới `/admin/loyalty` "Tích điểm, voucher & chiến dịch" (tab Quà đổi điểm, Chương trình tem); hồ sơ hội viên: sổ điểm, thẻ tem, điều chỉnh điểm.

## Phụ thuộc
TASK-023 (hội viên), TASK-033 (hoàn tiền), TASK-038 (thu từng phần).

## Validation
`loyalty.test.js` → "Tích điểm đổi quà & tem (F-039)" (7 test, gồm hai quầy cùng đổi điểm), `members.test.js` cập nhật theo D-27; bất biến `POINTS_LEDGER_MISMATCH`, `EARN_MISMATCH`, `STAMP_CARD_OVERFLOW`; E2E "CRM: …" (điểm / tem dự kiến ở quầy); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-039, ADR-006); hướng dẫn `chức-năng-mới/21-tích-điểm-tem-voucher-giới-thiệu.md`.
