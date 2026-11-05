# OrderNow-QR
Quản lý F&amp;B đặt bàn bằng QR

**Phiên bản hiện tại:** `v1.0.0-rc.3` (ứng viên phát hành, 29/10/2026) — chức năng F-001…F-063; nhật ký phát hành ở `quan ly F&B nho/cafe-qr-app/tài-liệu/vận-hành/release-plan.md` §7.

**Cập nhật 05/11/2026 (chưa gắn phiên bản, chờ duyệt):** thêm F-064…F-073 — báo động giá vốn, Lãi/lỗ dễ hiểu, sổ quỹ, theo dõi hội viên, vòng quay may mắn + hẹn giờ ra món, quà sinh nhật, thu thập ngày sinh, mừng khách quay lại, ly treo (mua tặng bạn một ly), chống sửa / xóa dữ liệu trái phép, chấm công nhiều người bằng PIN + tính lương (VietQR trả lương). Danh sách ở `quan ly F&B nho/cafe-qr-app/tài-liệu/chức-năng/README.md`.

## Nội dung

- [Mã nguồn web-app `cafe-qr-app`](quan%20ly%20F%26B%20nho/cafe-qr-app/): HTML/CSS/JS thuần, Node.js + Express, SQL Server, Socket.io. Cách cài và chạy xem README trong thư mục này.
- [Video review (59 giây)](quan%20ly%20F%26B%20nho/nop-bai/Video_Review_CafeQR.mp4): khách quét QR gọi món, quầy nhận đơn realtime và thu tiền, quản lý xem báo cáo.
- [Phân tích backend](quan%20ly%20F%26B%20nho/PH%C3%82N-T%C3%8DCH-BACKEND.md): backend chạy thế nào, chức năng nào dùng hàm nào, stored procedure.
- [File nộp bài](quan%20ly%20F%26B%20nho/nop-bai/): nhật ký prompt AI (Word), slide thuyết trình (PowerPoint).
