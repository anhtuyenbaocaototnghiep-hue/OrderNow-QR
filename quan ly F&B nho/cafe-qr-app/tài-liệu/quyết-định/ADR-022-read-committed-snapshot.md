# ADR-022 — Bật READ_COMMITTED_SNAPSHOT để hết deadlock đọc – ghi

- **Trạng thái:** ACCEPTED (29/10/2026). Chủ dự án chọn "trị gốc deadlock bằng READ_COMMITTED_SNAPSHOT, viết ADR mới rồi chạy lại toàn bộ test" (góp ý xây dựng nhóm 4).
- **Bối cảnh:** hai lần gặp `HTTP 500` do SQL Server chọn **lệnh đọc** làm nạn nhân deadlock (`1205`) khi lệnh ghi chạy cùng lúc: DEF-018 (`GET /api/tables` khi khách gửi đơn), DEF-019 (`GET /api/sessions/{id}` khi quầy thu tiền). Cả hai đã vá bằng `withDeadlockRetry` từng chỗ. Ở chế độ mặc định (READ COMMITTED dùng khóa), lệnh đọc phải xin khóa chia sẻ và chờ / tranh khóa với lệnh ghi — quán đông, nhiều điện thoại cùng tải trang thì còn nhiều lệnh đọc khác có thể gặp.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-83 | Bật **`READ_COMMITTED_SNAPSHOT ON`** cho database của app (dev, test, máy quán). Lệnh đọc ở mức READ COMMITTED đọc **bản đã commit gần nhất** (row versioning trong tempdb) thay vì chờ khóa → đọc không còn chặn / deadlock với ghi. Các đoạn cần khóa thật vẫn giữ gợi ý khóa đang có (`UPDLOCK`, `HOLDLOCK`, `READPAST` trong SP giữ kho, thu tiền, xóa tài khoản, nhận hàng đợi email…) — những gợi ý này vẫn khóa như cũ. `withDeadlockRetry` giữ lại (lệnh ghi vẫn có thể deadlock với nhau). Bật bằng bước riêng trong `kịch-bản/db-migrate.js` (`ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE`) — không đặt trong file migration vì migration chạy trong transaction; đã bật thì bỏ qua. |

## Không chọn

- Tiếp tục vá `withDeadlockRetry` từng lệnh đọc: chỉ sửa chỗ đã gặp, lệnh đọc khác vẫn có thể 500.
- `SNAPSHOT` isolation cho từng transaction: phải sửa từng chỗ gọi, dễ quên; RCSI áp cho mọi lệnh đọc mà không đổi code.
- `NOLOCK` / `READ UNCOMMITTED`: đọc dữ liệu chưa commit (tiền, kho sai tạm thời) — không chấp nhận cho POS.

## Hệ quả

- `db:migrate` bật RCSI ở lần chạy đầu sau bản này. `WITH ROLLBACK IMMEDIATE` cắt các kết nối khác đang mở transaction → **dừng app trước khi migrate** (đã là bước 3 của [release-plan.md](../vận-hành/release-plan.md) §4). Login không có quyền `ALTER DATABASE` → chỉ cảnh báo kèm lệnh để người quản trị chạy; app vẫn chạy như cũ.
- tempdb giữ phiên bản dòng (version store) — dữ liệu một quán nhỏ, không đáng kể.
- Toàn bộ test (`npm test`, E2E, ép tải giữ kho đồng thời NFR-002) chạy lại trên CSDL test đã bật RCSI.
- Task: [TASK-078](../công-việc/TASK-078.md). Lỗi liên quan: DEF-018, DEF-019 ([defect-log.md](../chất-lượng/defect-log.md)).
