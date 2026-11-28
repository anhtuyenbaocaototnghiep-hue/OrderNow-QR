# FEATURE-103 — Sao lưu tự động trong máy chủ app + thẻ "Sao lưu dữ liệu" ở Cài đặt

> **Nguồn:** chủ dự án 28/11/2026 duyệt đề xuất A1 ("OK TIẾN HÀNH LÀM ĐI"). Kiểm cùng ngày: quán chạy thật mà chưa có bản sao lưu tự động nào (chưa đặt `BACKUP_DIR`, chưa cài Task Scheduler). Quyết định: [ADR-074](../quyết-định/ADR-074-sao-luu-tu-dong-trong-may-chu.md) D-272…D-275 (bổ sung ADR-016 D-62).

- **Status:** CONFIRMED (chủ dự án duyệt đề xuất) · Triển khai: [TASK-142](../công-việc/TASK-142.md)
- **Actor:** ACT-ADMIN (xem tình trạng, bấm Sao lưu ngay); hệ thống (tự sao lưu).
- **Màn hình:** SCR-33 Cài đặt → thẻ **"Sao lưu dữ liệu"**.
- **Dữ liệu:** file trong `BACKUP_DIR` (`*.bak`, `uploads\`, `last-backup.json`, `backup.log`); job `db-backup` trong `JobRuns`. Không migration.

## User Story

- **US-103-1:** Là chủ quán, tôi muốn app tự sao lưu dữ liệu sau mỗi lần đóng ca và ít nhất mỗi ngày một lần, không cần tôi cài gì thêm, và xem được bản gần nhất ở Cài đặt. Như vậy máy hỏng / lỡ xóa nhầm vẫn lấy lại được đơn, tiền, kho, hội viên.

## Quy tắc (BR-133)

1. **Sao lưu gì:**
   - Toàn bộ CSDL (`BACKUP DATABASE … WITH CHECKSUM`).
   - Ảnh tải lên (`UPLOADS_DIR`).
   - Không sao lưu `.env` (mật khẩu).
2. **Ở đâu:**
   - `BACKUP_DIR` trong `.env`. Máy Windows chưa đặt → `C:\CafeQr-SaoLuu`. Thư mục chưa có thì app tự tạo và cấp quyền ghi cho dịch vụ SQL Server.
   - Thêm bản chép ở `BACKUP_COPY_DIR` nếu đặt.
3. **Khi nào:**
   - Sau mỗi lần đóng ca, nếu bản gần nhất cũ hơn 30 phút.
   - Khi bản thành công gần nhất cũ hơn 20 giờ: kiểm 2 phút sau khi mở app, rồi mỗi 10 phút.
   - Khi chủ quán bấm "Sao lưu ngay".
   - Lỗi → không tự thử lại trong 60 phút.
4. **Giữ bao lâu** (như `npm run db:backup`):
   - Mọi bản trong 14 ngày.
   - Bản đầu mỗi tháng và bản có nhãn trong 12 tháng.
   - Luôn ít nhất 3 bản.
   - Chỉ xóa file đúng mẫu tên của đúng CSDL.
5. **Ai xem / bấm:** chỉ chủ quán.

## API

- **Mới** `GET /api/admin/backup` (chủ quán) → `{ dir, copyDir, keepDays, keepMonths, last, lastError, freeBytes, due }`.
  - `last`: `{ file, bytes, finishedAt, seconds, uploads, copied }` hoặc `null`.
  - `lastError`: `{ at, message }` khi lần lỗi mới hơn lần thành công, ngược lại `null`.
- **Mới** `POST /api/admin/backup/run` (chủ quán) → `200 { result, status }`.
  - `result`: `{ file, bytes, seconds, uploads, copied, removed }` (`removed` = số bản cũ vừa dọn).
  - `status`: như `GET /api/admin/backup`.
  - Lỗi → `500 BACKUP_FAILED` kèm thông báo (thiếu quyền ghi → lệnh `icacls` cần chạy).
  - Đang có lần khác chạy → `409 BACKUP_RUNNING`.

## Acceptance Criteria

- **AC-103-01:** Chủ quán `POST /api/admin/backup/run`:
  - `BACKUP_DIR` có file `.bak` mới đúng mẫu tên, `last-backup.json` ghi file đó.
  - Ảnh trong `UPLOADS_DIR` được chép vào `BACKUP_DIR\uploads`. `BACKUP_COPY_DIR` (nếu đặt) có bản chép.
  - `GET /api/admin/backup` trả `last` là bản vừa làm, `lastError = null`.
  - Quản lý cửa hàng, nhân viên gọi hai API → `403`.
- **AC-103-02:** Dọn bản cũ đúng luật giữ:
  - Bản cùng CSDL quá 14 ngày bị xóa, trừ bản đầu tháng trong 12 tháng.
  - File khác tên mẫu, bản của CSDL khác: còn nguyên.
- **AC-103-03:** Lịch:
  - Chưa có bản → đến hạn. Bản thành công < 20 giờ → chưa. ≥ 20 giờ → đến hạn.
  - Sau đóng ca: bản gần nhất ≥ 30 phút → sao lưu; < 30 phút → không.
  - Lỗi → 60 phút sau mới thử lại.
- **AC-103-04:** SQL Server không ghi được vào thư mục:
  - `POST` → `500 BACKUP_FAILED`, thông báo có lệnh `icacls`.
  - `GET` trả `lastError`. `JobRuns` có dòng `FAILED` của `db-backup`.
- **AC-103-05:** Trên trình duyệt, Cài đặt → thẻ "Sao lưu dữ liệu":
  - Thấy thư mục, chưa có / có bản gần nhất.
  - Bấm "Sao lưu ngay" → báo đã sao lưu, thẻ hiện giờ + dung lượng bản mới.
