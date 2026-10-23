# FEATURE-039 — Tích điểm đổi quà & tem

> **Nguồn:** skill `advanced-features` §4 F-039. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-27 (thay tỷ lệ điểm D-5 của ADR-005).

- **Status:** CONFIRMED (ADR-006 D-27) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:**
  - ADMIN cấu hình quà, chương trình tem, điều chỉnh điểm;
  - STAFF / MANAGER đổi quà khi thu tiền;
  - khách xem điểm / tem.
- **Màn hình:**
  - **Quầy → khung "Hội viên · giảm giá · voucher"** (thu tiền bàn, chia bill, mang đi):
    - điểm, thẻ tem ("8/10 tem — còn 2 ly nữa được tặng");
    - ô **Đổi thưởng** (quà đổi điểm, lượt món miễn phí của thẻ tem);
    - dòng "Lượt này tích +N điểm, +M tem".
    - Bill in thêm dòng "Tích +N điểm / tem".
  - **Khách (giỏ, theo dõi đơn):** ô hội viên hiện điểm, thẻ tem, số voucher (không hiện mã).
  - **Quản lý → Tích điểm, voucher & chiến dịch:** tab Quà đổi điểm, Chương trình tem.
  - **Quản lý → Hội viên → hồ sơ:** sổ điểm, thẻ tem, điều chỉnh điểm có lý do.
- **Dữ liệu:** migration `0029_tich_diem.sql`:
  - `PointTransactions(MemberId, PaymentId, Delta ≠ 0, Type EARN|REDEEM|ADJUST|EXPIRE|REFUND, Note, CreatedBy)` — unique `(PaymentId) WHERE Type = 'EARN'`;
  - `RewardCatalog(Name, PointsCost, RewardType DISCOUNT|FREE_ITEM, DiscountAmount | MenuItemId, IsActive)`;
  - `RewardRedemptions(…, ReturnedAt)`;
  - `StampPrograms(RequiredStamps 2–50, RewardMenuItemId NULL)`, `StampProgramItems`;
  - `StampCards(Stamps ≥ 0, CompletedCards, RewardsAvailable ≥ 0)`, `StampEvents`;
  - `Payments.RewardDiscount/RewardId/StampProgramId/PointsEarned/StampsEarned`;
  - `CK_Members_Points (Points ≥ 0)`;
  - số dư điểm cũ ghi một dòng `ADJUST` "Số dư trước F-039".
- **SP:**
  - `sp_ApplyLoyalty`: gọi TRONG transaction của `sp_SettleSession` / `sp_SettleSplit` / `sp_SubmitOrder`;
  - `sp_ReverseLoyalty`: gọi trong `sp_RefundPayment`;
  - `sp_AdjustPoints`;
  - `sp_ApplyMemberPayment` thôi cộng điểm trực tiếp.

## Quy tắc

1. **Tích điểm (D-27):**
   - 1 điểm / `loyalty.point_value` (10.000đ) **thực trả** (`AmountDue` đã trừ mọi khoản giảm, kể cả đổi thưởng);
   - không hết hạn;
   - mỗi lượt thu tối đa một dòng `EARN`.
2. **Tích tem:**
   - mỗi món (dòng khách chọn) thuộc chương trình đang chạy = 1 tem; món được tặng không tích tem;
   - đủ `RequiredStamps` → thẻ hoàn thành, tem chuyển phần dư, `RewardsAvailable` +1.
3. **Đổi thưởng — chọn ở khung thu tiền, một thưởng / lượt thu:**
   - quà điểm `DISCOUNT` (giảm số tiền), quà điểm `FREE_ITEM` (giảm giá 1 phần món đó — món phải có trên bill);
   - lượt món miễn phí của thẻ tem: món tặng của chương trình, hoặc món rẻ nhất của chương trình có trên bill.
   - Đi qua `pricing` như dòng giảm "Đổi thưởng": sau voucher, trước làm tròn.
   - **Không dùng cùng giảm tay** trên một lượt thu (400 `REWARD_WITH_MANUAL`).
   - Cần hội viên (400 `MEMBER_REQUIRED`).
   - Trừ điểm / lượt quà trong cùng transaction lượt thu: hai quầy cùng đổi → một bên nhận 409 `POINTS_INSUFFICIENT` / `STAMP_REWARD_UNAVAILABLE`.
4. **Hoàn tiền (mở rộng F-019):**
   - trừ lại điểm đã tích dư so với số còn thực trả; không làm điểm âm;
   - hoàn toàn bộ lượt thu → trả điểm đã đổi / lượt món miễn phí (một lần);
   - đơn bị hủy trong lần hoàn → trừ tem của các món đó.
5. **Điều chỉnh tay:** quản lý cộng / trừ có lý do; không để điểm âm (409); có nhật ký thao tác (`members.points`).

## API

| Method & path | Ghi chú |
| --- | --- |
| Body thu tiền: `POST /api/sessions/{id}/settle`, `/api/splits/{id}/settle`, `/api/orders/takeaway` (+ `/preview`, `/quote`) | thêm `reward: { type: 'POINTS', rewardId } \| { type: 'STAMP', programId }`; `totals` trả `rewardDiscount`, `pointsEarned`, `stampsEarned[]` |
| `GET /api/members/{id}/loyalty` | quầy: `{ points, stampCards[{ text, rewardsAvailable… }], rewards[{ affordable }], vouchers[] }` |
| `GET/POST /api/admin/rewards` · `PUT/DELETE …/{id}` | ADMIN; quà đã đổi → xóa thành ngừng (ADR-004) |
| `GET/POST /api/admin/stamp-programs` · `PUT/DELETE …/{id}` | `{ name, requiredStamps, menuItemIds[], rewardMenuItemId?, isActive }` |
| `GET /api/admin/members/{id}/loyalty` · `POST /api/admin/members/{id}/points { delta, reason }` | sổ điểm / điều chỉnh |

## Acceptance Criteria

- AC-039-01: Trả 125.000 → +12 điểm; lượt thu ghi `PointsEarned` = dòng `EARN`.
- AC-039-02: Mua 2 ly thuộc chương trình → +2 tem; đủ 10 → thẻ hoàn thành, tem về 0, có 1 lượt món miễn phí; dùng lượt → giảm đúng giá 1 ly.
- AC-039-03: Đổi quà 100 điểm khi có 80 → 409; đủ điểm → giảm 20.000đ, trừ 100 điểm.
- AC-039-04: Hai quầy cùng đổi 100 điểm khi có 150 → đúng một lượt thành công.
- AC-039-05: Hoàn tiền toàn bộ → trừ điểm vừa tích, trả điểm đã đổi, trừ tem.
- AC-039-06: Bất biến:
  - `POINTS_LEDGER_MISMATCH`: điểm = Σ sổ điểm;
  - `EARN_MISMATCH`;
  - `STAMP_CARD_OVERFLOW`;
  - CHECK điểm / tem không âm.
- AC-039-07: Đổi thưởng cùng giảm tay trên một lượt thu → 400 `REWARD_WITH_MANUAL`; quà tặng món khi bill không có món đó → 409 `REWARD_ITEM_NOT_IN_BILL`. _(bổ sung — TASK-057, 20/10/2026)_
- AC-039-08: Quản lý điều chỉnh điểm thiếu lý do → 400; trừ quá số dư → 409 `POINTS_INSUFFICIENT`; điều chỉnh hợp lệ (+30, "Khách quen") ghi vào sổ điểm kèm lý do và nhật ký `members.points`. _(bổ sung — TASK-057, 20/10/2026)_
- AC-039-09: Đổi thưởng khi lượt thu chưa gắn hội viên → 400 `MEMBER_REQUIRED`. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/loyalty.test.js` → "Tích điểm đổi quà & tem (F-039)": 7 test.
- `tests/members.test.js` → cập nhật theo D-27.
- E2E "CRM: …" (điểm / tem dự kiến ở quầy).
