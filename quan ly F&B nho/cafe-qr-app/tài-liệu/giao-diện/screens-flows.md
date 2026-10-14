# Màn hình và luồng

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §11.5 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

| Mã | Màn hình | Người dùng | Nội dung & hành động chính | UI states |
| --- | --- | --- | --- | --- |
| S-01 | `/t/{qrToken}` – Vào bàn | Khách | Tên quán, "Bàn 05"; hộp thoại Gộp/Cá nhân nếu bàn có phiên | loading, QR sai (404), phiên đã đóng (tự tạo mới) |
| S-02 | `/t/{qrToken}/menu` – Menu | Khách | Tab danh mục, thẻ món (ảnh, tên, giá, nút +), thanh giỏ nổi dưới "3 món · 95.000đ · Xem giỏ"; nếu phiên đã có đơn: nút "Xem đơn / Gọi thanh toán" | loading skeleton, rỗng, hết món (mờ), lỗi mạng |
| S-03 | Giỏ hàng (sheet trượt lên) | Khách | Dòng món ± số lượng, ghi chú, tổng, nút **Gửi đơn** | gửi (disable nút), lỗi hết món (highlight dòng + thông báo) |
| S-04 | Xác nhận gọi thanh toán (modal trên S-05) | Khách | "Gọi nhân viên ra thu tiền 125.000đ (tiền mặt)?" liệt kê đơn; nút Xác nhận / Hủy; sau khi gọi: trạng thái "Đã gọi · đang chờ nhân viên" + đồng hồ | chưa có đơn (ẩn), phiên đóng, quá 5 phút (gợi ý ra quầy + Gọi lại) |
| S-05 | Theo dõi đơn | Khách | Danh sách đơn của phiên với trạng thái (Chờ xác nhận / Đang chuẩn bị / Đã xong), tổng tạm tính; hai nút cố định dưới: **Gọi thêm món**, **Gọi thanh toán**; sau thu tiền: "Cảm ơn, đã thanh toán" | mất kết nối, pop-up "Đã xong", đã gọi thanh toán, đã thanh toán |
| S-09 | `/pos/login` | Staff/Admin | Form đăng nhập | sai mật khẩu, tài khoản khóa |
| S-10 | `/pos` – Dashboard quầy | Staff/Admin | Dải trên: **Gọi thanh toán** (bàn, số tiền, thời gian chờ, nhấp → S-14); 3 cột Mới / Đang pha / Đã xong; thẻ đơn; âm thanh; icon kết nối; nút **Bán mang đi** (→ S-13); panel "Bàn đang phục vụ" (mỗi bàn: số phiên, tổng, nút Thu tiền) | mất kết nối, banner đơn trễ |
| S-11 | Chi tiết đơn (drawer) | Staff/Admin | Món + ghi chú, tổng, bàn/mang đi; nút Tiếp nhận / Hoàn tất / Hủy; với mang đi: In lại bill | lỗi 409 (đã xử lý bởi người khác), hết kho |
| S-12 | Trang in: `/pos/sessions/{id}/receipt` (phiên) và `/pos/orders/{id}/receipt` (mang đi) | Staff/Admin | Hóa đơn thuần, `@media print`, khổ 58/80 mm; chế độ `provisional` có watermark TẠM TÍNH | — |
| S-13 | `/pos/takeaway` – **Bán mang đi** (mục riêng) | Staff/Admin | Lưới món theo danh mục (chạm +1), giỏ bên phải, ô Tiền khách đưa + nút nhanh, tiền thừa, nút **Thu tiền & In bill**; tab "Đơn mang đi hôm nay" (in lại) | giỏ trống (disable), tiền thiếu (bôi đỏ), hết kho |
| S-14 | Drawer **Thu tiền bàn** (từ S-10) | Staff/Admin | Phiên: bàn, danh sách đơn + món, tổng phải thu; cảnh báo đơn còn PENDING (nút Tiếp nhận/Hủy ngay tại chỗ); ô Tiền khách đưa + nút nhanh, tiền thừa; nút **In tạm tính**, **Đã thu tiền & In bill**; với phiên không có đơn: **Đóng bàn trống** | còn PENDING (chặn), tiền thiếu, đã thu bởi máy khác (409) |
| S-20 | `/admin/users` | Admin | Bảng tài khoản, tạo/sửa/khóa/đặt lại mật khẩu | trùng username |
| S-21 | `/admin/menu` | Admin | Danh mục + món; bật/tắt hết món; sửa giá/ảnh | — |
| S-22 | `/admin/tables` | Admin | Danh sách bàn, ảnh QR, tải/in QR, tạo lại QR | — |
| S-23 | `/admin/ingredients` | Admin | Tồn kho, giữ chỗ, khả dụng, ngưỡng, điều chỉnh, lịch sử | cảnh báo sắp hết |
| S-24 | `/admin/menu/{id}/bom` | Admin | Bảng nguyên liệu + định lượng, thêm/xóa dòng, Lưu | định lượng ≤ 0 (highlight) |
| S-25 | `/admin/reports` | Admin | Bộ lọc ngày, KPI (doanh thu, số đơn), biểu đồ theo ngày, top món, nguyên liệu sắp hết, bảng thu tiền theo nhân viên | khoảng ngày sai (disable nút) |

Điều hướng: khách S-01 → S-02 ⇄ S-03 → S-05 (⇄ S-02 gọi thêm; S-04 gọi thanh toán). Quầy: S-09 → S-10 (S-11, S-14, S-12) và S-13 là mục riêng trên thanh điều hướng POS. Admin: S-09 → `/admin` (S-20…S-25) và vẫn vào được `/pos`.

Thiết bị: khách — điện thoại (≥ 360 px), chạm; quầy — tablet/laptop (≥ 1024 px), nên có **tablet cầm tay** để nhân viên bấm "Đã thu tiền" ngay tại bàn; admin — laptop. Ngôn ngữ: tiếng Việt. Hỗ trợ tiếp cận: nhãn form, focus rõ, contrast đủ; chưa yêu cầu đọc màn hình đầy đủ (UNKNOWN).

## Triển khai thực tế (14/10/2026)

FE thuần HTML/CSS/JS (ADR-002) trong `ứng-dụng/giao-diện/public`; mỗi màn hình một file HTML + một script trong `js/pages/`.

| Mã | Đường dẫn | File |
| --- | --- | --- |
| S-01 | `/t/{qrToken}` | `t/index.html`, `js/pages/t-entry.js` |
| S-02, S-03 | `/t/{qrToken}/menu` (giỏ là bottom sheet) | `t/menu.html`, `js/pages/t-menu.js` |
| S-04, S-05 | `/t/{qrToken}/track` (gọi thanh toán là modal) | `t/track.html`, `js/pages/t-track.js` |
| S-09 | `/pos/login` | `pos/login.html`, `js/pages/pos-login.js` |
| S-10, S-11, S-14 | `/pos` (chi tiết đơn và thu tiền là drawer) | `pos/index.html`, `js/pages/pos-dashboard.js` |
| S-12 | `/pos/sessions/{id}/receipt?mode=final|provisional`, `/pos/orders/{id}/receipt` | `pos/receipt.html`, `js/pages/pos-receipt.js`, `css/print.css` |
| S-13 | `/pos/takeaway` | `pos/takeaway.html`, `js/pages/pos-takeaway.js` |
| S-20 | `/admin/users` | `admin/users.html`, `js/pages/admin-users.js` |
| S-21 | `/admin/menu` | `admin/menu.html`, `js/pages/admin-menu.js` |
| S-22 | `/admin/tables`, `/admin/tables/print` | `admin/tables.html`, `admin/qr-print.html` |
| S-23 | `/admin/ingredients` | `admin/ingredients.html`, `js/pages/admin-ingredients.js` |
| S-24 | `/admin/menu/{id}/bom` | `admin/bom.html`, `js/pages/admin-bom.js` |
| S-25 | `/admin/reports` (tab Doanh thu / Lịch sử đơn / Thu tiền) | `admin/reports.html`, `js/pages/admin-reports.js` |

Ghi chú triển khai: âm thanh POS dùng Web Audio ("ting" = đơn mới, chuông 3 nốt = gọi thanh toán) và cần bấm "Bật âm thanh" một lần do trình duyệt chặn tự phát; in bill qua iframe ẩn (không bị chặn popup), khổ 58/80 mm chọn ngay trên trang in và nhớ theo máy; nội dung người dùng luôn chèn bằng `textContent` (không `innerHTML`) để tránh XSS.

**Cập nhật ADR-004:** S-20 (tài khoản, trừ chính mình), S-21 (món, danh mục), S-22 (bàn) và S-23 (nguyên liệu) có nút **Xóa** màu đỏ trên từng dòng. Bấm Xóa mở hộp xác nhận nói rõ: nếu đã có lịch sử thì dữ liệu được giữ cho báo cáo cũ nhưng không còn dùng được. Sau khi xóa, toast báo "Đã xóa …" hoặc "Đã xóa … (vẫn giữ trong lịch sử, báo cáo cũ)". Bị chặn thì toast nêu lý do (bàn đang có khách, nguyên liệu đang dùng trong món X…).
