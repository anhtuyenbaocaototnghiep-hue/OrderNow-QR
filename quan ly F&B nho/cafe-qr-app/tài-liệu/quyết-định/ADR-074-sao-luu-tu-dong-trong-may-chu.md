# ADR-074 — Sao lưu tự động ngay trong máy chủ app (không cần Task Scheduler)

- **Trạng thái:** ACCEPTED (28/11/2026).
- **Chủ dự án yêu cầu (28/11/2026):** hỏi "app tôi còn thiếu gì… còn điểm gì bất hợp lý không". Agent đề xuất A1 "sao lưu tự động", chủ dự án trả lời "OK TIẾN HÀNH LÀM ĐI".
- **Liên quan:** [FEATURE-103](../chức-năng/FEATURE-103.md); [ADR-016](ADR-016-trien-khai-van-hanh.md) D-62 (sao lưu mỗi ngày, hai nơi, giữ 14 ngày / 12 tháng); [backup-restore.md](../vận-hành/backup-restore.md); công cụ `npm run db:backup` / `db:restore` / `ops:health` (TASK-070).

## Bối cảnh

- D-62 giao việc sao lưu hằng ngày cho Windows Task Scheduler (tác vụ `cafe-qr-sao-luu`, cài tay theo deployment-checklist §A5).
- Kiểm ngày 28/11/2026, quán đã chạy thật được vài ngày:
  - `.env` chưa có `BACKUP_DIR`, chưa có tác vụ Task Scheduler. **Chưa có bản sao lưu tự động nào.**
  - Các bản `.bak` hiện có đều do agent làm tay trước khi sửa dữ liệu.
- Máy chủ là laptop của chủ quán: mở ở quán, mang về nhà, tắt đêm. Lịch "sau giờ đóng cửa" của Task Scheduler dễ trượt khi máy tắt.
- Máy chỉ có ổ C:.
- Thử thực tế:
  - Tạo `C:\CafeQr-SaoLuu-thu` bằng tài khoản thường, cấp quyền ghi cho `NT Service\MSSQLSERVER` bằng `icacls` — thành công, **không cần quyền quản trị** (người tạo thư mục là chủ, được đổi quyền).
  - `npm run db:backup -- --dir C:\CafeQr-SaoLuu-thu` → CSDL thật 19,1 MB trong 1 giây.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-272 | **Máy chủ app tự sao lưu**, dùng đúng cách làm của `npm run db:backup` (một mã nguồn chung `services/backupService.js`):<ul><li>`BACKUP DATABASE … WITH CHECKSUM` vào `BACKUP_DIR`, tên `<CSDL>_<YYYYMMDD-HHmm>.bak`.</li><li>Chép ảnh (`UPLOADS_DIR`) vào `BACKUP_DIR\uploads`.</li><li>Chép sang `BACKUP_COPY_DIR` nếu có.</li><li>Dọn bản cũ: giữ 14 ngày; bản đầu mỗi tháng + bản có nhãn trong 12 tháng; luôn ≥ 3 bản.</li><li>Ghi `last-backup.json` và `backup.log`.</li></ul>Task Scheduler không còn bắt buộc (vẫn dùng được nếu muốn thêm lần sao lưu lúc máy chủ app không chạy). |
| D-273 | **Khi nào sao lưu:**<ul><li>**Ngay sau mỗi lần đóng ca**, nếu bản thành công gần nhất đã cũ hơn 30 phút.</li><li>**Khi bản thành công gần nhất cũ hơn 20 giờ** (hoặc chưa có bản nào): kiểm 2 phút sau khi mở app, rồi mỗi 10 phút. Máy tắt đêm thì sáng hôm sau mở app là sao lưu.</li><li>**Khi chủ quán bấm "Sao lưu ngay"** ở Cài đặt (API `POST /api/admin/backup/run`; `POST /api/admin/jobs/db-backup/run` cũng chạy được).</li></ul>Lần chạy ghi vào `JobRuns` (job `db-backup`) và có khóa chống chạy trùng như mọi job. Lỗi → không tự thử lại trong 60 phút. Không tự chạy khi `JOBS_ENABLED=false` (test / E2E). |
| D-274 | **Thư mục:**<ul><li>`BACKUP_DIR` trong `.env`. Chưa đặt và máy chạy Windows → `C:\CafeQr-SaoLuu`.</li><li>Thư mục chưa có → app tạo và cấp quyền ghi cho tài khoản dịch vụ SQL Server bằng `icacls` (`NT Service\MSSQLSERVER`, instance có tên thì `NT Service\MSSQL$<tên>`).</li><li>Cấp không được (dịch vụ chạy bằng tài khoản khác) → lỗi sao lưu ghi rõ lệnh `icacls` cần chạy.</li></ul> |
| D-275 | **Cài đặt → thẻ "Sao lưu dữ liệu"** (chỉ chủ quán):<ul><li>Lần sao lưu gần nhất: giờ, dung lượng, số ảnh.</li><li>Thư mục, cách giữ bản. Bản chép thứ hai: đã đặt hay chưa (chưa → nhắc nên chép ra USB / thư mục Google Drive / OneDrive).</li><li>Dung lượng ổ còn trống.</li><li>Lỗi gần nhất (khi lỗi xảy ra sau lần thành công) kèm cách sửa.</li><li>Nút **"Sao lưu ngay"**.</li></ul>API `GET /api/admin/backup`, `POST /api/admin/backup/run` — chỉ chủ quán (khóa `backup` không thuộc nhóm quyền nào nên quản lý cửa hàng tự bị chặn). |

## Phương án đã cân nhắc

- **Giữ Task Scheduler, chỉ viết hướng dẫn rõ hơn:** quán đã chạy mà chưa ai cài; laptop tắt đêm làm trượt lịch. Bỏ — app tự làm khi đang chạy.
- **Chỉ sao lưu theo giờ cố định trong ngày (vd. 23:30):** máy thường đã tắt lúc đó. Chọn "sau đóng ca + khi bản gần nhất quá 20 giờ".
- **Đăng ký vào bộ lập lịch chung theo chu kỳ 10 phút:** mỗi lần kiểm ghi một dòng `JobRuns` (144 dòng / ngày). Bỏ — bộ hẹn giờ riêng chỉ gọi job khi thật sự đến hạn (như bộ gửi email F-060).
- **Khôi phục ngay trên giao diện:** khôi phục ghi đè dữ liệu và cần quyền quản trị SQL Server. Không làm — vẫn qua `npm run db:restore` theo [incident-runbook.md](../vận-hành/incident-runbook.md).
- **Tự tải lên đám mây:** cần tài khoản / khóa của chủ quán. Không làm — chủ quán chọn một thư mục đồng bộ (Google Drive / OneDrive) làm `BACKUP_COPY_DIR`.

## Hệ quả

- **Mã nguồn:**
  - Mới: `services/backupService.js` (lõi sao lưu chung cho app + `kịch-bản/db-backup.js`), `jobs/backupTimer.js`.
  - Sửa: `jobs/index.js` (job `db-backup`), `jobs/scheduler.js` (nhãn lịch tùy chọn), `services/shiftService.js` (đóng ca → sao lưu), `server.js`, `routes/operations.js` (2 API), `pages/admin-settings.js` (thẻ).
- **Dữ liệu:** không migration. File trong `BACKUP_DIR`.
- **Vận hành:**
  - Khởi động lại máy chủ là có sao lưu.
  - Nên đặt `BACKUP_COPY_DIR` ra ngoài máy (máy mất / hỏng thì bản trong `C:\CafeQr-SaoLuu` mất theo).
  - `ops:health` đọc cùng `last-backup.json`.
- **Tài liệu:** FEATURE-103 (AC-103-01…05), BR-133, US-103-1, api-contract, screens-flows, backup-restore, deployment-checklist, `.env.example`, tc-map.
