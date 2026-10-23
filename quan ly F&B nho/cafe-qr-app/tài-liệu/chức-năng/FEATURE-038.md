# FEATURE-038 — Giới thiệu bạn & voucher

> **Nguồn:** skill `advanced-features` §4 F-038. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-28.

- **Status:** CONFIRMED (ADR-006 D-28) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:**
  - khách / STAFF (đăng ký có người giới thiệu, dùng voucher khi thu tiền);
  - ADMIN (tạo voucher tay, xem danh sách).
- **Màn hình:**
  - **Đăng ký hội viên** (khách ở giỏ hàng, quầy ở khung thu tiền): ô "SĐT người giới thiệu (không bắt buộc)".
  - **Quầy → khung thu tiền:**
    - nút voucher của hội viên (🎫 mã −10%);
    - ô **Mã voucher** + "Áp mã" (kiểm ngay, báo lỗi dưới ô);
    - bill có dòng "Voucher <mã>".
  - Thanh toán lần đầu của người được giới thiệu:
    - quầy nhận thông báo "Đã tặng 2 voucher giới thiệu: …";
    - màn khách: "🎉 Bạn và người giới thiệu mỗi người nhận 1 voucher …".
  - **Quản lý → Tích điểm, voucher & chiến dịch → Voucher:** danh sách 30 ngày, "+ Tạo voucher" (không gắn hội viên).
- **Dữ liệu:** migration `0030_gioi_thieu.sql`:
  - `Members.ReferredByMemberId`, `ReferralRewardedAt`;
  - `Vouchers(Code UNIQUE, MemberId NULL, DiscountPercent | DiscountAmount, MaxDiscount, MinOrderAmount, StackWithMember, ExpiresAt, UsedAt, UsedPaymentId, Source REFERRAL|CAMPAIGN|MANUAL, CampaignId, IssuedForPaymentId)`
    - unique `(UsedPaymentId)` → một voucher / lượt thu;
  - `Payments.VoucherId`, `VoucherDiscount` (`CK_Payments_Voucher`);
  - Settings `referral.*`.

## Quy tắc (D-28)

1. **Đăng ký có người giới thiệu:**
   - SĐT người giới thiệu phải là hội viên đang hoạt động (404 `REFERRER_NOT_FOUND`), khác chính mình (400 `SELF_REFERRAL`);
   - mỗi SĐT chỉ được giới thiệu một lần (lúc đăng ký);
   - tối đa `referral.monthly_limit` (5) lượt / tháng (giờ VN) / người giới thiệu → 409 `REFERRAL_LIMIT`.
     Đếm trong cùng transaction với khóa dòng người giới thiệu, nên đăng ký đồng thời không vượt.
2. **Thưởng giới thiệu:**
   - xét ở **lượt thu đầu tiên** của người mới (`VisitCount = 1`): ≥ `referral.min_first_payment` (30.000đ) → tạo 2 voucher 10 %, hạn 30 ngày (người mới + người giới thiệu), ghi `ReferralRewardedAt`;
   - tạo trong cùng transaction lượt thu; thông báo realtime sau commit;
   - lần đầu < 30.000đ → không tặng (cách hiểu chặt "lần đầu" — ghi ở ADR-006).
3. **Dùng voucher (thu tiền):**
   - một voucher / lượt thu;
   - áp sau chiết khấu hội viên, trước đổi thưởng / giảm tay / làm tròn; `MaxDiscount` giới hạn voucher %;
   - `StackWithMember = 0` → dùng voucher thì không áp % hạng;
   - Lỗi:
     - 404 `VOUCHER_NOT_FOUND`;
     - 409 `VOUCHER_USED` / `VOUCHER_EXPIRED` / `VOUCHER_NOT_OWNER` (voucher gắn hội viên khác) / `VOUCHER_MIN_ORDER`;
     - hai quầy dùng cùng mã → SP chỉ cho một bên (409 `VOUCHER_UNAVAILABLE`).
4. **Voucher tay** (quản lý): mã `QL…`, không gắn hội viên (ai có mã dùng được một lần), có nhật ký thao tác.

## API

| Method & path | Ghi chú |
| --- | --- |
| `POST /api/members` | thêm `referrerPhone?` → trả thêm `referred: true` |
| `GET /api/members/{id}/vouchers` | quầy |
| `POST /api/vouchers/validate { code, memberId? }` | quầy → `{ valid, voucher? , code?, message? }` |
| Body thu tiền (`settle`, `split settle`, `takeaway`, các `preview/quote`) | `voucherCode`; `totals.voucherDiscount`; payment `voucherCode`, `voucherDiscount` |
| `GET /api/admin/vouchers?from&to&source` · `POST /api/admin/vouchers { percent \| amount, maxDiscount?, minOrderAmount, stackWithMember, days, memberId? }` | ADMIN |

Realtime:

- `staff` → `member.vouchers_issued { paymentId, vouchers[{ memberId, code, percent, expiresAt }] }`;
- `session:{id}` → `member.vouchers_issued { count, percent, expiresAt }` (không mã).

## Acceptance Criteria

- AC-038-01: Giới thiệu hợp lệ → sau thanh toán đầu ≥ 30.000đ, 2 voucher 10 % / 30 ngày; lần thu sau không tặng thêm.
- AC-038-02: Tự giới thiệu → 400; SĐT không có → 404.
- AC-038-03: Voucher dùng lần 2 → 409; hết hạn → 409; voucher người khác → 409; hai quầy cùng dùng → một bên thắng.
- AC-038-04: 5 lượt / tháng — đăng ký đồng thời không vượt.
- AC-038-05: Bất biến `VOUCHER_PAYMENT_MISMATCH` (voucher đã dùng gắn đúng lượt thu); breakdown lượt thu gồm voucher.
- AC-038-06: Voucher tay của quản lý (10.000đ, đơn tối thiểu 20.000đ, không gắn hội viên): đơn 10.000đ → 409 `VOUCHER_MIN_ORDER`; hai quầy cùng dùng mã cho đơn đủ tối thiểu → đúng một lượt thu được giảm 10.000đ, lượt kia 409. _(bổ sung — TASK-057, 20/10/2026)_
- AC-038-07: Mã voucher không tồn tại → 404. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/loyalty.test.js` → "Giới thiệu bạn + voucher (F-038)": 6 test.
- E2E "CRM: …" (đăng ký có người giới thiệu ở quầy, tặng voucher, dùng voucher).
