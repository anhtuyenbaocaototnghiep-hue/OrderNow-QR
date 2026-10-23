# Sổ tay xử lý sự cố (Incident Runbook)

> Sổ tay 15 bước — bước 15. Quyết định: [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md) D-63. Lập 23/10/2026 trong [TASK-070](../công-việc/TASK-070.md). Dùng cùng [monitoring.md](monitoring.md) (phát hiện) và [backup-restore.md](backup-restore.md) (khôi phục).

## 1. Mức độ

| Mức | Ví dụ | Phản hồi | Ai quyết |
| --- | --- | --- | --- |
| **SEV1** — không bán được / có thể mất tiền, mất dữ liệu | App không mở được, CSDL hỏng, máy chủ hỏng, lộ mật khẩu quản lý | Ngay; quá **10 phút** chưa xong → chuyển bán bằng giấy (§3) | Chủ quán |
| **SEV2** — bán được nhưng thiếu một phần | Không in được bill, khách không quét được QR, quầy không nhận đơn realtime, sao lưu lỗi | Trong ca | Trưởng ca |
| **SEV3** — không ảnh hưởng bán hàng | Báo cáo sai số nhỏ, giao diện lệch, job nền lỗi một lần | Trong tuần | Người kỹ thuật |

## 2. Người trực

Điền tên và số điện thoại **trên bản in dán ở quầy**, không ghi vào repo (thông tin cá nhân).

| Vai | Khi nào gọi |
| --- | --- |
| Trưởng ca đang trực | Mọi sự cố trong ca — người xử lý đầu tiên |
| Người kỹ thuật | SEV1, SEV2 không tự xử lý được trong 15 phút |
| Chủ quán | Mọi SEV1; quyết khôi phục dữ liệu, quay lui phát hành, thông báo khách |

## 3. Nguyên tắc chung

1. **Tiền và dữ liệu trước, máy sau.** Không sửa / xóa thẳng trong CSDL. Sai lẻ thì dùng chức năng của app (hủy khoản quỹ, hoàn tiền, điều chỉnh kho, sửa / xóa món); sai hàng loạt mới khôi phục.
2. **Ghi lại** giờ phát hiện, đã làm gì, giờ xong — để viết báo cáo §5.
3. **Bán bằng giấy** khi app không dùng được quá 10 phút:
   - quầy ghi order trên sổ / phiếu giấy (bàn, món, tùy chọn, giờ), thu **tiền mặt**, đưa phiếu viết tay;
   - khi app chạy lại: nhập bù từng phiếu bằng **Bán mang đi** hoặc **Gọi món tại bàn**, ghi chú "nhập bù giấy", thu tiền đúng số đã thu để két và kho khớp;
   - giữ sổ giấy tới khi đã đối chiếu xong với báo cáo cuối ngày.
4. Có nghi ngờ bị xâm nhập / lộ dữ liệu → **không** tắt máy vội (mất dấu vết), làm S8.

## 4. Kịch bản

### S1. App không mở được (khách và quầy đều không vào được)
- **Kiểm:** trên máy chủ bấm `hướng-dẫn\10-kiểm-tra-hệ-thống.cmd`. Xem file `server-YYYYMMDD.log` **mới nhất** trong thư mục nhật ký (`LOG_DIR`, đặt tên theo ngày app khởi động), đọc các dòng cuối. App tự chạy lại sau 15 giây mỗi khi dừng — log có nhiều dòng "app dừng … chạy lại" liên tiếp là app lỗi lặp lại.
- **Xử lý:** Task Scheduler → chạy lại tác vụ `cafe-qr-app` (hoặc bấm đúp `11-chạy-máy-chủ-quán.cmd`). Log báo thiếu biến môi trường → kiểm `.env`. Báo cổng 3000 đang bận → có bản app khác đang chạy: `netstat -ano | findstr :3000` lấy PID, tắt đúng PID đó (`taskkill /PID <số> /F`). Không lên lại trong 10 phút → §3.
- **Sau:** tìm nguyên nhân trong log; ghi defect-log.

### S2. App báo không kết nối được CSDL (`/api/health` có `db: down`)
- **Kiểm:** `services.msc` → dịch vụ **SQL Server (MSSQLSERVER / SQLEXPRESS)** có đang chạy không; ổ đĩa còn trống không.
- **Xử lý:** khởi động dịch vụ SQL Server, rồi chạy lại tác vụ `cafe-qr-app`. Ổ đầy → S10. Dịch vụ không lên được, log SQL Server báo hỏng CSDL → SEV1, báo chủ quán, khôi phục theo [backup-restore.md](backup-restore.md) §4.2.
- **CSDL kẹt sau khôi phục lỗi** (SSMS hiện `CafeQr (Restoring…)` hoặc `Offline`):
  - `Offline` → `sqlcmd -S . -E -Q "ALTER DATABASE CafeQr SET ONLINE"`;
  - `Restoring…` (khôi phục dở) → chạy lại lệnh khôi phục với **cùng file .bak** và `--replace` (app đã dừng); xong kiểm `npm run ops:health`. Không xóa file trong thư mục dữ liệu SQL Server.

### S3. Mất Wi-Fi / mạng trong quán
- **Dấu hiệu:** điện thoại khách và máy quầy cùng báo "Mất kết nối"; máy chủ vẫn chạy.
- **Xử lý:** khởi động lại router. Trong lúc chờ: nhân viên nhận order tại quầy bằng **Gọi món tại bàn / Bán mang đi ngay trên máy chủ** (`http://localhost:3000/pos`, không cần mạng), hoặc §3. Đơn khách đã gửi không mất — có mạng lại, quầy tự tải đơn nhỡ (NFR-AVL-02).

### S4. Không in được bill
- **Kiểm:** giấy, nắp máy in, cáp / Wi-Fi máy in, máy in mặc định của Windows, khổ giấy chọn ở màn hình quầy.
- **Xử lý:** vẫn thu tiền bình thường; in lại sau ở **Báo cáo & lịch sử** (lịch sử đơn → in lại bill). Khách cần gấp → viết tay số tiền, giờ, tên quán.

### S5. Khách quét QR không vào được, quầy vẫn bình thường
- **Kiểm:** điện thoại khách có đang dùng Wi-Fi của quán không (dùng 4G thì không vào được máy chủ trong LAN); IP máy chủ có bị đổi không (so với `PUBLIC_BASE_URL`); Wi-Fi khách có bật cách ly thiết bị không ([deployment-checklist.md](deployment-checklist.md) §A1).
- **Xử lý:** hướng dẫn khách vào Wi-Fi quán; IP đổi → đặt lại IP cố định ở router cho đúng địa chỉ cũ (không cần in lại QR). Tạm thời nhân viên gọi món giúp khách bằng **Gọi món tại bàn**.

### S6. Dữ liệu sai (kho, tiền, đơn)
- **Xử lý một vài chỗ:** dùng chức năng app — điều chỉnh tồn (có lý do), hủy / sửa khoản quỹ khi ca còn mở, hoàn tiền, sửa / xóa món; xem **Nhật ký thao tác** để biết ai làm, lúc nào.
- **Sai hàng loạt** (do lỗi phần mềm, nhập nhầm cả loạt): SEV1, chủ quán quyết → khôi phục theo [backup-restore.md](backup-restore.md) §4.2. Đơn sau lúc sao lưu nhập lại từ bill / sổ giấy.

### S7. Máy chủ hỏng, mất máy, hỏng ổ cứng
- SEV1. Chuyển bán giấy (§3) ngay.
- Máy dự phòng / máy mới hoặc VPS: làm [backup-restore.md](backup-restore.md) §4.3 (mục tiêu ≤ 2 giờ). Địa chỉ đổi → in lại QR bàn.
- Mất máy (bị trộm): coi như lộ dữ liệu → làm thêm S8.

### S8. Lộ mật khẩu / nghi bị truy cập trái phép / mất bản sao lưu
1. Khóa ngay tài khoản liên quan trong Quản lý → Tài khoản (phiên đang mở bị từ chối ngay).
2. Đổi bí mật theo [secrets-register.md](secrets-register.md) §2: `JWT_SECRET` (đăng xuất mọi người), mật khẩu quản lý, `DB_PASSWORD` nếu `.env` có thể đã lộ.
3. Xem **Nhật ký thao tác**: hoàn tiền, đổi giá, đổi quyền, xóa dữ liệu bất thường từ lúc nghi lộ.
4. Dữ liệu cá nhân hội viên (SĐT, họ tên) có thể đã lộ → chủ quán kiểm tra nghĩa vụ thông báo theo quy định hiện hành về bảo vệ dữ liệu cá nhân (thường có hạn thông báo ngắn, ví dụ 72 giờ) và báo cho hội viên nếu cần.
5. Ghi defect-log mức cao; rà lại [security-check.md](../chất-lượng/security-check.md).

### S9. Bản mới vừa phát hành bị lỗi
- Theo [release-plan.md](release-plan.md) §5 (quay lui ≤ 30 phút).

### S10. Ổ đĩa sắp đầy / CSDL gần giới hạn 10 GB
- Ổ đầy: chuyển bản sao lưu cũ ra ổ ngoài, dọn `nhật-ký\server-*.log` cũ, dọn thư mục Tải về / thùng rác. Không xóa file trong thư mục dữ liệu của SQL Server.
- CSDL ≥ 80 % giới hạn bản Express: báo chủ quán — phương án là nâng bản SQL Server hoặc lưu trữ dữ liệu cũ; cần quyết định (ADR mới), không tự xóa dữ liệu.

### S11. Mất điện
- Có UPS: đóng ca / lưu việc dở trong thời gian UPS còn pin, tắt máy chủ đúng cách nếu mất điện lâu.
- Có điện lại: máy tự bật (BIOS), app tự chạy; kiểm `10-kiểm-tra-hệ-thống.cmd`. Đơn đang dở trên điện thoại khách đã gửi thì không mất.

## 5. Sau sự cố

Mọi SEV1 / SEV2 ghi vào [defect-log.md](../chất-lượng/defect-log.md) (mã DEF-xxx) với:

| Mục | Ghi gì |
| --- | --- |
| Thời gian | Phát hiện, bắt đầu xử lý, bán lại được, xong hẳn |
| Ảnh hưởng | Bao lâu không bán được, bao nhiêu đơn nhập bù, tiền / kho có lệch không |
| Nguyên nhân | Nguyên nhân gốc (không dừng ở "máy lỗi") |
| Đã làm | Các bước, ai làm |
| Phòng ngừa | Việc cần làm để không lặp lại (TASK mới nếu phải sửa code / quy trình) |
