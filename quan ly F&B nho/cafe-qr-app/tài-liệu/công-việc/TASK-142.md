# TASK-142 — Sao lưu tự động trong máy chủ app + thẻ "Sao lưu dữ liệu" (F-103)

- **Status:** READY_FOR_REVIEW (28/11/2026)
- **Tài liệu:**
  - [FEATURE-103](../chức-năng/FEATURE-103.md) (AC-103-01…05), [ADR-074](../quyết-định/ADR-074-sao-luu-tu-dong-trong-may-chu.md) D-272…D-275 (bổ sung ADR-016 D-62), BR-133, US-103-1.
  - Kế hoạch: [TASK-142-plan](../kế-hoạch/TASK-142-plan.md).
- **Màn hình:** SCR-33 Cài đặt → thẻ "Sao lưu dữ liệu".
- **Nguồn:**
  - Chủ dự án 28/11/2026 duyệt đề xuất A1 ("OK TIẾN HÀNH LÀM ĐI").
  - Kiểm cùng ngày: `.env` của quán chưa có `BACKUP_DIR`, chưa cài Task Scheduler → **chưa có bản sao lưu tự động nào**.
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-142-sao-luu-tu-dong`, chồng lên `task/TASK-141-doi-mat-khau-mac-dinh`

## Phạm vi

- **Lõi chung `services/backupService.js`** (chuyển từ `kịch-bản/db-backup.js`; script giờ gọi lõi này):
  - Thư mục chưa có → tạo + `icacls` cho dịch vụ SQL Server.
  - `BACKUP DATABASE … WITH CHECKSUM`, chép ảnh, chép sang `BACKUP_COPY_DIR`, dọn bản cũ, `last-backup.json`, `backup.log`.
  - `status()` cho Cài đặt.
- **Bộ hẹn giờ `jobs/backupTimer.js`:**
  - Kiểm 2 phút sau khi mở app rồi mỗi 10 phút: bản gần nhất ≥ 20 giờ → job `db-backup`.
  - Đóng ca → sao lưu nếu bản gần nhất ≥ 30 phút.
  - Lỗi → chờ 60 phút.
- **Bộ lập lịch:** job `db-backup` (không có lịch tự chạy, có chữ lịch riêng); `lastRunOf`.
- **API** `GET /api/admin/backup`, `POST /api/admin/backup/run` — chỉ chủ quán.
- **Giao diện:** thẻ "Sao lưu dữ liệu" ở Cài đặt.
- **Công cụ:**
  - `ops-health.js`, `db-restore.js` dùng cùng thư mục mặc định.
  - `testDb.js`, `e2e-server.js` dùng thư mục sao lưu tạm.

## Thiết lập trên máy của quán (28/11/2026)

- Tạo `C:\CafeQr-SaoLuu`, cấp quyền ghi cho `NT Service\MSSQLSERVER` bằng `icacls` — tài khoản thường, không cần quyền quản trị.
- Sao lưu thử dữ liệu quán 2 lần (15:48, 15:58), mỗi bản 19,1 MB, ~1 giây.
- `npm run ops:health` → "Sao lưu: OK".
- Chưa có bản chép thứ hai ngoài máy (`BACKUP_COPY_DIR`) — chờ chủ quán chọn thư mục Google Drive / OneDrive hoặc USB.

## Test

- **`tests/backup.test.js`** (4 test, sao lưu thật CSDL test vào thư mục tạm):
  - AC-103-01: thư mục tự tạo + cấp quyền; file, ảnh, bản chép; GET; 403; nhật ký.
  - AC-103-02: luật dọn bản cũ.
  - AC-103-03: ngưỡng giờ, bộ hẹn giờ, đóng ca thật → có bản mới.
  - AC-103-04: thư mục không có quyền → 500 có lệnh `icacls`, `lastError`, `JobRuns` FAILED, chờ 60 phút, sửa xong hết lỗi.
- **E2E `flow.spec.js`** "sao lưu dữ liệu…" (AC-103-05).
- **Thử tay:**
  - `npm run db:backup` sau khi tách lõi: thành công + báo lỗi đường dẫn tương đối.
  - Ảnh chụp thẻ trước / sau khi bấm Sao lưu ngay, thẻ Bảo mật đăng nhập, khung trang Quản lý có nút Đổi mật khẩu.

## Lệnh kiểm chứng

- **Kết quả 28/11/2026:**
  - `npm run lint`, `npm run format:check`: sạch.
  - `backup.test.js`: 4/4 PASS. Lần chạy đầu hỏng 2 bài, do test chứ không do lõi sao lưu:
    - Hai lần sao lưu trong một phút trùng tên → luật "giữ ≥ 3 bản" giữ thêm một bản. Sửa: thêm bản hôm qua vào dữ liệu thử.
    - `JobRuns` làm tròn giờ tới giây → lỗi "mới hơn" lần thành công cùng giây. Sửa: so `RunId`.
  - E2E bài F-103: PASS (8,7 giây).
- `npm test` toàn bộ, E2E toàn bộ, `npm run trace -- --check`: xem "Kết quả chạy đủ".

## Kết quả chạy đủ

Chạy một lần trên đỉnh chồng nhánh (gồm cả TASK-140, TASK-141), 28/11/2026, đều đạt ngay lần đầu:

- `npm test`: **531/531 PASS** (527 + 4 bài F-103), 0 hỏng.
- `npm run test:e2e`: **124/124 PASS** (8,3 phút), không bài nào phải chạy lại. Có các bài mới F-102 (flow + a11y) và F-103. Các lần chạy đủ của TASK-139 trước đó đều hỏng ngẫu nhiên 1 bài.
- `npm run trace -- --check`: **211 US, 609 AC — PASS 609**, thủ công 0, FAIL 0, NOT_RUN 0, GAP 0, chưa có TC 0. `traceability.md` sinh lại.
- `npm run lint`, `npm run format:check`: sạch.
