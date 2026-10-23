# FEATURE-047 — Hội viên khi gọi món tại bàn, Thẻ thành viên cho khách, quyền lợi trên bill

> **Nguồn:** yêu cầu chủ dự án 18/10/2026 ("gọi món tại bàn cũng có thể áp SĐT thành viên; tích điểm, voucher, chiến dịch thì người đăng ký phải thấy"). Quyết định: [ADR-008](../quyết-định/ADR-008-hoi-vien-tai-ban-the-thanh-vien.md) D-36…D-38. Rule: BR-071…BR-073 ([business-rules](../nghiệp-vụ/business-rules.md)).

- **Status:** CONFIRMED (ADR-008 D-36…D-38) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:**
  - STAFF / MANAGER / ADMIN: gắn / đăng ký / gỡ hội viên ở trang Gọi món tại bàn;
  - Khách (thiết bị trong phiên): xem Thẻ thành viên khi SĐT đã gắn vào phiên;
  - Thu ngân: in bill có khối Thẻ thành viên.
- **Màn hình:**
  - **Quầy → Gọi món tại bàn** (S-16, `pos/table-order.html` + `js/pages/pos-table-order.js`): khung **"⭐ Hội viên"** (`#member-box`) dưới ghi chú bàn;
  - **Khách → menu (giỏ) / theo dõi đơn** (S-03, S-05, `js/member-box.js`): khung hội viên đã gắn có link **Xem thẻ thành viên ›** → sheet **Thẻ thành viên**;
  - **Bill in** (S-12, `js/pages/pos-receipt.js`): khối **"THẺ THÀNH VIÊN (lúc in)"**.
- **Dữ liệu:** không đổi schema, không migration (migration kế tiếp vẫn là `0034`). `loyaltyRepo.vouchersOf` nối thêm `Campaigns` để lấy tên chiến dịch của voucher.

## User Story

- **US-047-1:** Là nhân viên nhập món giúp khách tại bàn, tôi muốn gắn SĐT hội viên (hoặc đăng ký nhanh) ngay lúc gọi món, để khách được tích điểm / ưu đãi mà không phải đợi tới lúc thu tiền.
- **US-047-2:** Là hội viên, tôi muốn xem điểm, lịch sử điểm, thẻ tem, quà đổi được và voucher của mình (giá trị, hạn dùng, từ chiến dịch nào) trên điện thoại khi ngồi ở quán.
- **US-047-3:** Là hội viên, tôi muốn bill ghi điểm hiện có và voucher còn hạn, để biết quyền lợi sau khi thanh toán.

## Quy tắc

1. **Gắn ở Gọi món tại bàn (D-36):**
   - nhập SĐT → **Tra cứu** (hoặc Enter); có → hiện tên đầy đủ · SĐT · mức ưu đãi (hạng −x% hoặc "đơn đầu −10%") → **Gắn vào bàn**;
   - chưa có → đăng ký nhanh: họ tên, SĐT người giới thiệu (không bắt buộc), **bắt buộc tick khách đồng ý** (giao diện chặn, server cũng trả `400 CONSENT_REQUIRED`) → **Đăng ký & gắn vào bàn**;
   - bàn trống / nhóm mới → nút thành **Mở bàn & gắn** / **Đăng ký & mở bàn & gắn**: mở bàn (kèm ghi chú đang gõ) rồi gắn;
   - phiên đã có hội viên → dòng "⭐ Tên · ưu đãi" + nút **Gỡ**; nhập số khác rồi gắn = thay;
   - ô nhập SĐT tạo một lần, không bị thay khi trang vẽ lại theo realtime (không mất chữ đang gõ);
   - phát `session.member_changed` tới quầy + phiên (payload chỉ có tên che); quầy xem tên đầy đủ qua API bàn / phiên;
   - ưu đãi hội viên / điểm / tem tính lúc thu tiền như cũ (F-014, F-039).
2. **Thẻ thành viên (D-37):**
   - chỉ khi phiên còn mở, có hội viên, thiết bị thuộc phiên (hoặc quầy có Bearer); khác → `403` / `404 NO_MEMBER` / `409 SESSION_CLOSED`; phiên không có → `404 NOT_FOUND`;
   - nội dung: tên che ("Nguyễn V. A."), SĐT che ("09xx***567"), hạng, % ưu đãi hội viên (và % đơn đầu nếu còn), điểm, **tối đa 10** giao dịch điểm gần nhất (nhãn "Tích điểm" / "Đổi quà" / "Quán điều chỉnh" / "Điểm hết hạn" / "Hoàn tiền — trả / trừ điểm"), thẻ tem, quà đổi điểm (đủ / còn thiếu N điểm), voucher **còn dùng được** (giá trị, giảm tối đa, đơn tối thiểu, hạn, nguồn: `Chiến dịch "<tên>"` / "Giới thiệu bạn" / "Quán tặng");
   - **không** trả mã voucher (quầy chọn mã khi thu — như F-038), không trả tên nhân viên trong lịch sử điểm; response `Cache-Control: no-store`.
3. **Bill (D-38):** bill thanh toán (phiên, từng phần chia bill, mang đi) của lượt thu có hội viên đang hoạt động, chưa ẩn danh → khối "THẺ THÀNH VIÊN (lúc in)": điểm hiện có, thẻ tem, voucher còn hạn (giá trị + HSD). Số liệu **lúc in** (in lại sau thì là số mới). Phiếu tạm tính và bill không có hội viên không in khối này.

## API

| Method & path | Ai | Kết quả / lỗi |
| --- | --- | --- |
| `POST /api/members/lookup`, `POST /api/members`, `POST/DELETE /api/sessions/{id}/member` | Quầy (Bearer) | Đã có (F-014) — dùng lại |
| `GET /api/sessions/{id}/member-card` | Khách trong phiên / quầy | `{ member: { maskedName, maskedPhone, tierName, discountPercent, firstOrderPercent \| null }, points, pointHistory[≤ 10 { delta, type, label, createdAt }], stampCards[{ programId, name, requiredStamps, stamps, rewardsAvailable, text }], rewards[{ rewardId, name, pointsCost, missing }], vouchers[{ percent, amount, maxDiscount, minOrderAmount, expiresAt, source, sourceLabel }] }`; `403`, `404 NOT_FOUND`, `404 NO_MEMBER`, `409 SESSION_CLOSED` |
| `GET /api/sessions/{id}/receipt?mode=final`, `/api/payments/{id}/receipt`, `/api/orders/{id}/receipt` | Quầy | thêm `memberCard: { points, stampCards[text], vouchers[] } \| null` — có khi lượt thu có hội viên; `mode=provisional` → `null` |

## Acceptance Criteria

- AC-047-01: Nhân viên ở Gọi món tại bàn chọn bàn trống, nhập SĐT hội viên có sẵn → Gắn → bàn được mở, phiên có hội viên; quầy và khách cùng bàn nhận `session.member_changed`.
- AC-047-02: SĐT chưa có → đăng ký nhanh không tick đồng ý → bị chặn; tick → hội viên mới được gắn vào phiên.
- AC-047-03: Khách trong phiên mở Thẻ thành viên → thấy điểm, lịch sử điểm, thẻ tem, quà, voucher kèm hạn và tên chiến dịch; **không** có mã voucher.
- AC-047-04: Thiết bị không thuộc phiên → 403; phiên chưa có hội viên → 404; phiên đã đóng → 409.
- AC-047-05: Bill thanh toán có hội viên in điểm hiện có, thẻ tem, voucher còn hạn; phiếu tạm tính không in; bill không có hội viên không in.
- AC-047-06: Gỡ hội viên khỏi phiên đang mở → phiên không còn hội viên, quầy và điện thoại trong phiên nhận `session.member_changed` (`member = null`); thiết bị không thuộc phiên gỡ → 403; phiên đã đóng → 409 `SESSION_CLOSED`. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/member-card.test.js` — 5 test, PASS:
  - "AC-047-01/02": nhân viên mở bàn trống, tra cứu không thấy, đăng ký không đồng ý → `400 CONSENT_REQUIRED`, có đồng ý → 201, gắn → quầy thấy tên đầy đủ, `session.member_changed` chỉ mang tên che, tổng quan bàn hiện hội viên, gọi món + thu tiền → tích điểm;
  - "chuẩn bị: chiến dịch tặng voucher cho mọi hội viên" ("Tri ân tháng 10", xuất danh sách, 15 %, 7 ngày);
  - "AC-047-03": tên / SĐT che, điểm, lịch sử `EARN`, tem 2/10, quà còn thiếu điểm, voucher 15 % nguồn `Chiến dịch "Tri ân tháng 10"`, JSON không có mã voucher; quầy cũng đọc được;
  - "AC-047-04": thiết bị khác 403, phiên chưa gắn hội viên `404 NO_MEMBER`, phiên đã đóng 409, phiên không có 404;
  - "AC-047-05": bill cuối có `memberCard` (điểm, tem, voucher chiến dịch, không có `code`), phiếu tạm tính `null`, bill không hội viên `null`, bill mang đi có hội viên có khối.
- E2E "hội viên tại bàn + thẻ thành viên" (`kiểm-thử/e2e/flow.spec.js`).
- 18/10/2026: `npm test` 234/234, `npm run test:e2e` 29/29 — xem [TASK-056](../công-việc/TASK-056.md).
