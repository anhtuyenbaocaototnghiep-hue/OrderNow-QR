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
| S-10 | `/pos` – Dashboard quầy | Staff/Admin | Bố cục ADR-018: vùng **Cần xử lý ngay** (chưa mở ca, mất kết nối, đơn trễ, **Gọi thanh toán** → S-14, gọi nhân viên, đánh giá thấp); 2 cột **Mới / Đang pha** (phiếu chữ to, thời gian chờ đổi màu) + dải **Đã xong hôm nay** (mỗi đơn một dòng); **lưới bàn** (mọi bàn: Trống / Đang phục vụ / Có đơn chờ tiếp nhận / Gọi thanh toán; nút Gọi món, Thu tiền, Ghi chú, Chuyển bàn) — màn < 1200 px mở bằng nút "Bàn"; âm thanh; trạng thái kết nối | mất kết nối, banner đơn trễ |
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
| S-12 | `/pos/sessions/{id}/receipt?mode=final\|provisional`, `/pos/orders/{id}/receipt` | `pos/receipt.html`, `js/pages/pos-receipt.js`, `css/print.css` |
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

<a id="ui-states"></a>

## Trạng thái giao diện (UI states) — bước 09 (TASK-057, 20/10/2026)

Bảng dưới ghi trạng thái **đang có trong code** (`ứng-dụng/giao-diện/public/js/pages/*.js`, `js/api.js`, `js/auth.js`, `js/pos-shell.js`, `js/admin-shell.js`), không phải thiết kế mới. Mã `SCR-xx` = `S-xx` (quy ước [TASK-057](../công-việc/TASK-057.md)); route và actor: [sitemap.md](sitemap.md); thành phần (`.alert`, `.toast`, `.banner`, `.skeleton`…): [design-system.md](design-system.md).

**Hành vi chung (áp cho mọi màn, không nhắc lại trong bảng):**

- **Lỗi mạng khi gọi API:** `js/api.js` ném lỗi `NETWORK` với chữ "Mất kết nối mạng, vui lòng thử lại"; màn hình hiện chữ này theo cách hiện lỗi của màn đó.
- **Lỗi API:** hiện đúng `message` tiếng Việt server trả về (`errorMessage(err)`; mặc định "Có lỗi xảy ra, vui lòng thử lại"). Lỗi theo trường (`400 VALIDATION_ERROR`) được tô đỏ ô sai bằng `showFieldErrors`.
- **Chưa đăng nhập (trang quầy / quản lý):** không có token → `location.replace('/pos/login?next=<trang hiện tại>')`. API trả 401 → xóa token, chuyển `/pos/login?next=…&reason=expired`; trả `ACCOUNT_LOCKED` → `&reason=locked`. Socket bị từ chối lúc handshake → `/pos/login?reason=expired`.
- **Không đủ quyền:** STAFF / Trưởng ca mở trang `/admin/*` (trừ `/admin/today` với Trưởng ca) → chuyển `/pos?denied=admin`, thanh quầy hiện toast cảnh báo "Chức năng quản lý chỉ dành cho tài khoản Quản lý". API trả 403 → hiện `message` của server (ví dụ "Tài khoản của bạn không có quyền thực hiện thao tác này"). Nút / tab vượt quyền bị ẩn (chỉ là trải nghiệm — quyền thật kiểm ở server).
- **Khách — thiết bị không thuộc phiên / phiên không còn:** API trả 403 hoặc 404 → về `SCR-01` (`goEntry`) để quét lại; phiên đã đóng → về `SCR-01` kèm thông báo "Phiên trước đã thanh toán…".
- **Mất realtime:** chỉ các màn có socket (SCR-02, SCR-05, SCR-10, SCR-13, SCR-15, SCR-16, SCR-17) có trạng thái offline; khi kết nối lại thì tải lại ảnh chụp dữ liệu (REQ-017). Trang quản lý không dùng socket.
- **Thành công:** toast xanh (`toast(…, 'success')`) hoặc chuyển màn; lỗi trong hộp thoại hiện ngay trong hộp, hộp không đóng.

### Khách (điện thoại)

| Mã | Loading | Empty | Error | Success | Denied | Offline |
| --- | --- | --- | --- | --- | --- | --- |
| SCR-01 `/t/{qrToken}` | Vòng quay + "Đang mở thực đơn…" / "Đang tạo phiên mới cho bạn…" | — | QR sai → "⚠️ Mã bàn không hợp lệ" + hướng dẫn quét lại; lỗi khác → "📶 Chưa mở được thực đơn" + nút "Thử lại"; nhóm vừa đóng → toast "Nhóm này không còn trên bàn, vui lòng chọn lại" | Bàn trống → vào thẳng SCR-02; bàn có người → hộp chọn "Gộp chung nhóm" / "Tạo đơn cá nhân" | — (khách không cần đăng nhập) | Lỗi mạng hiện như Error |
| SCR-02 menu | 3 khối `.skeleton` | "Quán chưa có món nào trên thực đơn."; món hết → thẻ mờ (`.soldout`), nút "+" khóa | Khối rỗng có chữ lỗi + nút "Thử lại" | Thêm món: số trên nút giỏ nổi tăng | 403 / 404 phiên → về SCR-01; quán tạm ngưng → banner `#store-closed` (`role="status"`), nút gửi khóa | Banner đỏ "Mất kết nối — đang kết nối lại…"; nối lại → tải lại menu |
| SCR-03 giỏ (sheet) | Nút "Gửi đơn" có vòng quay, bị khóa khi đang gửi | "Giỏ hàng đang trống." | `.alert.danger` trong sheet; `OUT_OF_STOCK` / `ITEM_UNAVAILABLE` → bỏ món khỏi giỏ, đánh dấu hết món, báo tên món; `STORE_CLOSED` → hiện banner tạm ngưng | Chuyển SCR-05 + toast "Đặt món thành công! Quầy đã nhận đơn của bạn." | `SESSION_CLOSED` / 403 → về SCR-01 ("Vui lòng quét lại mã QR tại bàn.") | Như SCR-02 |
| SCR-04 gọi thanh toán (modal) | Nút xác nhận có vòng quay | Phiên chưa có đơn → nút "Gọi thanh toán" ẩn (BR-018) | Lỗi hiện trong modal / toast; `SESSION_CLOSED` → tải lại SCR-05 | Toast "Đã báo quầy. Nhân viên sẽ đến bàn thu tiền." + trạng thái "Đã gọi · đang chờ nhân viên" + đồng hồ | Như SCR-05 | Như SCR-05 |
| SCR-05 theo dõi đơn | 2 khối `.skeleton` | "Bạn chưa gọi món nào." + nút "Xem thực đơn" | Khối rỗng có chữ lỗi + nút "Thử lại" | Pop-up "Đã xong"; sau thu tiền: "Cảm ơn quý khách!" + "Gọi món mới"; gọi nhân viên → toast "Đã gọi nhân viên, vui lòng chờ trong giây lát."; tặng voucher → toast 🎉 | 403 / 404 → về SCR-01; gọi nhân viên < 60 giây → báo chờ (`429`) | Banner "Mất kết nối — đang kết nối lại…"; nối lại → tải lại phiên |
| Sheet Thẻ thành viên (SCR-03 / SCR-05) | "Đang tải…" | Phiên chưa gắn hội viên → thông báo trong sheet (`404 NO_MEMBER`) | Thông báo lỗi trong sheet | Thẻ: điểm, voucher (không mã), tem, quà, lịch sử | Thiết bị không thuộc phiên → 403, thông báo trong sheet; phiên đóng → 409 | — |

### Quầy (POS)

| Mã | Loading | Empty | Error | Success | Denied | Offline |
| --- | --- | --- | --- | --- | --- | --- |
| SCR-09 `/pos/login` | Nút "Đăng nhập" có vòng quay | Bỏ trống ô → "Vui lòng nhập tên đăng nhập và mật khẩu." | `.alert.danger` với lỗi server ("Sai tên đăng nhập hoặc mật khẩu", "Tài khoản đã bị khóa", quá 5 lần sai → "Bạn đăng nhập sai quá nhiều lần, vui lòng thử lại sau 1 phút") | Chuyển tới `next` hoặc `/pos`; đã có token → chuyển ngay | `?reason=expired` → "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."; `?reason=locked` → "Tài khoản đã bị khóa." | Lỗi mạng hiện trong `.alert.danger` |
| SCR-10 `/pos` | Khung bàn "Đang tải…"; chấm kết nối "Đang kết nối…" | "Chưa có đơn mới" / "Không có đơn đang pha" / "Chưa có đơn xong hôm nay"; lưới bàn hiện mọi bàn (bàn không khách: thẻ "Trống" + Gọi món), chưa có bàn nào: "Chưa có bàn nào — thêm bàn ở Quản lý › Bàn & mã QR."; hàng chờ "Không có món đang chờ"; vùng "Cần xử lý ngay" ẩn khi không có việc | Toast đỏ với lỗi server (ví dụ 409 "Đơn hàng này đã được nhân viên khác xử lý") | Toast xanh; âm "ting" / chuông / `bell` theo sự kiện | Chưa đăng nhập → SCR-09; `?denied=admin` → toast cảnh báo; chưa mở ca → banner "Chưa mở ca — chưa nhận, xử lý đơn và thu tiền được (F-055)." + nút "Mở ca"; nút Tiếp nhận / Hoàn tất / Hủy trên phiếu bị khóa | Banner đỏ "Mất kết nối — đơn mới sẽ được tải lại khi có mạng" + chấm "Mất kết nối"; nối lại → tải lại + banner vàng "Có đơn hàng bị trễ trong lúc mất kết nối: …" + nút "Đã xem" |
| SCR-11 chi tiết đơn (drawer) | — | — | Lỗi trong drawer / toast (409 `ALREADY_PROCESSED`, `OUT_OF_STOCK`) | Drawer đóng, thẻ đơn chuyển cột | Như SCR-10 | Như SCR-10 |
| SCR-14 thu tiền bàn (drawer) | "Đang tải…" trong drawer | "Phiên chưa có đơn nào. Có thể "Đóng bàn trống"." | `.alert.danger` trong drawer (409 `HAS_PENDING_ORDERS`, `AMOUNT_CHANGED`, `ALREADY_SETTLED`, `NO_OPEN_SHIFT`); tiền thiếu → dòng "Còn thiếu" đỏ | Toast "Đã thu…" / "Đã thu phần …: … · tiền thừa …"; in bill; "Đã đóng Bàn …"; "Đã hủy Bàn … · N đơn" | Giảm tay vượt ngưỡng / hoàn tiền / sửa món đã tiếp nhận → `403 ADMIN_APPROVAL_REQUIRED` → hiện ô tài khoản trưởng ca / quản lý; sai → `ADMIN_APPROVAL_INVALID` | Như SCR-10 |
| SCR-13 `/pos/takeaway` | "Đang tải thực đơn…" | "Chưa có món."; giỏ trống → nút thu tiền khóa; "Chưa có đơn mang đi hôm nay." | `.alert.danger` ở lưới món / dưới nút thu tiền; tiền khách đưa thiếu → khung đỏ "Còn thiếu …" | Toast "Đơn #…: thu …, tiền thừa …" + in bill; gọi lại đơn → "Đã nạp đơn lần trước vào giỏ" | Chưa mở ca → nút thu tiền khóa (title "Chưa mở ca"); duyệt giảm tay như SCR-14 | Banner "Mất kết nối" |
| SCR-16 `/pos/table-order` | "Đang tải…" (sơ đồ bàn), "Đang tải thực đơn…" | "Chưa có bàn nào. Quản lý thêm bàn ở trang "Bàn & mã QR"."; "Chưa có món."; "Chưa có đơn nào." | `.alert.danger` ở sơ đồ bàn / lưới món / dưới nút gửi (`#send-error`); đăng ký chưa tick đồng ý → "Cần khách đồng ý trước khi đăng ký" | Toast "Đã mở Bàn …", "Đã lưu ghi chú …", "Đã gắn hội viên … vào …" | Như SCR-10 | Banner "Mất kết nối" |
| SCR-15 `/pos/shift` | "Đang tải…" (vùng `aria-live`) | "Chưa có lượt thu." | `.alert.danger` thay nội dung; lỗi hoàn tiền / đóng ca hiện trong hộp thoại (`CASH_PENDING`, `REFUND_WINDOW_EXPIRED`…) | Toast "Đã đóng ca #…", "Đã hoàn …" | Thẻ "Chấm công hôm nay" chỉ hiện với trưởng ca / quản lý; duyệt chi quỹ vượt quyền → ô tài khoản người duyệt | Banner "Mất kết nối" |
| SCR-17 `/pos/stock` | "Đang tải…" | "Chưa có bán thành phẩm có công thức…"; "Chưa có mẻ nào hôm nay."; "Chưa có phiếu hủy hôm nay."; "Không có lô nào sắp hết hạn. 👍"; "Không có đơn đặt hàng nào đang chờ giao…" | `.alert.danger` (`PREP_SHORT`, `OVER_RECEIPT`…) | Toast "Đã sơ chế …", "Đã hủy …", "Đã hủy lô …" | Tab Kiểm kê và nút Điều chỉnh ẩn với STAFF (API trả 403) | Banner "Mất kết nối" |

### In

| Mã | Loading | Empty | Error | Success | Denied | Offline |
| --- | --- | --- | --- | --- | --- | --- |
| SCR-12 trang in hóa đơn | "Đang tải hóa đơn…" (vùng `aria-live`) | — | Chữ lỗi thay hóa đơn; trang cha (in qua iframe) nhận `receipt-error` và báo toast | Hóa đơn hiển thị; `?autoprint=1` tự mở hộp in; tiêu đề tab "Hóa đơn — …" / "Tạm tính — …" | Chưa đăng nhập / token hết hạn → SCR-09; bill `final` khi phiên chưa thu → lỗi 409 (BR-014) | — |
| SCR-22 in QR `/admin/tables/print`, SCR-35 in PO `/admin/purchase-orders/{id}/print` | "Đang tải…" | "Không có bàn đang hoạt động." (in QR) | `.alert.danger` | Trang sẵn để in / lưu PDF | Như trang quản lý | — |

### Quản lý

Mọi trang `/admin/*` có chung khung (`mountAdminShell`): HTML có sẵn "Đang tải…"; lỗi tải → `.alert.danger` thay nội dung; lưu / xóa thành công → toast xanh ("Đã lưu", "Đã xóa …", "Đã xóa … (vẫn giữ trong lịch sử, báo cáo cũ)"); xóa bị chặn → toast đỏ nêu lý do (ADR-004); STAFF / Trưởng ca → `/pos?denied=admin`; không có trạng thái offline (không dùng socket).

| Mã | Empty (chữ trong code) | Ghi chú riêng |
| --- | --- | --- |
| SCR-42 `/admin/today` | "Chưa có ca nào đóng."; "Không có nguyên liệu sắp hết / sắp hết hạn."; "Chưa có đơn." | Trưởng ca: thanh trên gọn, **server** bỏ giá vốn / lãi; STAFF → `/pos?denied=admin`; "Tính lại hôm nay" → toast "Đã tính lại số liệu hôm nay" |
| SCR-25 `/admin/reports` | "Chưa có dữ liệu."; "Không có nguyên liệu nào dưới ngưỡng."; "Chưa có lượt thu tiền."; "Không có đơn nào trong khoảng này."; "Chưa có lượt dùng khuyến mãi."; "Không có giảm giá tay." | Khoảng ngày sai → nút "Xem" bị khóa; server trả `400 INVALID_RANGE` |
| SCR-41 `/admin/analytics` | Món ít dữ liệu ghi "Chưa đủ dữ liệu" | — |
| SCR-21 `/admin/menu` | "Chưa có món nào. Bấm "+ Thêm món"." | Bật / tắt "còn bán" phát realtime tới khách |
| SCR-24 `/admin/menu/{id}/bom` | "Chưa có nguyên liệu nào. Hãy tạo ở trang Kho nguyên liệu." | Định lượng ≤ 0 → 400, lỗi hiện ở `#bom-msg`, BOM cũ giữ nguyên |
| SCR-30 `/admin/modifiers` | "Chưa có nhóm tùy chọn…" | — |
| SCR-34 `/admin/menu-schedules` | "Chưa có lịch…" | — |
| SCR-23 `/admin/ingredients` | "Chưa có nguyên liệu nào."; "Chưa có giao dịch." | Cảnh báo sắp hết |
| SCR-31 `/admin/stock` | "Chưa có phiếu nhập trong khoảng này."; "Không có chênh lệch kiểm kê trong khoảng này."; "Chưa có tiêu thụ / kiểm kê trong khoảng này." | — |
| SCR-35 `/admin/purchasing` | "Chưa có đơn đặt hàng…"; "Chưa có nhà cung cấp." | — |
| SCR-22 `/admin/tables` | "Chưa có bàn nào. Bấm "+ Thêm bàn"." | Tạo lại QR → toast "Đã tạo QR mới cho …" |
| SCR-20 `/admin/users` | — | Trùng tên → lỗi trong form (`409 USERNAME_TAKEN`); không có nút xóa / khóa chính mình |
| SCR-26 `/admin/members` | "Chưa có hội viên nào khớp."; "Chưa có giao dịch."; "Chưa có thẻ tem."; "Chưa có giao dịch điểm." | Danh sách che SĐT |
| SCR-40 `/admin/loyalty` | "Chưa có quà đổi điểm."; "Chưa có chương trình tem."; "Chưa có voucher."; "Chưa có phân khúc."; "Chưa có chiến dịch." | Zalo OA chưa có token → `400 CHANNEL_NOT_CONFIGURED` |
| SCR-27 `/admin/combos` | "Chưa có combo…" | — |
| SCR-28 `/admin/promotions` | "Chưa có khuyến mãi…" | — |
| SCR-29 `/admin/suggestions` | "Chưa có dữ liệu bán." | — |
| SCR-32 `/admin/shifts` | "Không có ca nào trong khoảng này."; "Không có lần hoàn tiền nào." | — |
| SCR-36 `/admin/cash` | "Chưa có khoản nào đã duyệt." | — |
| SCR-39 `/admin/pnl` | "Không có khoản chi quỹ thuộc danh mục chi phí." | Nhãn "Ước tính" cố định |
| SCR-37 `/admin/staff` | "Chưa có dữ liệu."; "Chưa có dữ liệu trong kỳ." | Lỗi sửa chấm công hiện trong hộp thoại (thiếu lý do 400, chồng giờ 409) |
| SCR-38 `/admin/audit` | "Không có thao tác nào khớp bộ lọc." | Chỉ đọc |
| SCR-33 `/admin/settings` | — | Lưu → toast "Đã lưu cài đặt" |

### Trang chung

| Mã | Trạng thái |
| --- | --- |
| SCR-43 `/` (mới) | Trang tĩnh, không gọi API — không có loading / lỗi |
| SCR-44 trang 404 (mới) | "🔍 Không tìm thấy trang" + nút "Về trang chủ"; API lạ trả JSON `{ code: 'NOT_FOUND' }`, không trả trang này |

**Chưa có trong code (ghi nhận, không sửa trong TASK-057):** `.alert` không có `role="alert"` và `#msg` ở SCR-09 không phải vùng live, nên lỗi có thể không được trình đọc màn hình thông báo (NFR-A11Y-08 trong [nfr.md](../sản-phẩm/nfr.md)); hộp thoại chưa giữ focus bên trong.

## ADR-018 — Bố cục màn quầy "Đơn hàng" (TASK-072, 23/10/2026)

- **Thanh trên quầy (mọi trang quầy):** trái tên quán + điều hướng có biểu tượng; phải cụm trạng thái (ca, QR, kết nối, âm thanh) rồi người dùng + Đăng xuất. Đủ chỗ thì một hàng (≈ 1700 px trở lên); không đủ thì điều hướng xuống hàng hai trải hết chiều ngang (đo bằng trình duyệt, không đoán theo cỡ màn).
- **S-10 từ trên xuống:** vùng **Cần xử lý ngay** (các thẻ cùng kiểu, nằm cạnh nhau khi đủ chỗ, chỉ hiện khi có việc) → **Mới** | **Đang pha** (cao hết màn, mỗi cột tự cuộn) → dải **Đã xong hôm nay**; bên phải **lưới bàn**.
- **Phiếu đơn:** tên bàn to; mã đơn + giờ đặt + "Nhân viên nhập" ở dòng nhỏ; đồng hồ chờ từ 8 phút nền vàng, từ 15 phút nền đỏ; nút Tiếp nhận / Tiếp nhận & Hoàn tất / Hủy / Hoàn tất cao 44 px. Phiếu đã xong một dòng: bàn · mã · món · tổng · đã / chưa thu · giờ xong.
- **Lưới bàn:** đầu khung "Bàn" + Gọi món + Mang đi + dòng đếm (có khách, gọi thanh toán, có đơn chờ, trống). Thẻ nhóm: tên bàn (nhiều nhóm: "Nhóm n"), trạng thái chấm màu + chữ, tạm tính, số đơn + giờ mở, chia bill / hội viên / chuyển bàn / ghi chú; nút biểu tượng Ghi chú, Chuyển bàn; nút Gọi món + Thu tiền (chưa có đơn: Đóng bàn). Thẻ bàn trống: nét đứt, "Trống", Gọi món.
- **Co giãn:** ≥ 1200 px ba vùng cạnh nhau; 760–1199 px lưới bàn là ngăn trượt bên phải (nút "Bàn · n có khách" + số gọi thanh toán; Esc / Đóng / bấm nền mờ để đóng, focus vào ngăn và trả về nút); < 760 px một cột, trang cuộn bình thường.

## ADR-019 — Chuyển khoản, thu chung nhiều bàn, tách hóa đơn (TASK-073, 24/10/2026)

- **S-14 Ngăn Thu tiền bàn:**
  - Hai nút **Tiền mặt** / **Chuyển khoản** trên ô "Tiền khách đưa". Chuyển khoản → ẩn ô tiền khách đưa và nút tiền nhanh, hiện ghi chú "xem tiền đã về rồi bấm…", nút thu thành **"Đã nhận chuyển khoản & In bill"** (F-056). Áp cả khi thu từng phần chia bill.
  - Nút **"Tách hóa đơn"** → hộp thoại ô tích các món chưa thu + tên hóa đơn → **"Tách ra hóa đơn riêng"**; bàn chưa chia thì món còn lại thành "Phần còn lại" (F-058).
  - Nút **"Thu chung với bàn khác"** → hộp thoại ô tích các bàn đang phục vụ (bàn đang chia bill bị khóa) → ngăn ghi "Thu chung: Bàn A + Bàn B", đơn của bàn khác xếp theo bàn, tổng chung, nút **"Bỏ thu chung"**; In tạm tính in tổng chung (F-057).
- **S-13 Bán mang đi:** cùng hai nút Tiền mặt / Chuyển khoản.
- **S-15 Ca & hoàn tiền:** KPI "Tiền mặt đã thu", "Chuyển khoản (n lượt) — không vào két", "Đã hoàn tiền mặt" (+ "Đã hoàn chuyển khoản" khi có); bảng lượt thu có cột "Cách trả"; hộp hoàn tiền của lượt chuyển khoản ghi "chuyển trả lại cho khách, không lấy tiền trong két".
- **S-12 Bill:** dòng "Thanh toán: Chuyển khoản" (không in tiền khách đưa / tiền thừa); bill thu chung ghi các bàn, món nhóm theo bàn.
- **S-21 Báo cáo:** KPI "Tiền mặt" / "Chuyển khoản" (doanh thu sau hoàn, số lượt); danh sách lượt thu có cột "Cách trả".
- **S-05 Theo dõi đơn (khách):** bàn được thu chung → tự chuyển sang trang theo dõi của bàn đã thu (màn "Đã thanh toán", đánh giá món).
