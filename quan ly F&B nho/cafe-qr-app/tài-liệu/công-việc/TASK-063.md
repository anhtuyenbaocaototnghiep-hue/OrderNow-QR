# TASK-063 — Đánh giá sau khi dùng món
Status: READY_FOR_REVIEW (21/10/2026)
Feature: [FEATURE-051](../chức-năng/FEATURE-051.md) · Quyết định: [ADR-010](../quyết-định/ADR-010-chuyen-ban-so-quy-danh-gia.md) D-46…D-48 · Module: MOD-MENU, MOD-ORDER, MOD-NOTIFY, MOD-REPORT · Màn hình: SCR-05 (màn cảm ơn), SCR-02 (menu khách), SCR-10 (dải "Đánh giá thấp"), SCR-45 (mới — Quản lý → Đánh giá món), SCR-33 (Cài đặt)
Nguồn: chủ dự án yêu cầu 21/10/2026 ("đánh giá sau khi dùng món"); chọn: sao từng món + góp ý, báo quầy khi ≤ 2 sao, hiện sao trung bình trên menu. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-063-danh-gia-mon` · Phụ thuộc: F-004 (màn cảm ơn), F-006 (thu tiền), F-041 (menu engineering)

## Mục tiêu
- Sau khi thanh toán, khách chấm 1–5 sao từng món + góp ý trên điện thoại (1 lần / điện thoại / lượt, trong 24 giờ).
- Quầy được báo ngay khi có món ≤ 2 sao.
- Quản lý xem trung bình / phân bố / góp ý theo món.
- Menu khách hiện sao cho món đủ số lượt.

## Phạm vi sửa
- **CSDL:**
  - `chuyển-đổi/0038_danh_gia.sql` (`Reviews`, `ReviewItems`, 2 cài đặt);
  - `sp_DeleteUser.sql` (`Reviews.HandledBy` là lịch sử).
- **Server:**
  - `reviewsRepo.js`, `reviewService.js` (mới);
  - `routes/engagement.js` (khách), `routes/staff.js` (dải cảnh báo), `routes/operations.js` (báo cáo + cài đặt);
  - `menuService` (sao trên menu);
  - `settingsService`;
  - `middleware/audit.js` (`review.handle`);
  - `routes/pages.js`.
- **Giao diện:**
  - `t-track.js` (khung đánh giá ở màn cảm ơn);
  - `t-menu.js` (sao);
  - `pos/index.html` + `pos-dashboard.js` (dải "Đánh giá thấp");
  - `admin/reviews.html` + `admin-reviews.js` (mới);
  - `admin-shell.js` (menu);
  - `admin-settings.js` (ngưỡng);
  - `css/customer.css`.
- **Test:**
  - `tests/reviews.test.js`;
  - E2E "đánh giá sau khi dùng món…";
  - a11y quét thêm `/admin/reviews`.
- **Tài liệu:**
  - FEATURE-051, BR-081…083, US-051-1…4, AF;
  - `tc-map`, `api-contract`, `data-model`, `realtime-events`, `roles-permissions`, `sitemap`;
  - hướng dẫn `chức-năng-mới/28-đánh-giá-món.md`.

## Không được sửa
- Luồng thu tiền / màn cảm ơn hiện có (chỉ thêm khung đánh giá).
- Không lưu SĐT / tên khách trong đánh giá.
- Không tặng điểm khi đánh giá (D-46).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · migrate `CafeQrDev`.

## Cần hỏi duyệt nếu
- Muốn tặng điểm khi đánh giá.
- Muốn cho khách xem góp ý của người khác.
- Muốn đổi thời hạn 24 giờ.

## Kết quả thực chạy (21/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **284/284 PASS** (24 file — thêm `reviews.test.js` 5 test) — lần đầu |
| `npm run test:e2e` | **39/39 PASS** (gồm E2E "đánh giá sau khi dùng món…"; a11y quét thêm `/admin/reviews` và khung đánh giá) |
| `node kịch-bản/traceability.js --check` | 127 US, 316 AC — PASS 316, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |

## Review G3 (agent độc lập, 21/10/2026)
Kết luận lần 1: **Request changes**. Đã sửa:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | Dồn phiếu. "Một điện thoại" = một cookie: mở tab ẩn danh rồi Gộp vào chính nhóm mình là được cookie mới. Một khách mở 5 tab chấm 5 × 1★ → menu hiện "★ 1,0 (5)" suốt 90 ngày, quầy rung chuông 5 lần | <br>• Sao trên menu tính theo **nhóm**: trung bình trong nhóm, rồi giữa các nhóm; số lượt = số nhóm. <br>• Mỗi nhóm tối đa số món đã gọi (≤ 10) đánh giá → `409 REVIEW_LIMIT`. <br>• Chuông chỉ rung lần đầu của nhóm. <br>Test mới **FAIL với code cũ**, PASS với code mới |
| M2 (phải sửa) | Màn cảm ơn vẽ lại khi quầy hoàn tất món đã thu, điện thoại kết nối lại hoặc được tặng voucher → mất sao / góp ý đang nhập | Không vẽ lại màn cảm ơn khi nội dung không đổi; bản nháp (sao + góp ý) giữ ở cấp trang. E2E: chấm + gõ → quầy hoàn tất món → bản nháp còn nguyên |
| M3 (phải sửa) | Sao đã chọn / chưa chọn chỉ khác màu (tương phản ~1,08:1) — trái WCAG 1.4.1 | Sao rỗng ☆ = chưa chọn, sao đặc ★ = đã chọn (khác hình); bấm lại để bỏ chấm |
| N1 | Bill 0đ (voucher / đổi điểm) không đánh giá được | "Đã thanh toán" = có lượt thu, không cần số tiền > 0 |
| N2 | Dải "Đánh giá thấp" mất lúc nửa đêm | Hiện đánh giá chưa xử lý trong 12 giờ gần nhất |
| N3 | Lỗi tải dải cảnh báo làm hỏng tải bảng đơn; bấm Đã xử lý lỗi mạng vẫn mất thẻ | Bắt lỗi riêng; chỉ bỏ thẻ khi xử lý được |
| N4 | Lưu xong mà báo quầy lỗi → khách nhận 500 | Báo quầy trong try/catch |
| N5 | Không đọc "Cảm ơn bạn đã đánh giá" | `role="status"`. Phím mũi tên giữa các sao (mẫu radio đầy đủ) chưa làm — mỗi sao vẫn là một nút Tab được |
| Test | Thiếu: người lạ xem → 403, món đã xóa, xóa tài khoản người xử lý, quét a11y màn cảm ơn, khôi phục cài đặt khi E2E lỗi | Đã thêm cả 5. Bill 0đ chưa có test riêng (đường code đơn giản) |

**Cần chủ dự án quyết (ghi lại, chưa đổi):**
- **N6:** báo cáo quản lý chưa giới hạn độ dài khoảng ngày / chưa phân trang (chỉ quản lý dùng).
- **N7:** khung đánh giá hiện ngay khi thanh toán, kể cả khi món còn đang pha (quán trả tiền trước). Có thể đổi thành chỉ hiện khi mọi món đã xong.
- **Có sẵn từ trước:** `POST /api/sessions/{id}/join` chỉ cần mã QR bàn, chưa giới hạn tần suất. Người chụp lại QR có thể Gộp vào nhóm từ xa. Ngoài phạm vi F-051; nên làm một việc riêng.

## Kết quả sau khi sửa theo review (21/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **286/286 PASS** (`reviews.test.js` 7 test) |
| Test chống dồn phiếu với code cũ | **FAIL** đúng chỗ — đã khôi phục |
| `npm run test:e2e` | **39/39 PASS** (bản nháp còn sau khi món xong; a11y quét màn cảm ơn + khung đánh giá) |
