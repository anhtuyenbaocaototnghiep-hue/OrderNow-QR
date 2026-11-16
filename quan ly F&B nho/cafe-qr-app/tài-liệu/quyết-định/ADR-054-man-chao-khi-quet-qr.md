# ADR-054 — Màn chào khi khách quét QR

- **Trạng thái:** ACCEPTED (16/11/2026). Chủ dự án: "bạn thiết kế giao diện khi quét QR nó vào sẽ thấy cái này được không" (kèm ảnh màn chào gọi món tại bàn của một hệ thống khác).
- **Bối cảnh:** từ F-001, khách quét QR bàn trống là vào thẳng thực đơn; "Gọi thanh toán", "Gọi nhân viên" nằm ở trang Theo dõi đơn (sau khi gửi đơn), ô hội viên nằm trong giỏ. Ảnh chủ dự án gửi là một màn chào: tên + địa chỉ quán, ảnh bìa, lời chào theo buổi, "trả đồ tại bàn …", ô nhập SĐT tích điểm, ba ô Gọi thanh toán / Gọi nhân viên / Đánh giá, nút lớn "Xem Menu – Gọi món".
- **Nguyên tắc:** làm theo bố cục, **không chép** hình ảnh, chữ hay thương hiệu của hệ thống trong ảnh — dùng tên / địa chỉ quán của mình, màu và biểu tượng của app (giao diện "Mộc"), chức năng sẵn có.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-228 | **Màn chào sau khi vào bàn** (SCR-01, `/t/{qrToken}`): khi đã có nhóm (bàn trống → nhóm mới; đã trong nhóm; sau Gộp chung / Tạo đơn cá nhân / chuyển bàn) hiện **màn chào** thay vì vào thẳng thực đơn: tên quán + địa chỉ (Cài đặt), khung giới thiệu "Gọi món tại bàn — Chọn món ngay trên điện thoại" + câu theo cách phục vụ (mang ra bàn / nhận tại quầy, F-088) + ưu đãi đang chạy đầu tiên (F-016), lời chào theo giờ Việt Nam (sáng 5–10 / trưa 11–13 / chiều 14–17 / tối) + tên hội viên che (BR-024) hoặc "Quý khách", câu bàn ("Quán sẽ mang món ra cho bạn tại Bàn 05" / "Bạn đang ngồi Bàn 05 · nhận món tại quầy"), dải quán tạm ngưng / chưa mở ca nếu có, ô hội viên (F-014 / F-047 — dùng lại), ba ô **Gọi thanh toán** (chưa có món → nhắc gọi món trước; có → sang Theo dõi đơn và mở ngay hộp xác nhận `?act=pay`; đã gọi → ghi "Đã gọi"), **Gọi nhân viên** (hộp F-021 ngay trên màn chào — module dùng chung), **Đánh giá** (giải thích: chấm sao ở màn cảm ơn sau khi thanh toán — luật F-051 giữ nguyên), nút lớn **Xem thực đơn – Gọi món**, dòng "Đơn của bạn · N đơn đã gửi" khi có đơn. Tên quán ở đầu thực đơn dẫn về màn chào. Không thêm ảnh bìa tải lên (dùng khung màu + biểu tượng của app). |
| D-229 | **Cài đặt "Màn chào khi khách quét QR"** (`guest.welcome`, mặc định **bật**; chủ quán / quản lý cửa hàng đổi ở Cài đặt → Màn gọi món của khách — như "+" mở bảng chọn F-083). Tắt → quét QR vào thẳng thực đơn như trước. `GET /api/menu` thêm `ui.welcome` và `shop.address` (địa chỉ in trên hóa đơn — công khai). E2E cũ chạy với cài đặt tắt (như F-088); bài E2E màn chào tự bật rồi trả lại. |

## Phương án đã cân nhắc

- **Ảnh bìa / băng rôn tải lên như ảnh mẫu:** thêm chỗ tải ảnh + lưu tệp; chưa cần — khung màu + ưu đãi đang chạy đủ nói điều quán muốn nói. Làm sau nếu chủ quán muốn ảnh riêng.
- **Cho đánh giá trước khi thanh toán:** đổi luật F-051 (một lượt đánh giá / nhóm, sau khi thu tiền) — cần quyết định riêng; ô "Đánh giá" hiện giải thích.
- **Trang riêng `/t/{qr}/home`:** thêm một địa chỉ; dùng luôn `/t/{qr}` (quét lại = về màn chào) gọn hơn.
- **Luôn bật, không cài đặt:** quán đông có thể muốn khách vào thẳng thực đơn (bớt 1 chạm) → để chủ quán chọn.

## Hệ quả

- **Mã nguồn:** `js/pages/t-entry.js` (màn chào), `js/call-staff.js` (hộp Gọi nhân viên dùng chung; `t-track.js` dùng lại + `?act=pay`), `js/pages/t-menu.js` (tên quán dẫn về màn chào), `js/icons.js` (sun, moon, map-pin — Lucide), `css/customer.css`, `services/settingsService.js` (`guestWelcome`), `services/menuService.js` (`ui.welcome`), `routes/public.js` (`shop.address`), `routes/operations.js`, `auth/permissions.js` (`STORE_MGR_SETTINGS`), `js/pages/admin-settings.js`, `kịch-bản/e2e-server.js`. Không migration.
- **Test:** `guest-welcome.test.js` (AC-092-01); E2E màn chào (AC-092-02, 03); a11y khách thêm màn chào 320 / 390 px (AC-092-04).
- **Tài liệu:** FEATURE-092, FEATURE-001 (ghi chú), api-contract, roles-permissions, screens-flows, sitemap, user-stories, use-cases, tc-map.
