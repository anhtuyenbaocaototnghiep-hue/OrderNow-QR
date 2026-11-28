# TASK-142 — Kế hoạch: sao lưu tự động trong máy chủ app (F-103, ADR-074)

- **Vì sao cần plan:**
  - API mới: `GET /api/admin/backup`, `POST /api/admin/backup/run`.
  - Job nền mới `db-backup`, móc vào đóng ca.
  - Chạm ≥ 2 module: ca, job nền, cài đặt, công cụ vận hành.
- **Không đổi:**
  - CSDL: không migration.
  - Quyền của vai nào (khóa `backup` chỉ chủ quán vì không thuộc nhóm quyền nào).
  - Luật giữ bản (D-62), tên file, `last-backup.json`.
  - `npm run db:restore`.

## Các bước

1. **`services/backupService.js`:** chuyển lõi của `kịch-bản/db-backup.js` vào đây, dùng chung cho app và script:
   - `runBackup`, `lastBackup`, `isDue`, `dueAfterShiftClose`, `status`.
   - `ensureBackupDir`: tạo thư mục + `icacls` cho dịch vụ SQL Server.
   - `DEFAULT_WINDOWS_DIR = C:\CafeQr-SaoLuu`.
   - Script chỉ còn đọc tham số, in kết quả.
2. **`jobs/scheduler.js`:** `registerJob` nhận `schedule` (job không có lịch tự chạy); `lastRunOf(name, status)`.
3. **`jobs/index.js`:** job `db-backup`.
4. **`jobs/backupTimer.js`:** kiểm 2 phút sau khi mở app rồi mỗi 10 phút; lỗi chờ 60 phút. `afterShiftClose()`.
5. **Móc nối:** `services/shiftService.close` gọi `afterShiftClose()`. `server.js` bật bộ hẹn giờ (cùng `JOBS_ENABLED`).
6. **Route:** `routes/operations.js` `GET /backup`, `POST /backup/run`. `middleware/audit.js` đặt tên thực thể `Backup`.
7. **Giao diện:** `pages/admin-settings.js` thẻ "Sao lưu dữ liệu" (chỉ chủ quán).
8. **Công cụ:** `ops-health.js`, `db-restore.js` dùng cùng thư mục mặc định. `testDb.js`, `e2e-server.js` đặt `BACKUP_DIR` tạm (không lẫn vào thư mục thật).
9. **Test:**
   - `tests/backup.test.js`: sao lưu thật CSDL test, AC-103-01…04.
   - E2E AC-103-05.
   - Thử `npm run db:backup` sau khi tách lõi.
10. **Tài liệu:** ADR-074, FEATURE-103, BR-133, US-103-1, api-contract, screens-flows, backup-restore, deployment-checklist, `.env.example`, tc-map, README chỉ mục.

## Rủi ro

- **SQL Server chạy bằng tài khoản khác tài khoản ảo mặc định:** `icacls` cấp sai người → sao lưu lỗi; thẻ Cài đặt hiện lệnh cần chạy.
- **Máy chỉ có ổ C::** bản sao lưu cùng ổ với Windows. Thẻ nhắc đặt `BACKUP_COPY_DIR` ra ngoài máy.
- **Test chạy sao lưu thật:** chỉ vào thư mục tạm của CSDL test; `testDb.js` đặt `BACKUP_DIR` tạm để không bài nào ghi vào `C:\CafeQr-SaoLuu`.
