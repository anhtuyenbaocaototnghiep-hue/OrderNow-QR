# ADR-032 — Bán tiếp khi mất mạng (máy quầy bán tạm, gửi bù; phiếu bán tay)

- **Trạng thái:** ACCEPTED (06/11/2026). Chủ dự án hỏi chuyên gia F&B xem bài còn thiếu gì; agent xếp "bán tiếp khi mất mạng" là việc thứ hai cần làm (quán đứng khi máy chủ / mạng sự cố), giải thích cách làm; chủ dự án: "tiến hành làm khi làm xong làm thành file skill.md".
- **Bối cảnh:** App chạy trên một laptop tại quán (ADR-016 D-61). Máy chủ treo / tắt, router hỏng, hoặc máy quầy rớt Wi-Fi thì màn quầy chỉ hiện "Mất kết nối" — không thu tiền được. Mất Internet (nhà mạng) không ảnh hưởng vì app chạy trong mạng nội bộ. CSDL có ràng buộc tồn kho không âm (`CK_Ingredients_Stock`) và Σ lô = tồn kho; thủ tục gửi đơn từ chối món đang tắt / kho thiếu. Mạng nội bộ chạy http nên trình duyệt không cho dùng service worker / `crypto.randomUUID` (chỉ có trên https / localhost).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-140 | **Bán tạm ở màn Bán mang đi.** Máy quầy mất kết nối (báo giá / thu tiền lỗi mạng, hoặc kết nối realtime mất quá 4 giây, hoặc trình duyệt báo offline) → chế độ **bán tạm**: dải vàng giải thích, giá **niêm yết** từ thực đơn đã tải (không khuyến mãi / hội viên giảm giá / giảm tay / voucher — cần máy chủ), tiền mặt hoặc chuyển khoản, ô SĐT hội viên (cộng điểm sau). Thu tiền → lưu đơn vào bộ nhớ trình duyệt của máy này (mã tạm **T-0001…**), **in bill ngay** trên máy (không tải trang nào từ máy chủ). Khách ngồi bàn cũng thu ở đây (ghi chú số bàn). Đang bán tạm: mỗi 8 giây hỏi máy chủ; có lại → tự thoát chế độ và gửi bù. |
| D-141 | **Mã lượt thu (ClientRef)** cho MỌI lượt thu mang đi, kể cả lúc có mạng: máy quầy tạo (UUID v4 bằng `crypto.getRandomValues`), giữ nguyên khi thu lại cùng giỏ, đổi khi giỏ đổi. Máy chủ lưu `Orders.ClientRef` (duy nhất) → gửi lại / gửi bù cùng mã trả đúng đơn đã ghi (`duplicate` / `DUPLICATE`), **không bao giờ tính hai lần** — kể cả trường hợp lệnh thu đã tới máy chủ nhưng mạng rớt trước khi có trả lời. |
| D-142 | **Gửi bù** (`POST /api/offline-sales`): ghi đơn mang đi **đúng giờ bán thật** (đơn, lượt thu, giờ hoàn tất), **đúng giá đã thu**, vào thẳng **Đã xong** (không hiện ở cột Đang pha), người bán = người đứng máy lúc bán, người gửi = phiên hiện tại. Không từ chối vì món đang tắt / tùy chọn đang tắt (đã giao cho khách); món đã **xóa** khỏi thực đơn → `409 OFFLINE_ITEM_MISSING` (giữ lại trên máy, trưởng ca nhập tay với món thay thế). Đơn bán tạm gửi bù trong **72 giờ**. Đơn gửi bù không tính vào thời gian pha trung bình (ETA). |
| D-143 | **Kho khi gửi bù:** chỉ giữ / trừ phần nguyên liệu **còn có** — tồn kho không bao giờ âm, lô vẫn khớp; phần thiếu ghi "Chưa trừ: … — kiểm kho lại" (việc cần kiểm `STOCK_SHORT`). Giá đã thu khác bảng giá hiện tại → ghi đúng số đã thu + `PRICE_DIFF`. |
| D-144 | **Ca:** ghi vào ca đang mở. Bán trong ca đã đóng (đóng ca khi máy khác còn đơn tạm) → ghi vào ca hiện tại + `SHIFT_LATE` (két ca trước lệch đúng số đó). Chưa có ca mở → `409 NO_OPEN_SHIFT`, máy quầy giữ lại, gửi sau. Đóng ca trên máy còn đơn tạm chưa gửi → hộp nhắc **Gửi ngay / Vẫn đóng ca / Hủy**. Chuyển khoản lúc mất mạng → `TRANSFER_CHECK` (đối chiếu app ngân hàng). SĐT hội viên có thật → gắn hội viên (cộng điểm, không giảm giá); không có → `MEMBER_NOT_FOUND`. |
| D-145 | **Minh bạch:** bảng `OfflineSales` (ai bán, giờ bán, ai gửi, máy nào, ca lúc bán / ca được ghi, việc cần kiểm) **không xóa được**; gửi bù ghi nhật ký thao tác `order.offline-sale`. Màn **Ca & hoàn tiền** có thẻ **Đơn bán lúc mất mạng** (mã đơn + mã tạm, giờ bán, người bán, tiền, cách trả, cần kiểm). Có `PRICE_DIFF` / `STOCK_SHORT` / `SHIFT_LATE` → **một cảnh báo mỗi ca** (`OFFLINE_SALE`) cho chủ quán. |
| D-146 | **Phiếu bán tay:** nút **In phiếu bán tay trống** (A4) để quán in sẵn dùng khi máy quầy cũng hỏng / mất điện. Trưởng ca / quản lý bật **Nhập đơn từ phiếu bán tay** ở màn Bán mang đi: chọn giờ bán ghi trên phiếu (trong **7 ngày**), chọn món → ghi đơn nguồn `PAPER` (giá niêm yết, vào ca đang mở). Nhân viên không nhập được (`403 PAPER_SALE_FORBIDDEN`). |

## Phương án đã cân nhắc

- **Service worker / PWA để mở được trang khi máy chủ tắt:** trình duyệt chỉ cho trên https hoặc localhost; máy quầy trong mạng nội bộ chạy http. Chấp nhận giới hạn: trang **đang mở** vẫn bán được; tải lại trang lúc máy chủ tắt thì không mở được (đơn đã lưu không mất). Khi lên VPS có https (ADR-016 dự phòng) có thể thêm.
- **Cho tồn kho âm khi gửi bù:** vi phạm ràng buộc an toàn BR-001 và lệch lô. Chọn: chỉ trừ phần còn có + báo kiểm kho.
- **Tính khuyến mãi / hội viên giảm giá lúc mất mạng trên máy quầy:** phải chép luật giá về trình duyệt, dễ lệch với máy chủ. Chọn giá niêm yết — khách không thiệt so với giá thường, máy chủ tính lại khớp.
- **Từ chối đơn gửi bù khi món đã tắt / kho thiếu:** đơn đã giao, tiền đã thu — từ chối chỉ làm mất doanh thu khỏi sổ.
- **Gửi bù vào ca lúc bán dù đã đóng:** phiếu chốt ca đã in và tiền đã đếm; sửa ca cũ làm sai sổ. Chọn ghi vào ca hiện tại + báo.

## Hệ quả

- Migration `0051_ban_khi_mat_mang.sql` (chỉ thêm: `Orders.ClientRef` + chỉ mục duy nhất, `Orders.SaleSource`, bảng `OfflineSales`, cảnh báo `OFFLINE_SALE`); `sp_SubmitOrder` thêm `@ClientRef`, `@SaleSource`, `@SoldAt`, `@StockShort OUTPUT` (mặc định tắt — luồng cũ không đổi); `sp_CompleteOrder` thêm `@CompletedAt`.
- API: `POST /api/offline-sales`, `GET /api/offline-sales?shiftId=`; `POST /api/orders/takeaway` nhận `clientRef` (gửi lại → `200` + `duplicate: true`).
