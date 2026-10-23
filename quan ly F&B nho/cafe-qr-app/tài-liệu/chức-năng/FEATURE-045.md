# FEATURE-045 — Gọi lại đơn lần trước & món yêu thích

> **Nguồn:** skill `advanced-features` §4 **F-024**. Đổi mã thành 045 vì FEATURE-024 đã là "Gọi món tại bàn" — xem [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md).

- **Status:** CONFIRMED (ADR-006) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** khách là hội viên (điện thoại), STAFF (màn Bán mang đi).
- **Màn hình:**
  - Khách, menu S-02 sau khi gắn SĐT:
    - thẻ **"Lần trước bạn gọi: Cà phê sữa (ít đường) ×2, Nước suối ×1 — Gọi lại"**;
    - dải **"Món yêu thích của bạn"**: ♥ trước, rồi top món hay gọi; chạm để thêm;
    - nút **♡/♥** trên từng thẻ món.
  - Quầy, S-13 Bán mang đi: tra SĐT hội viên → thẻ "Lần trước … gọi" + **Gọi lại**.
- **Dữ liệu:** migration `0015_goi_lai_don.sql`:
  - `MemberFavorites(MemberId, MenuItemId, CreatedAt)`;
  - index `IX_Payments_Member`.

  "Lần trước" đọc từ đơn đã thu (`Payments.MemberId` qua phiên hoặc đơn mang đi). Từ F-026, dòng món lưu `PaidAt`/`PaymentId`.

## Quy tắc

1. **Gọi lại kiểm từng dòng:**
   - món còn trên thực đơn **theo người xem** (khách theo lịch F-040; quầy thấy đủ);
   - món còn bán (không "Hết món");
   - tùy chọn còn hợp lệ (chạy lại `pricing`).

   Dòng không qua được → `skipped[]` kèm lý do ("đang hết món", "không còn trên thực đơn lúc này", "tùy chọn đã thay đổi"). Ghi chú món giữ nguyên.
2. **Giá lấy theo thực đơn HIỆN TẠI**, không lấy giá cũ. Tổng chính thức vẫn do báo giá server tính (D-7).
3. **Món yêu thích** = món đánh dấu ♥ + top 5 món hội viên mua nhiều nhất (đơn đã thu, không tính đơn hủy/hoàn).
4. **Quyền:**
   - khách chỉ xem / gọi lại / ♥ cho hội viên **đang gắn vào phiên chưa đóng của chính điện thoại đó** (cookie `cf_client`), sai → 403;
   - quầy (JWT) dùng được mọi hội viên.

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/members/{id}/recent-orders?limit=3` | Đơn đã thu gần nhất; mỗi dòng có `available`, `reason` |
| `GET /api/members/{id}/favorites` | `{ hearted[], items[{ menuItemId, name, price, isAvailable, hearted, timesOrdered }] }` |
| `PUT` / `DELETE /api/members/{id}/favorites/{menuItemId}` | Đánh dấu / bỏ ♥ → trả lại danh sách yêu thích |
| `POST /api/cart/replay { orderId }` | `{ items[{ menuItemId, name, quantity, note, optionIds, optionLabels, optionDelta, price }], skipped[{ name, reason }] }` |

## Acceptance Criteria

- AC-045-01: Gọi lại đơn có món đã hết → giỏ thiếu món đó + thông báo lý do.
- AC-045-02: Giá món đã đổi → giỏ dùng giá mới.
- AC-045-03: Khách phiên khác gọi API với `memberId` lạ → 403 (xem, gọi lại, ♥).
- AC-045-04: Hội viên ♥ món Latte → đọc lại danh sách yêu thích của hội viên có Latte (♥); Cà phê sữa đã mua 2 ly trong đơn đã thu → "hay gọi" ghi 2; bỏ ♥ → Latte không còn trong danh sách ♥. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-045-05: Gọi lại đơn có món đang ngoài lịch thực đơn → dòng đó bị bỏ, lý do "không còn trên thực đơn lúc này"; dòng có tùy chọn không còn hợp lệ → bỏ, lý do "tùy chọn đã thay đổi — vui lòng chọn lại"; các dòng hợp lệ vẫn vào giỏ. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/phase4.test.js` → "Gọi lại đơn lần trước & món yêu thích (F-045)": 3 test.
- E2E "gọi lại đơn lần trước + thời gian chờ…".
