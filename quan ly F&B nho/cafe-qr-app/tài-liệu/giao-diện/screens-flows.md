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

## Màn hình giai đoạn 2 (ADR-005, 16/10/2026)

**Khách**

- **S-02 menu:**
  - Tab đặc biệt **Ưu đãi** (thẻ khuyến mãi + món có giá KM), **Gợi ý** (nhãn ghim / "Bán chạy"), **Combo** (thành phần + "Tiết kiệm").
  - Banner khi quán tạm ngưng nhận đơn.
  - Món có tùy chọn: "+" thêm theo mặc định (giữ ≤ 3 chạm); "Chọn size / tùy chọn ›" mở sheet chọn (radio/checkbox theo Min/Max).
- **S-03 giỏ:**
  - Ô **⭐ Nhập SĐT để nhận ưu đãi** (tra cứu → xác nhận tên che, hoặc đăng ký họ tên + đồng ý).
  - Dòng hiện tùy chọn, giá gạch.
  - Tổng lấy từ báo giá server.
- **S-05 theo dõi:** ô hội viên; tổng dự kiến sau ưu đãi (breakdown); nút **🙋 Gọi nhân viên** (sheet chọn nhanh, chờ 60 giây).

**Quầy**

- **Thanh trên:** nút ca ("Ca #n" / "⚠ Chưa mở ca"), nút **QR: đang nhận đơn / tạm ngưng**; banner "Chưa mở ca".
- **S-10:** dải xanh **Gọi nhân viên** (âm `bell`, nút Đã xử lý); thẻ đơn hiện tùy chọn + thành phần combo; bàn hiện hội viên.
- **S-14 Thu tiền bàn:** mục **Hội viên · giảm giá** (SĐT → tra cứu / đăng ký nhanh; giảm đ/% + lý do; ô tài khoản quản lý khi vượt ngưỡng); breakdown do server tính; "Tổng phải thu".
- **S-13 Bán mang đi:** tab Combo, modal tùy chọn, mục Hội viên · giảm giá, breakdown.
- **S-16 Gọi món tại bàn (`/pos/table-order`, F-024):** sơ đồ bàn (trống / xanh đang phục vụ / vàng gọi thanh toán, 📝 ghi chú, số món chưa gửi) → tab món + tùy chọn + ghi chú món → giỏ riêng từng bàn → "Gửi đơn Bàn …" (bàn trống tự mở bàn; nhiều nhóm: chọn Nhóm n / + Nhóm mới) → danh sách "Đã gọi" + "Thu tiền bàn này" (`/pos?settle=`). Ô ghi chú bàn: Lưu / "Mở bàn & lưu ghi chú". S-10 có ghi chú + nút Gọi món / Ghi chú ở mỗi bàn, phiếu ghi "Nhân viên nhập"; S-14 hiện ghi chú + "Gọi thêm món".
- **S-15 Ca & hoàn tiền (`/pos/shift`):** tiền đầu ca/đã thu/đã hoàn/dự kiến, lượt thu trong ca + nút Hoàn tiền (modal: số tiền, lý do, đơn hủy, hoàn kho, tài khoản quản lý), Đóng ca (đếm tiền → chênh lệch), In phiếu chốt ca.

**Quản lý** (thanh bên có nhóm **Marketing & Khách hàng** và **Vận hành**)

- **S-26 Hội viên:** danh sách che số, tìm SĐT đầy đủ/tên, chi tiết + lịch sử, sửa, ẩn danh; tab Hạng.
- **S-27 Combo.**
- **S-28 Khuyến mãi:** form lịch ngày/thứ/giờ, mục tiêu món/danh mục, lượt/ngày, cộng dồn hội viên, thống kê.
- **S-29 Gợi ý & ghim.**
- **S-30 Tùy chọn món:** nhóm + tùy chọn + định lượng thêm. Gán nhóm ở S-21 Sửa món.
- **S-31 Nhập kho & kiểm kê:** phiếu nhập, kiểm kê nháp → chốt, giá vốn & hao hụt.
- **S-32 Ca & hoàn tiền.**
- **S-33 Cài đặt:** nhận đơn QR, ngưỡng giảm tay, làm tròn, % đơn đầu.
- **S-21:** sửa danh mục có giờ bán.
- **S-25 Báo cáo:** tab **Marketing & khách hàng**; tab Thu tiền có cột Giảm/Đã hoàn.

## Màn hình giai đoạn 4–8 (ADR-006, 18/10/2026)

Route khai báo ở `ứng-dụng/máy-chủ/src/routes/pages.js`; mã S-xx ghi ở comment đầu mỗi file HTML. Quyền xem từng màn: `nghiệp-vụ/roles-permissions.md` mục 4.5.

### Màn hình mới

| Mã | Đường dẫn – Màn hình | Người dùng | Nội dung & hành động chính | File |
| --- | --- | --- | --- | --- |
| S-17 | `/pos/stock` – **Kho & sơ chế** (mục trên thanh quầy) | Staff/Manager/Admin | Tab **Sơ chế** (chọn bán thành phẩm, số mẻ, xem trước nguyên liệu đủ/thiếu + giá vốn ước tính, **Hoàn tất mẻ**, mẻ hôm nay, cảnh báo "Nên pha thêm"); **Hủy hàng** (nguyên liệu, số lượng, lý do, ghi chú; phiếu hôm nay); **Hạn dùng** (lô đã / sắp hết hạn trong 3 ngày, **Hủy lô**); **Nhận hàng** (chọn PO đang chờ, điền sẵn số gói còn thiếu, sửa thực nhận / giá / hạn dùng → **Nhập kho**); **Tồn kho** (cột Hết hạn; nút **Điều chỉnh** cho trưởng ca/quản lý); **Kiểm kê** (chỉ trưởng ca/quản lý) | `pos/stock.html`, `js/pages/pos-stock.js` |
| S-34 | `/admin/menu-schedules` – **Lịch thực đơn & thời gian pha** | Admin | Tab **Lịch thực đơn**: danh sách lịch (khoảng ngày, thứ, giờ, món/danh mục kèm nhãn Hiện/Ẩn, công tắc Bật), form chọn "— / Hiện / Ẩn" cho từng món/danh mục, **Xem trước menu lúc…**; lịch "Giờ bán — …" chỉ sửa ở S-21. Tab **Thời gian pha & hàng chờ**: cài đặt bếp, bảng chuẩn / thực tế / số mẫu / số đang dùng, **Tính lại thống kê** | `admin/menu-schedules.html`, `js/pages/admin-menu-schedules.js` |
| S-35 | `/admin/purchasing` – **Nhà cung cấp & đặt hàng** | Admin | Tab **Đề xuất nhập hàng** (khả dụng, đang về, nhu cầu, an toàn, đề xuất theo gói, ngày dự kiến hết; dòng đỏ = hết trước ngày giao; lọc nhà cung cấp, ép ngày giao; tick → **Tạo đơn đặt hàng từ dòng đã chọn**; bấm tên → biểu đồ SVG 4 tuần + 14 ngày; **Tính lại dự báo**); **Đơn đặt hàng** (nháp → **Gửi & in** → nhận → đủ; Hủy); **Nhà cung cấp**; **Giá & giao hàng**. Trang in `/admin/purchase-orders/{id}/print`: In / Lưu PDF, **Chép nội dung** gửi Zalo | `admin/purchasing.html`, `admin/po-print.html`, `js/pages/admin-purchasing.js`, `js/pages/admin-po-print.js` |
| S-36 | `/admin/cash` – **Sổ quỹ** | Admin | Lọc ngày, loại, danh mục, trạng thái; tổng theo danh mục; **Xuất CSV**; tab **Danh mục thu chi** | `admin/cash.html`, `js/pages/admin-cash.js` |
| S-37 | `/admin/staff` – **Nhân sự & chấm công** | Admin | Tab **Chấm công** (lọc ngày / người, tổng giờ, sửa / thêm có lý do); **Lịch làm tuần** (lưới người × ngày, kéo ca sang ô khác, + thêm ca, chép lịch tuần trước, cảnh báo đi muộn / vắng); **Năng suất** | `admin/staff.html`, `js/pages/admin-staff.js` |
| S-38 | `/admin/audit` – **Nhật ký thao tác** | Admin | Chỉ đọc; lọc theo thời gian, người, đối tượng, hành động; xem trước / sau | `admin/audit.html`, `js/pages/admin-audit.js` |
| S-39 | `/admin/pnl` – **Lãi / lỗ** | Admin | Nhãn **"Ước tính"** cố định; lọc khoảng ngày, nhóm ngày / tháng, nút nhanh; ô số (doanh thu thuần, giá vốn, lãi gộp + biên %, chi quỹ, cố định phân bổ, lợi nhuận, hòa vốn/ngày); biểu đồ cột SVG + đường hòa vốn; bảng theo kỳ, chi quỹ theo danh mục; thẻ **Chi phí cố định / tháng** | `admin/pnl.html`, `js/pages/admin-pnl.js` |
| S-40 | `/admin/loyalty` – **Tích điểm, voucher & chiến dịch** | Admin | Tab **Quà đổi điểm**, **Chương trình tem**, **Voucher** (30 ngày, "+ Tạo voucher"), **Phân khúc & chiến dịch** (điều kiện + "Xem trước số người"; nội dung có `{name}` `{voucher}` `{expires}`, voucher riêng, hẹn giờ, **Chạy ngay**; "Kết quả" + "Tải danh sách CSV") | `admin/loyalty.html`, `js/pages/admin-loyalty.js` |
| S-41 | `/admin/analytics` – **Phân tích & menu engineering** | Admin | Tab **Menu engineering** (biểu đồ phân tán SVG 4 ô, bảng, **Ghim món này**, **Tạo khuyến mãi**); **Giờ cao điểm** (bảng 7 × 24, số đơn / doanh thu); **Dự báo doanh thu** (28 ngày qua + 7 ngày tới, dải ± 1 độ lệch chuẩn); **So sánh kỳ** (tuần / tháng, ▲▼ %); **Theo bàn** (cờ đỏ "Ngồi lâu – doanh thu thấp") | `admin/analytics.html`, `js/pages/admin-analytics.js` |
| S-42 | `/admin/today` – **Hôm nay** (dashboard chủ quán) | Admin; Manager bản rút gọn | **Tính lại hôm nay** + giờ tính; 5 thẻ: doanh thu hôm qua (so cùng thứ tuần trước; quản lý thêm lãi gộp ước tính), lệch két ca gần nhất, kho cần chú ý, top 3 món, hội viên mới + voucher đã dùng; **Việc cần làm** (link: chi quỹ chờ duyệt, PO đến hạn nhận, lô hết hạn còn hàng, kiểm kê quá 7 ngày). Trưởng ca chỉ có thanh trên gọn + "← Màn hình quầy". Responsive ≤ 400 px, không cuộn ngang | `admin/today.html`, `js/pages/admin-today.js` |

### Thay đổi trên màn hình có sẵn

**Khách**

- **S-02 menu:**
  - Sau khi gắn SĐT hội viên: thẻ **"Lần trước bạn gọi: … — Gọi lại"**, dải **"Món yêu thích của bạn"**, nút **♡/♥** trên thẻ món (F-045).
  - Món ngoài lịch thực đơn không hiện; trang tự tải lại menu đúng lúc lịch đổi (`nextChangeAt`, F-040).
- **S-03 giỏ:**
  - "⏱ Dự kiến có món sau khoảng 8–12 phút" trước nút Gửi (F-025).
  - Ô hội viên hiện điểm, thẻ tem, số voucher (không hiện mã); đăng ký có ô "SĐT người giới thiệu (không bắt buộc)" (F-039, F-038).
- **S-05 theo dõi:**
  - "⏱ Món của bạn dự kiến xong sau khoảng …", cập nhật theo sự kiện đơn (F-025).
  - Nút **🧾 Chia bill theo người** → sheet tạo "phần của tôi", chạm **Của tôi** / **Bỏ** trên từng món; thẻ "Bàn đang chia bill" ghi tạm tính từng phần (F-026).
  - Ô hội viên: điểm, "còn N ly nữa được tặng", số voucher; thông báo "🎉 Bạn và người giới thiệu mỗi người nhận 1 voucher …" sau lượt thu đầu (F-039, F-038).

**Quầy**

- **Thanh trên:** mục mới **Kho & sơ chế** (S-17); trưởng ca có nhãn "Trưởng ca" và mục **Hôm nay** (S-42); **Đăng xuất** kết thúc chấm công (F-035).
- **S-10:** cột Mới có dòng "Hàng chờ: N món · khách mới chờ ~a–b phút" (F-025); thẻ bàn hiện "🧾 Chia N phần · đã thu X" (F-026).
- **S-14 Thu tiền bàn:**
  - Bàn có chia bill: danh sách phần → **Thu phần này** (hội viên / giảm tay riêng phần đó), ô chuyển phần trên từng dòng, **+ Thêm phần**, **Thu chung**, **In lại** phần đã thu (F-026).
  - Khung **"Hội viên · giảm giá · voucher"**: điểm, thẻ tem, nút voucher của hội viên, ô **Mã voucher** + "Áp mã", ô **Đổi thưởng**, dòng "Lượt này tích +N điểm, +M tem"; đăng ký nhanh có ô SĐT người giới thiệu; thông báo "Đã tặng 2 voucher giới thiệu: …" (F-039, F-038).
- **S-13 Bán mang đi:** tra SĐT hội viên → thẻ "Lần trước … gọi" + **Gọi lại** (F-045); cùng khung hội viên / voucher / đổi thưởng như S-14; món ngoài lịch có nhãn **"Ngoài lịch"**, vẫn bán được (F-040).
- **S-16 Gọi món tại bàn:** món ngoài lịch có nhãn "Ngoài lịch", vẫn bán được.
- **S-15 Ca & hoàn tiền:**
  - Thẻ **"Sổ quỹ trong ca"**: nút **Chi tiền** / **Thu khác**; bảng khoản có Duyệt / Từ chối / Gắn ảnh / 🧾 Ảnh; ô "Chi quỹ (đã duyệt)", "Thu khác"; tiền dự kiến trong két gồm sổ quỹ (F-033).
  - Thẻ **"Chấm công hôm nay"** (trưởng ca / quản lý): Sửa / Thêm chấm công (F-035).
  - Hoàn tiền: trưởng ca tự hoàn lượt thu trong ca đang mở (F-036). Phiếu chốt ca in kèm bảng thu chi quỹ.
- **S-12 trang in:** bill riêng từng phần chia bill `/pos/payments/{id}/receipt` (ghi "Phần: <tên>"); breakdown có thêm dòng "Voucher <mã>", dòng đổi thưởng và "Tích +N điểm / tem".

**Quản lý**

- **Thanh bên:**
  - Mục đầu **Hôm nay** (S-42).
  - Thêm **Phân tích & menu engineering** (S-41), **Lịch thực đơn & thời gian pha** (S-34), **Nhà cung cấp & đặt hàng** (S-35).
  - Nhóm **Marketing & Khách hàng** thêm **Tích điểm, voucher & chiến dịch** (S-40).
  - Nhóm mới **Tài chính & nhân sự**: Ca & hoàn tiền (S-32), Sổ quỹ (S-36), Lãi / lỗ (S-39), Nhân sự & chấm công (S-37), Nhật ký thao tác (S-38).
- **S-20 Tài khoản:** chọn vai trò "Trưởng ca".
- **S-21 Thực đơn:** Sửa món có ô **Thời gian pha chuẩn (giây)**; giờ bán danh mục được đồng bộ thành lịch "Giờ bán — …" ở S-34.
- **S-23 Kho nguyên liệu:** nút **Kho nâng cao** (loại Bán thành phẩm, "Dùng trong … giờ", hao hụt định mức %, theo dõi theo lô + hạn dùng), **Công thức**, **Lô** (danh sách lô, Hủy lô); nhãn "Hết hạn x"; mỗi dòng ghi "Giá vốn bình quân: …đ/đơn vị".
- **S-31 Nhập kho & kiểm kê:** phiếu nhập có ô đơn vị đóng gói, hạn sử dụng + mã lô cho nguyên liệu theo lô; tab mới **Giá vốn thực tế**, **Thất thoát**, **Đơn vị**.
- **S-26 Hội viên:** hồ sơ có sổ điểm, thẻ tem, điều chỉnh điểm có lý do, "Khách từ chối nhận tin chiến dịch (opt-out)".
- **S-33 Cài đặt:** thẻ **"Trưởng ca & sổ quỹ"** (ngưỡng giảm tay, mức duyệt chi của trưởng ca, ngưỡng chi cần duyệt, chỉ hoàn trong ca).

Điều hướng: quầy S-10 ⇄ S-16 ⇄ S-13 ⇄ S-17 ⇄ S-15 trên thanh POS; trưởng ca thêm S-42 (bản rút gọn). STAFF / MANAGER mở trang `/admin/*` khác → chuyển về `/pos?denied=admin`. Admin: S-42 là mục đầu thanh bên; `/admin` vẫn chuyển về S-25.

## Sửa / xóa món, xóa đơn, hủy bàn — S-14 (F-046, ADR-007, 18/10/2026)

File: `js/pages/pos-dashboard.js` (drawer **Thu tiền bàn**), không thêm màn hình mới. Quyền: `nghiệp-vụ/roles-permissions.md` mục 4.5 (dòng "Sửa / xóa món, xóa đơn, hủy bàn").

- **Đầu drawer:** cạnh **Gọi thêm món** / **Ghi chú bàn** có nút đỏ **Hủy bàn** — chỉ hiện khi bàn còn đơn và **chưa thu phần nào** (bàn đã thu một phần chia bill thì xóa từng món). Hộp xác nhận ghi số đơn chưa thu + tổng tiền, "không tạo lượt thu"; xong → toast "Đã hủy Bàn … · N đơn", drawer đóng, bàn biến khỏi danh sách "Bàn đang phục vụ".
- **Mỗi dòng món chưa thu** có nút **✎** (cả trong chế độ chia bill) → hộp thoại **Sửa món — <tên>**:
  - dòng thông tin: mã đơn, nhãn trạng thái, "đang gọi N × đơn giá. Muốn thêm món dùng "Gọi thêm món"";
  - ô **Số lượng mới (0 = xóa món)** (mặc định N − 1); nhập 0 (hoặc món chỉ có 1) → nút chính đổi từ **Lưu số lượng** thành **Xóa món**;
  - ô **Lý do (bắt buộc)** + chip lý do nhanh: *Khách đổi ý*, *Gọi nhầm món*, *Quán hết món*, *Pha sai món*, *Khách bỏ về*, *Mở nhầm bàn*;
  - đơn **đã pha xong**: nhóm chọn kho **Ghi hủy hàng (đã đổ bỏ / đã đưa khách)** (mặc định) / **Hoàn kho (chưa dùng, còn dùng lại được)**;
  - nhân viên sửa đơn **đã tiếp nhận / đã pha**: ô **tài khoản + mật khẩu trưởng ca / quản lý**; ô này cũng tự hiện khi server trả `403 ADMIN_APPROVAL_REQUIRED` (ví dụ đơn vừa được tiếp nhận);
  - xong → toast "Đã sửa … · đơn còn …" hoặc "Đã xóa hết món — đơn #… chuyển Đã hủy"; nếu bàn đã thu một phần tự đóng → thêm "Các món còn lại đã thu đủ — bàn đã đóng".
- **Mỗi đơn đã tiếp nhận / đã pha chưa thu** có nút **Xóa đơn** (cùng hộp thoại, không có ô số lượng; đơn chuyển "Đã hủy", giữ lại làm lịch sử). Đơn chờ tiếp nhận vẫn dùng nút **Hủy** cũ.
- **Cuối danh sách đơn:** mục thu gọn **Đã sửa / xóa món (n)** — mỗi dòng: giờ · −SL × món (số tiền) · #mã đơn · lý do — người làm, "duyệt: …" (nếu khác người làm) · cách xử lý kho (trả phần giữ / ghi hủy hàng / hoàn kho).
- UI states: thiếu lý do / số lượng sai (báo ngay trong hộp thoại, không gửi), cần duyệt (403 → hiện ô tài khoản), tài khoản duyệt sai, món đã thu / bàn đã đóng (409), máy khác vừa xóa dòng (404) — lỗi hiện trong hộp thoại, hộp không đóng.

## Hội viên tại bàn, Thẻ thành viên, quyền lợi trên bill — S-16, S-03 / S-05, S-12 (F-047, ADR-008, 18/10/2026)

Không thêm màn hình mới. Quyền: `nghiệp-vụ/roles-permissions.md` mục 4.5 (dòng "Thẻ thành viên", "Gọi món tại bàn").

**Quầy — S-16 Gọi món tại bàn** (`pos/table-order.html` có thêm `#member-box` dưới ô ghi chú bàn; `js/pages/pos-table-order.js`):

- Khung **"⭐ Hội viên"** khi đã chọn bàn: ô **SĐT hội viên** + nút **Tra cứu** (Enter cũng tra). Chưa gắn thì có dòng gợi ý "Nhập SĐT để khách tích điểm / dùng ưu đãi (tính lúc thu tiền)…".
- Tìm thấy → khung xanh: tên đầy đủ · SĐT · mức ưu đãi (hạng −x% hoặc "đơn đầu −10%") + nút **Gắn vào bàn** (bàn trống / nhóm mới: **Mở bàn & gắn** — mở bàn kèm ghi chú đang gõ rồi gắn).
- Chưa có → form đăng ký nhanh: **Họ tên khách**, **SĐT người giới thiệu (không bắt buộc)**, ô tick "Khách đồng ý cho quán lưu SĐT + tên để tích lũy ưu đãi", nút **Đăng ký & gắn vào bàn** / **Đăng ký & mở bàn & gắn**. Chưa tick → cảnh báo "Cần khách đồng ý trước khi đăng ký".
- Xong → toast "Đã gắn hội viên … vào Bàn …" (có người giới thiệu: "Đã đăng ký … (có người giới thiệu) và gắn vào …"). Phiên đã có hội viên → dòng "⭐ Tên · ưu đãi" + nút **Gỡ**; ô SĐT đổi gợi ý thành "Đổi sang SĐT khác".
- Ô SĐT tạo một lần, không bị thay khi trang vẽ lại theo realtime (không mất chữ đang gõ).

**Khách — S-03 giỏ, S-05 theo dõi đơn** (`js/member-box.js`):

- Khung hội viên đã gắn có link **Xem thẻ thành viên ›** (`#open-member-card`) → sheet **Thẻ thành viên**:
  - đầu thẻ: tên che, SĐT che ("09xx***543"), hạng, số điểm lớn; dòng ưu đãi "Giảm x% mỗi lần thanh toán" hoặc "Đơn đầu tiên −10% · sau đó −x%";
  - **🎫 Voucher của bạn (n)**: giá trị ("−15%" / "−20.000đ", "(tối đa …)"), nguồn · HSD dd/mm/yyyy · "đơn từ …"; ghi chú "Báo nhân viên khi thanh toán để dùng voucher." — không có mã;
  - **🎟 Thẻ tem**, **🎁 Đổi điểm lấy quà** ("✓ đủ điểm" / "còn thiếu N"), **🏅 Lịch sử điểm gần đây** (≤ 10 dòng).
- UI states: phiên đóng / chưa gắn hội viên / thiết bị không thuộc phiên → thông báo lỗi trong sheet; trên điện thoại 390 px không cuộn ngang.

**S-12 trang in:** bill thanh toán (`mode=final`, bill từng phần, bill mang đi) có hội viên in thêm khối **"THẺ THÀNH VIÊN (lúc in)"**: "Điểm hiện có: N điểm", từng dòng thẻ tem, "Voucher còn hạn (n):" với giá trị · HSD. Phiếu tạm tính và bill không có hội viên không có khối này (`js/pages/pos-receipt.js`).
