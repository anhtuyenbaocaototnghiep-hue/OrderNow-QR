# Thuật ngữ

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §5 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

| Thuật ngữ | Tên trong code | Định nghĩa |
| --- | --- | --- |
| Bàn | `Table` | Vị trí vật lý trong quán, có mã bàn và một mã QR cố định |
| Mã QR bàn | `QrToken` | Chuỗi ngẫu nhiên gắn với bàn, nhúng trong URL QR (`/t/{qrToken}`); **không** dùng `TableId` số đếm được trong URL để tránh đoán bàn |
| Phiên | `Session` | Một "lượt ngồi" trên một bàn, gom các đơn của một nhóm khách để tính tiền chung. Một bàn có thể có **nhiều phiên mở song song** (khách chọn "Cá nhân") |
| Gộp phiên | `JoinSession` | Khách mới vào cùng phiên đang mở, thấy chung giỏ/đơn |
| Token khách | `ClientToken` | Định danh trình duyệt khách (ngẫu nhiên, lưu cookie); gắn vào phiên |
| Đơn hàng | `Order` | Một lần gửi món; thuộc một phiên (dine-in) hoặc không thuộc phiên (take-away) |
| Dòng đơn | `OrderItem` | Món + số lượng + đơn giá tại thời điểm đặt + ghi chú |
| Món | `MenuItem` | Sản phẩm bán; có giá, ảnh, danh mục, cờ `IsAvailable` (còn bán) |
| Nguyên liệu | `Ingredient` | Vật tư trong kho: tên, đơn vị (ml, g, cái…), tồn kho |
| BOM / Định lượng | `BomItem` | Công thức: món X cần Y đơn vị nguyên liệu Z cho **một** suất |
| Tồn kho | `StockQty` | Số lượng nguyên liệu thực có |
| Giữ chỗ | `ReservedQty` | Số lượng đã được đơn `PENDING/PREPARING` giữ nhưng chưa trừ (chỉ có nếu chọn Q-001 = A) |
| Khả dụng | `Available` | `StockQty − ReservedQty` |
| Giao dịch kho | `InventoryTransaction` | Nhật ký mọi thay đổi tồn kho (trừ do đơn, điều chỉnh tay) |
| Thanh toán | `Payment` | Một lần thu tiền mặt do nhân viên ghi nhận: cho **cả phiên** (dine-in) hoặc cho **một đơn** (mang đi) |
| Gọi thanh toán | `RequestPayment` | Khách bấm trên điện thoại để báo quầy ra thu tiền; phiên chuyển `PAYMENT_REQUESTED` |
| Thu tiền / Đóng bàn | `SettleSession` | Nhân viên bấm "Đã thu tiền" trên POS: mọi đơn trong phiên → PAID, in bill, phiên → CLOSED |
| Tiếp nhận | `Accept` | Quầy xác nhận đã thấy đơn: `PENDING → PREPARING` (Q-004b) |
| Hoàn tất | `Complete` | Quầy xác nhận món đã làm xong/đã phục vụ; **thời điểm trừ kho** |
| Bán mang đi / Take-away | `TAKE_AWAY` | Đơn do quầy tạo ở mục riêng cho khách mang đi, không gắn bàn, thu tiền mặt ngay |
| Dashboard quầy / POS | — | Màn hình nhân viên trên máy tính/tablet tại quầy |
