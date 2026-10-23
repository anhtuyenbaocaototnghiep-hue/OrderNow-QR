# FEATURE-051 — Đánh giá sau khi dùng món

> **Nguồn:** chủ dự án yêu cầu 21/10/2026: "đánh giá sau khi dùng món". Quyết định: [ADR-010](../quyết-định/ADR-010-chuyen-ban-so-quy-danh-gia.md) D-46…D-48.

- **Status:** CONFIRMED (ADR-010 D-46…D-48) · Triển khai: [TASK-063](../công-việc/TASK-063.md)
- **Actor:**
  - **ACT-GUEST / ACT-MEMBER:** đánh giá;
  - **ACT-STAFF:** nhận báo đánh giá thấp, bấm Đã xử lý;
  - **ACT-ADMIN:** xem trang Đánh giá, chỉnh ngưỡng hiện sao.
- **Màn hình:**
  - **Điện thoại khách — màn cảm ơn** sau khi thanh toán (S-05):
    - khung **"Bạn thấy món hôm nay thế nào?"**, mỗi món nhóm đã gọi một hàng 5 sao;
    - ô góp ý (không bắt buộc) → **Gửi đánh giá** → "Cảm ơn bạn đã đánh giá".
  - **Menu khách** (S-02): "★ 4,6 (12)" cạnh món đủ số lượt đánh giá.
  - **Quầy → Đơn hàng:** dải **"Đánh giá thấp"** (bàn, món ≤ 2 sao, góp ý, giờ) + âm báo; nút **Đã xử lý**.
  - **Quản lý → Đánh giá món** (SCR-45, mới):
    - lọc ngày;
    - bảng theo món: số lượt, sao trung bình, phân bố 1–5 sao;
    - danh sách góp ý / đánh giá thấp (bàn, giờ, đã xử lý bởi ai).
  - **Cài đặt:** "Hiện sao trên menu khi có ≥ N đánh giá trong D ngày".
- **Dữ liệu:** migration `0038_danh_gia.sql`.
  - `Reviews (ReviewId, SessionId, ClientToken, Comment, HasLow, HandledBy, HandledAt, CreatedAt)`, duy nhất `(SessionId, ClientToken)`.
  - `ReviewItems (ReviewId, MenuItemId, Stars 1–5)`.
  - Settings: `review.menu_min_count = 5`, `review.menu_days = 90`.

## User Story

- **US-051-1:** Là khách, tôi muốn chấm sao từng món và góp ý ngay trên điện thoại sau khi thanh toán, để quán biết món nào ngon / chưa ngon.
- **US-051-2:** Là nhân viên quầy, tôi muốn được báo ngay khi khách chấm món thấp, để ra hỏi han và xử lý khi khách còn ở quán.
- **US-051-3:** Là quản lý, tôi muốn xem sao trung bình và góp ý theo từng món trong khoảng ngày, để điều chỉnh công thức / menu.
- **US-051-4:** Là khách, tôi muốn thấy sao trung bình của món trên menu, để chọn món được nhiều người khen.

## Quy tắc (D-46…D-48)

1. **Ai / khi nào:**
   - điện thoại **thuộc phiên** (cookie khách), phiên **đã thanh toán** (đã đóng), trong **24 giờ** sau khi đóng;
   - chưa thanh toán → `409 SESSION_NOT_PAID`;
   - quá hạn → `409 REVIEW_EXPIRED`;
   - không thuộc phiên → `403`.
2. **Một lần / điện thoại / phiên:** gửi lại → `409 ALREADY_REVIEWED`.
   - Mỗi nhóm gửi tối đa **số món (ly / phần) đã gọi, không quá 10** đánh giá → `409 REVIEW_LIMIT` (chống một người mở nhiều tab dồn phiếu — review G3).
   - "Đã thanh toán" = phiên đóng và **có lượt thu** (kể cả bill 0đ nhờ voucher / đổi điểm).
3. **Nội dung:**
   - sao 1–5 cho từng món **thuộc phiên** (món cấp trên, đơn không hủy, còn số lượng sau sửa / xóa món); món không thuộc phiên → `400`;
   - góp ý ≤ 300 ký tự;
   - phải có ≥ 1 món được chấm hoặc có góp ý → nếu không: `400`;
   - mỗi món một lần trong một đánh giá.
4. **Đánh giá thấp:**
   - có món ≤ 2 sao → `HasLow = 1`, quầy nhận `review.low` (room `staff`) kèm bàn, món + sao, góp ý; dải "Đánh giá thấp" có âm báo;
   - **Đã xử lý** (`pos.use`) ghi người / lúc, gửi `review.handled`;
   - dải hiện các đánh giá thấp **chưa xử lý trong 12 giờ gần nhất** (không mất lúc nửa đêm);
   - chỉ rung chuông **lần đầu** của mỗi nhóm.
5. **Sao trên menu:** tính theo **nhóm (phiên)**: trung bình trong nhóm trước, rồi trung bình các nhóm; số lượt = số nhóm. Nhiều điện thoại cùng nhóm chỉ tính một lượt. Khoảng tính: `review.menu_days` ngày gần nhất.
   - Chỉ hiện khi số lượt ≥ `review.menu_min_count`.
   - Làm tròn 1 chữ số lẻ, dạng "★ 4,6 (12)".
6. Không lưu SĐT / tên khách trong đánh giá. Hội viên gắn vào phiên không được cộng điểm khi đánh giá (D-46 không chọn).

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/sessions/{id}/review` | khách trong phiên | `{ canReview, reason?, items[{ menuItemId, name }], submitted }` |
| `POST /api/sessions/{id}/review` | khách trong phiên | `{ items[{ menuItemId, stars }], comment? }` → 201. Lỗi `409 SESSION_NOT_PAID / REVIEW_EXPIRED / ALREADY_REVIEWED / REVIEW_LIMIT` |
| `GET /api/reviews/alerts` · `POST /api/reviews/{id}/handle` | `pos.use` | dải đánh giá thấp |
| `GET /api/admin/reviews?from&to` | ADMIN | `{ items[{ menuItemId, name, count, avg, dist[5] }], reviews[…] }` |
| `GET /api/menu` | khách | món thêm `rating: { avg, count } \| null` |

## Acceptance Criteria

- AC-051-01: Khách trong nhóm đã thanh toán gửi đánh giá (Cà phê đen 5 sao, Bạc xỉu 4 sao, góp ý "ngon") → 201. Gửi lại → `409 ALREADY_REVIEWED`. Điện thoại khác cùng nhóm vẫn đánh giá được 1 lần.
- AC-051-02: Không đánh giá được khi:
  - nhóm chưa thanh toán → `409 SESSION_NOT_PAID`;
  - quá 24 giờ → `409 REVIEW_EXPIRED`;
  - điện thoại không thuộc nhóm → `403`;
  - món không thuộc nhóm hoặc sao ngoài 1–5 → `400`;
  - không chấm món nào và không góp ý → `400`.
- AC-051-03: Có món 2 sao:
  - quầy nhận `review.low` (bàn, món, góp ý); danh sách cảnh báo có đánh giá này;
  - nhân viên bấm Đã xử lý → hết khỏi danh sách, ghi người xử lý;
  - đánh giá toàn ≥ 3 sao không báo.
- AC-051-04: Trang Đánh giá của quản lý: món có 2 lượt (5, 4) → trung bình 4,5, phân bố đúng; nhân viên / trưởng ca gọi → `403`.
- AC-051-05: Menu khách:
  - món có 5 đánh giá trong 90 ngày (5, 5, 4, 4, 5) → `rating = { avg: 4.6, count: 5 }`;
  - món chỉ 4 đánh giá → `rating = null`;
  - đổi ngưỡng ở Cài đặt thành 3 → món 4 đánh giá hiện sao.
- AC-051-06: Điện thoại khách:
  - thu tiền xong, màn cảm ơn có khung đánh giá các món của nhóm; chấm sao + góp ý → Gửi → "Cảm ơn bạn đã đánh giá";
  - quầy hiện dải "Đánh giá thấp" khi có món ≤ 2 sao; bấm Đã xử lý → dải ẩn;
  - menu hiện ★ ở món đủ lượt.

## Bằng chứng

`tests/reviews.test.js` (AC-051-01…05) · E2E "đánh giá sau khi dùng món…" (AC-051-06).
