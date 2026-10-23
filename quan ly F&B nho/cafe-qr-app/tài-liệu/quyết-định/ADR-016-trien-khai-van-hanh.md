# ADR-016 — Triển khai và vận hành: máy tại quán (LAN) là chính, VPS dự phòng

- **Trạng thái:** ACCEPTED (23/10/2026). Chủ dự án chọn "Cả hai: LAN chính, VPS dự phòng" khi giao làm bước 15 của sổ tay quy trình. Đóng **Q-008** (hosting).
- **Bối cảnh:**
  - Bước 15 (Deployment & Operations) cần: Release Plan, Deployment Checklist, Secrets Register, Backup, Monitoring, Incident. Trước đây repo chỉ có hướng dẫn chạy trên máy phát triển.
  - App chỉ thu tiền mặt (D-1), không có webhook, nên chạy được hoàn toàn trong mạng của quán (Q-008, NFR-AVL-01).
  - Dữ liệu thật gồm đơn, tiền, kho và **SĐT / họ tên hội viên** (dữ liệu cá nhân). Mất máy hoặc hỏng ổ mà không có bản sao lưu là mất hết.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-61 | **Nơi chạy.** <br>• **Chính:** một máy Windows tại quán chạy Node.js + SQL Server cùng máy, IP cố định trong mạng quán, app tự chạy khi bật máy, **không mở ra Internet**. Điện thoại khách vào qua Wi-Fi của quán. <br>• **Dự phòng:** VPS Linux (Docker SQL Server + Node + HTTPS qua reverse proxy). Dùng khi máy quán hỏng lâu, hoặc khi sau này làm thanh toán online cần địa chỉ Internet. Chuyển sang VPS = cài theo checklist rồi khôi phục bản sao lưu mới nhất. <br>• **DB chạy thật** tách khỏi DB chạy thử `CafeQrDev`; dữ liệu chạy thử không mang sang, trừ khi chủ quán quyết khác ở Gate G5. |
| D-62 | **Sao lưu.** <br>• Tự động **mỗi ngày sau giờ đóng cửa**: sao lưu đầy đủ CSDL (có checksum) + chép ảnh hóa đơn sổ quỹ; thêm một bản **trước mỗi lần phát hành / chạy migration**. <br>• **Hai nơi:** thư mục sao lưu trên máy (ổ khác ổ hệ điều hành nếu có) + **một bản ngoài máy** (USB mang về hằng tuần, hoặc thư mục đám mây của chủ quán có xác thực 2 lớp — chủ quán chọn). <br>• Giữ **14 ngày gần nhất + bản đầu mỗi tháng trong 12 tháng**. <br>• **Diễn tập khôi phục mỗi tháng** vào một CSDL riêng rồi xóa. <br>• Mục tiêu đề xuất: mất tối đa **1 ngày** dữ liệu (RPO ≤ 24 giờ), chạy lại trong **2 giờ** (RTO ≤ 2 giờ) — PROPOSED, chủ dự án chốt ở G5. |
| D-63 | **Giám sát và sự cố.** <br>• Không dùng dịch vụ giám sát bên ngoài: script kiểm tra **mỗi 15 phút** (API + CSDL, ổ đĩa trống, tuổi bản sao lưu, job nền lỗi, dung lượng CSDL) ghi nhật ký; chủ quán / trưởng ca xem bảng kiểm tra đầu ngày. <br>• Sự cố xử lý theo sổ tay sự cố (mức độ, người trực, các bước). Mất máy chủ thì quán vẫn bán được bằng giấy + tiền mặt, nhập lại sau. <br>• **Phát hành bản mới chỉ sau Gate G5** do chủ dự án ký; agent chuẩn bị bằng chứng, không tự triển khai. |

Chủ dự án **không chọn**:
- chỉ chạy trên máy tại quán (không có đường dự phòng);
- chỉ chạy trên VPS.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| SQL Server ghi file sao lưu bằng tài khoản dịch vụ riêng (`NT Service\MSSQLSERVER`), tài khoản Windows thường không đọc được thư mục sao lưu mặc định | Script ghi thẳng vào `BACKUP_DIR` do quán chọn; lần cài đầu cấp quyền ghi cho tài khoản dịch vụ (`icacls`). Script báo đúng lệnh cần chạy khi thiếu quyền | Kiểm trên máy dev 23/10/2026: thư mục mặc định từ chối tài khoản người dùng |
| Login của app (`cafe_app`) là `db_owner`: sao lưu được nhưng không tạo được CSDL mới | Sao lưu dùng login của app (`npm run db:backup`); khôi phục / diễn tập dùng quyền quản trị Windows qua `sqlcmd -E` (`npm run db:restore`) | Không cấp thêm quyền cho login của app |
| Bản sao lưu chứa dữ liệu cá nhân hội viên | Bản ngoài máy chỉ để ở nơi của chủ quán (USB cất riêng / đám mây có 2 lớp xác thực); không gửi qua chat / email; không bao giờ commit | Bảo vệ dữ liệu cá nhân (NFR-PRV) |
| Không có dịch vụ cảnh báo bên ngoài | Script kiểm tra trả mã lỗi + ghi `nhật-ký/`; Task Scheduler chạy định kỳ; bảng kiểm tra đầu ngày đọc kết quả | Quán nhỏ, không có người trực kỹ thuật thường xuyên |
| Nhật ký server | Bản chạy thật ghi stdout / stderr vào `nhật-ký/server-YYYYMMDD.log` (không commit) | Tra cứu khi có sự cố; nhật ký không chứa mật khẩu / token (NFR-SEC-10) |

## Hệ quả

- Tài liệu vận hành mới trong `tài-liệu/vận-hành/`: kế hoạch phát hành, checklist triển khai (LAN + VPS), sổ đăng ký bí mật, sao lưu & khôi phục, giám sát, sổ tay sự cố.
- Script mới: `npm run db:backup`, `npm run db:restore`, `npm run ops:health`; file bấm đúp trong `hướng-dẫn/`.
- Không đổi code ứng dụng, không migration, không thêm dependency.
- NFR-AVL-06 có ngưỡng; Gate G5 có tiêu chí. Task: [TASK-070](../công-việc/TASK-070.md).
