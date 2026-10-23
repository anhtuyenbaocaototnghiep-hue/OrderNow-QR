# Vận hành

Tài liệu chạy app: trên máy phát triển và trên máy chạy thật của quán (bước 15 sổ tay — [ADR-016](../quyết-định/ADR-016-trien-khai-van-hanh.md): máy tại quán là chính, VPS dự phòng).

| Tài liệu | Dùng khi |
| --- | --- |
| [local-development.md](local-development.md) | Cài và chạy trên máy phát triển, biến môi trường, lệnh test |
| [release-plan.md](release-plan.md) | Phát hành bản mới, quay lui khi lỗi, nhật ký phát hành |
| [deployment-checklist.md](deployment-checklist.md) | Cài máy chủ tại quán (A) hoặc VPS dự phòng (B), kiểm thử khói |
| [secrets-register.md](secrets-register.md) | Danh sách mật khẩu / khóa: ai giữ, đổi khi nào, đổi thế nào |
| [backup-restore.md](backup-restore.md) | Thiết lập sao lưu, diễn tập và khôi phục, nhật ký diễn tập |
| [monitoring.md](monitoring.md) | Máy tự kiểm 15 phút / lần, việc xem đầu ngày, việc hằng tháng |
| [incident-runbook.md](incident-runbook.md) | Khi có sự cố: mức độ, người trực, bán bằng giấy, kịch bản S1…S11 |
| [agent-prompts.md](agent-prompts.md) | Giao việc cho agent |

**Lệnh vận hành** (máy chạy thật — đọc `.env` như app):

| Lệnh | Bấm đúp tương đương | Làm gì |
| --- | --- | --- |
| `npm run db:backup` (`-- --label <nhãn>`) | `hướng-dẫn/9-sao-lưu-ngay.cmd` | Sao lưu CSDL + ảnh hóa đơn vào `BACKUP_DIR`, chép ra `BACKUP_COPY_DIR`, dọn bản cũ |
| `npm run db:restore -- --drill` | — | Diễn tập: khôi phục vào CSDL riêng rồi xóa |
| `npm run db:restore -- --to <CSDL> <file.bak> [--replace]` | — | Khôi phục thật (cần quyền quản trị SQL Server) |
| `npm run ops:health` | `hướng-dẫn/10-kiểm-tra-hệ-thống.cmd` | Kiểm tra app + CSDL, ổ đĩa, sao lưu, job nền, dung lượng CSDL |
| — | `hướng-dẫn/11-chạy-máy-chủ-quán.cmd` | Chạy app, ghi nhật ký `nhật-ký/server-YYYYMMDD.log` (Task Scheduler gọi khi bật máy) |
