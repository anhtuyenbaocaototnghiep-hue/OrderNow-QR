# Quyết định (ADR)

Mỗi câu hỏi Q-xxx khi được chốt sẽ thành một ADR ngắn. Sau đó cập nhật trạng thái `PROPOSED` / `NEEDS_CONFIRMATION` → `CONFIRMED` ở các docs bị ảnh hưởng và ghi "theo ADR-00x" tại chỗ sửa. Agent **không** tự viết ADR cho câu hỏi chưa được nhóm chốt (rules: "không tự chọn cách hiểu").

| ADR | Câu hỏi | Nội dung | Trạng thái |
| --- | --- | --- | --- |
| [ADR-000](ADR-000-thanh-toan-tien-mat.md) | Q-003, Q-004, Q-009 | Chỉ tiền mặt; khách Gọi thanh toán, nhân viên thu tại bàn; mục Bán mang đi riêng (D-1/D-2/D-3) | ACCEPTED (13/10/2026) |
| [ADR-001](ADR-001-giu-kho-khi-gui-don.md) | Q-001 | Giữ kho khi gửi đơn, trừ khi hoàn tất (phương án A) + chụp lượng giữ theo đơn | ACCEPTED (14/10/2026) |
| [ADR-002](ADR-002-stack-html-node-sqlserver.md) | Q-002 | Stack: HTML/CSS/JS thuần + Node.js/Express + SQL Server + Socket.io (D-4) | ACCEPTED (14/10/2026) |
| [ADR-003](ADR-003-cac-de-xuat-con-lai.md) | Q-004b, Q-005, Q-006, Q-007, Q-010…Q-018 | Áp dụng các phương án đề xuất khi triển khai hoàn chỉnh | ACCEPTED (14/10/2026) |
| [ADR-004](ADR-004-xoa-du-lieu-quan-ly.md) | (phản hồi chủ dự án) | Có nút Xóa trong Quản lý: xóa hẳn nếu chưa có lịch sử, ngược lại xóa mềm; chặn khi đang dùng | ACCEPTED (14/10/2026) |
| [ADR-005](ADR-005-mo-rong-giai-doan-2.md) | (skill `extend-features` của chủ dự án) | Mở rộng giai đoạn 2: mặc định D-5…D-16 (hội viên, combo, khuyến mãi, gợi ý, tùy chọn, ca, giảm tay, hoàn tiền…) + thích nghi theo repo | ACCEPTED (16/10/2026) |
| [ADR-006](ADR-006-mo-rong-giai-doan-4-8.md) | (skill `advanced-features` của chủ dự án) | Mở rộng giai đoạn 4–8: mặc định D-17…D-32 (chia bill, kho nâng cao, trưởng ca, sổ quỹ, chấm công, lãi/lỗ, điểm/tem/voucher, chiến dịch, phân tích, dashboard) + thích nghi theo repo; lệch docs ghi Q-022 | ACCEPTED (17/10/2026), triển khai xong 18/10/2026 |
| [ADR-007](ADR-007-sua-xoa-mon-huy-ban.md) | (yêu cầu chủ dự án 18/10/2026) | Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn: phân cấp quyền + lý do bắt buộc (D-33), ghi hủy hàng / hoàn kho món đã pha (D-34), "xóa bàn" = hủy lượt phục vụ (D-35). Mở rộng ADR-003 Q-010 | ACCEPTED (18/10/2026), triển khai xong 18/10/2026 |
| [ADR-008](ADR-008-hoi-vien-tai-ban-the-thanh-vien.md) | (yêu cầu chủ dự án 18/10/2026) | Gắn / đăng ký hội viên ở Gọi món tại bàn (D-36); "Thẻ thành viên" trên điện thoại khách — chỉ khi SĐT đang gắn vào phiên, không mã voucher (D-37); bill thanh toán in điểm, tem, voucher còn hạn (D-38) | ACCEPTED (18/10/2026), triển khai xong 18/10/2026 |
| [ADR-009](ADR-009-sua-huy-phieu-kho.md) | (yêu cầu chủ dự án 21/10/2026) | Sửa / hủy phiếu nhập kho giữ lịch sử, bắt buộc lý do, chỉ khi chưa kiểm kê sau lúc nhập và còn đủ hàng (D-39, D-40); phiếu kiểm kê nháp sửa / xóa trên danh sách, hủy phiếu đã chốt gần nhất (D-41); chỉ quản lý sửa / hủy phần đã ghi kho (D-42) | ACCEPTED |
| [ADR-010](ADR-010-chuyen-ban-so-quy-danh-gia.md) | (yêu cầu chủ dự án 21/10/2026) | Chuyển bàn cả nhóm sang bàn bất kỳ, bill riêng (D-43); hủy / sửa khoản sổ quỹ đã duyệt khi ca còn mở, quyền như duyệt (D-44, D-45); đánh giá từng món sau thanh toán, báo quầy khi ≤ 2 sao, sao trung bình trên menu (D-46…D-48) | ACCEPTED |
| [ADR-011](ADR-011-tra-cuu-api.md) | (yêu cầu chủ dự án 23/10/2026) | Trang Tra cứu API trong Quản lý, chỉ ADMIN, mọi môi trường (D-49); danh sách đọc từ router lúc chạy, mô tả ghép từ api-contract.md (D-50); chỉ đọc, không gọi thử (D-51) | ACCEPTED |
| [ADR-012](ADR-012-giao-dien-moc.md) | (yêu cầu chủ dự án 23/10/2026) | Giao diện chủ đề "Mộc": bảng màu espresso / nâu rang / kem sữa / caramel / lá, mọi màu là token, đạt WCAG AA (D-52); phông Be Vietnam Pro + Lora tự lưu trong app, không CDN (D-53); chỉ đổi CSS, vùng chạm quầy / khách ≥ 44 px (D-54) | PROPOSED |
| [ADR-013](ADR-013-giao-dien-impeccable.md) | (yêu cầu chủ dự án 23/10/2026) | Nâng chất lượng giao diện theo Impeccable: một bộ biểu tượng SVG thay emoji (D-55); độ nổi một lần, bỏ vạch màu một bên, tô bề mặt trình duyệt, giảm chuyển động (D-56); giữ nền kem (D-57); menu quản lý 6 nhóm thu gọn (D-58) | PROPOSED |
| [ADR-014](ADR-014-dang-xuat-phai-dong-ca.md) | (yêu cầu chủ dự án 23/10/2026) | Người mở ca đang chạy phải đếm tiền và đóng ca trước khi đăng xuất; người khác đăng xuất bình thường (D-59) | ACCEPTED |
| [ADR-015](ADR-015-mau-bieu-do.md) | (yêu cầu chủ dự án 23/10/2026) | Màu biểu đồ do chủ dự án chọn: xanh `#3A9EFD` · cam `#F7A400` · tím đen `#1A1B4B` (token `--viz-*`), đã chạy validator; dự báo thực tế liền / dự báo đứt nối tiếp + mốc "Hôm nay"; cột bo đầu chân vuông; rê chuột / bàn phím xem số (D-60) | PROPOSED |
| [ADR-016](ADR-016-trien-khai-van-hanh.md) | Q-008 (chủ dự án chọn 23/10/2026) | Triển khai: máy tại quán (LAN) là chính, VPS dự phòng (D-61); sao lưu mỗi đêm + bản ngoài máy, giữ 14 ngày + bản đầu tháng 12 tháng, diễn tập hằng tháng (D-62); giám sát mỗi 15 phút + sổ tay sự cố, phát hành sau G5 (D-63) | ACCEPTED |
| [ADR-017](ADR-017-bat-buoc-mo-ca.md) | (yêu cầu chủ dự án 23/10/2026) | Chưa mở ca: khách xem menu nhưng không gửi đơn (D-64); quầy khóa xử lý đơn — tiếp nhận, hoàn tất, hủy, gọi món tại bàn, sửa / xóa món, chuyển bàn, chia bill (D-65); không khóa kho ở quầy, trang Quản lý (D-66) | ACCEPTED |
| [ADR-018](ADR-018-bo-cuc-man-quay.md) | (yêu cầu chủ dự án 23/10/2026) | Bố cục màn quầy "Đơn hàng": thanh trên gọn + vùng "Cần xử lý ngay" + đơn cần làm (Mới, Đang pha) + lưới bàn, "Đã xong" thu thành dải (D-67); phiếu đơn chữ to, thời gian chờ đổi màu 8 / 15 phút, nút ≥ 44 px (D-68); lưới mọi bàn có trạng thái màu + chữ (D-69); < 1200 px lưới bàn thành ngăn trượt (D-70) | ACCEPTED |
| [ADR-019](ADR-019-chuyen-khoan-gop-tach-hoa-don.md) | (yêu cầu chủ dự án 24/10/2026) | Thu bằng chuyển khoản — chọn rồi bấm xác nhận, không QR, mỗi lượt một cách trả (D-71); két chỉ tính tiền mặt, hoàn theo cách đã trả (D-72); "gộp hóa đơn" = thu chung nhiều bàn, gộp trong cùng transaction với lượt thu (D-73); tách hóa đơn theo món bằng ô tích + "Phần còn lại" (D-74) | ACCEPTED |

Còn mở: **Q-000** (người ký chốt). Q-008 (hosting) đã chốt bằng ADR-016. Mỗi khi nhóm đổi một quyết định trong ADR-003, tạo ADR mới (ADR-005…) ghi rõ "thay thế mục Q-xxx của ADR-003".

## Mẫu ADR

```markdown
# ADR-00x — <quyết định ngắn>

- **Trạng thái:** PROPOSED | ACCEPTED | SUPERSEDED bởi ADR-00y
- **Ngày quyết định:** dd/mm/yyyy
- **Người quyết định:** <tên / vai trò theo Q-000>
- **Câu hỏi đóng:** Q-xxx

## Bối cảnh
## Quyết định
## Phương án đã cân nhắc
## Hệ quả (docs, data model, SP, API, UI, task bị ảnh hưởng)
```
