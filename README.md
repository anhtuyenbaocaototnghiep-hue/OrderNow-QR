# OrderNow-QR
Quản lý F&amp;B đặt bàn bằng QR

**Phiên bản hiện tại:** `v1.0.0-rc.3` (ứng viên phát hành, 29/10/2026) — chức năng F-001…F-063; nhật ký phát hành ở `quan ly F&B nho/cafe-qr-app/tài-liệu/vận-hành/release-plan.md` §7.

**Cập nhật 05/11/2026 (chưa gắn phiên bản, chờ duyệt):** thêm F-064…F-073 — báo động giá vốn, Lãi/lỗ dễ hiểu, sổ quỹ, theo dõi hội viên, vòng quay may mắn + hẹn giờ ra món, quà sinh nhật, thu thập ngày sinh, mừng khách quay lại, ly treo (mua tặng bạn một ly), chống sửa / xóa dữ liệu trái phép, chấm công nhiều người bằng PIN + tính lương (VietQR trả lương). Danh sách ở `quan ly F&B nho/cafe-qr-app/tài-liệu/chức-năng/README.md`.

**Cập nhật 06/11/2026 (chưa gắn phiên bản, chờ duyệt):** trang Tài khoản cho thấy ai đã đặt PIN (DEF-020); quên PIN thì đặt lại ngay ở màn Chấm công bằng mật khẩu đăng nhập; máy quầy nhắc người có lịch mà quên chấm vào / chấm ra; nhân viên tự báo quên chấm công để quản lý duyệt ở trang Lương (TASK-090, ADR-031).

**Cập nhật 10/11/2026 (chưa gắn phiên bản, chờ duyệt):** thêm F-074…F-087 — bán tiếp khi mất mạng, hạn dùng nguyên liệu, quy trình 1 chạm ở màn Đơn hàng, vai Quản lý cửa hàng + vị trí / cấp nhân viên + quyền riêng từng tài khoản, trang Quản lý riêng (chủ quán chỉ dùng trang Quản lý), bảng chọn món + giỏ hàng gọn, giao diện mới dễ nhìn, ảnh món và ảnh nguyên liệu, khách đổi bàn khi quét QR (nhãn đổi bàn, in phiếu pha bàn mới, tự trả bàn trống); sửa lỗi DEF-021…DEF-029 (trừ DEF-025 còn chờ duyệt). Danh sách ở `quan ly F&B nho/cafe-qr-app/tài-liệu/chức-năng/README.md`.

**Cập nhật 19/11/2026 (chưa gắn phiên bản, chờ duyệt):** thêm F-088…F-100 — màn quầy một màn hình (hai vùng Hàng pha / Quầy), phân quyền đơn giản bằng công tắc + trang Quyền nâng cao, số điện thoại tài khoản, kho nguyên liệu gọn (hạn sử dụng), màn chào khi khách quét QR, màn khách chỉ cho điện thoại, giao diện sáng / tối theo giờ quán + trang trí theo mùa, logo quán, thêm tài khoản chủ quán, khách quét QR tự vào nhóm của bàn với thẻ "Bạn đi chung hay đi riêng?", lương không tự duyệt cho mình, chuyển khoản VietQR có sẵn số tiền + in bill có mã QR, tự xác nhận chuyển khoản qua SePay; bỏ "Đổi người", trang Phân tích, dải "Mang ra" và giao diện "Sơ chế"; trang "Lãi / lỗ" đổi tên "Thu chi"; sửa lỗi DEF-030…DEF-034. Danh sách ở `quan ly F&B nho/cafe-qr-app/tài-liệu/chức-năng/README.md`.

**Cập nhật 28/11/2026 (chưa gắn phiên bản, chờ duyệt):** thêm F-101…F-103 — công tắc ô "Nhập SĐT để nhận ưu đãi" trên màn khách, bắt đổi mật khẩu mặc định / dễ đoán + tự đổi mật khẩu, sao lưu tự động trong máy chủ app (sau mỗi lần đóng ca và khi bản gần nhất quá 20 giờ; thẻ "Sao lưu dữ liệu" ở Cài đặt); hộp Thu tiền gọn, hộp "Thu chung với bàn khác" dễ thấy, chỉ người đã được sắp ca mới chấm công vào được, một mục "Nhân sự & lương", chuyển khoản qua nhân viên (mã QR chỉ trên bill), thẻ QR bàn dạng ảnh 10 × 15 cm (in A4 ngang 2 thẻ một tờ) có số điện thoại quán, chữ WIFI giữa mã Wi-Fi và lời nhắc vào Wi-Fi của quán trước khi quét, nhóm món ở quầy tự xuống dòng, gọi nhân viên tối đa 5 lần mỗi phút; sửa lỗi lách quyền bằng đường dẫn viết hoa (DEF-036) và nâng các thư viện có lỗ hổng đã công bố. Danh sách ở `quan ly F&B nho/cafe-qr-app/tài-liệu/chức-năng/README.md`.

## Nội dung

- [Mã nguồn web-app `cafe-qr-app`](quan%20ly%20F%26B%20nho/cafe-qr-app/): HTML/CSS/JS thuần, Node.js + Express, SQL Server, Socket.io. Cách cài và chạy xem README trong thư mục này.
- [Video review (59 giây)](quan%20ly%20F%26B%20nho/nop-bai/Video_Review_CafeQR.mp4): khách quét QR gọi món, quầy nhận đơn realtime và thu tiền, quản lý xem báo cáo.
- [Phân tích backend](quan%20ly%20F%26B%20nho/PH%C3%82N-T%C3%8DCH-BACKEND.md): backend chạy thế nào, chức năng nào dùng hàm nào, stored procedure.
- [Thiết kế hệ thống bán cà phê cho quán nhỏ](quan%20ly%20F%26B%20nho/nop-bai/THI%E1%BA%BET-K%E1%BA%BE-H%E1%BB%86-TH%E1%BB%90NG-QU%C3%81N-C%C3%80-PH%C3%8A.md): ý tưởng thiết kế mới, dùng QR từ lúc gọi món đến lúc trả tiền, một màn hình quầy, 1 chủ, 1 quản lý, 2 nhân viên mỗi ca.
- [File nộp bài](quan%20ly%20F%26B%20nho/nop-bai/): nhật ký prompt AI (Word), slide thuyết trình (PowerPoint).
