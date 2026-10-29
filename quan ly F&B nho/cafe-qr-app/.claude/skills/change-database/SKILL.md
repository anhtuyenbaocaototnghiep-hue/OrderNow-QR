---
name: change-database
description: Thêm/sửa bảng, index, constraint, stored procedure hoặc cách ghi dữ liệu trên SQL Server của cafe-qr-app; dùng khi task chạm cơ-sở-dữ-liệu/chuyển-đổi, cơ-sở-dữ-liệu/thủ-tục hoặc data-model.md.
---

# Mục đích
Thay đổi schema/SP an toàn, có migration, giữ invariant kho (BR-001, BR-002) và đồng bộ data-model.

## Khi dùng
Tạo/sửa bảng, cột, index, CHECK/UNIQUE, SP, kiểu bảng (TVP), seed. Không dùng cho query đọc đơn thuần.

## Điều kiện trước
- SQL Server dev chạy (docker compose); lệnh migrate/seed đã xác minh trong local-development.md.
- Đã đọc `tài-liệu/kiến-trúc/data-model.md` (phần SP, "Ghi chú đối chiếu", bảng mã lỗi); biết phương án Q-001 đang áp dụng (A/B/C) qua ADR
  trong `tài-liệu/quyết-định/`.

## Đầu vào
Task, feature/rule liên quan, DDL/SP hiện có trong `cơ-sở-dữ-liệu/`, truy vấn dự kiến (để quyết định index).

## Quy trình
1. Mô tả thay đổi bằng lời: bảng/cột/ràng buộc nào, vì sao, ảnh hưởng dữ liệu cũ (drop/rename/convert?).
2. Viết migration mới `cơ-sở-dữ-liệu/chuyển-đổi/NNNN_<mo-ta>.sql` (số kế tiếp); KHÔNG sửa migration đã chạy.
   Migration phải chạy lại an toàn trên DB trống và trên DB đã có dữ liệu seed.
3. SP: sửa file trong `cơ-sở-dữ-liệu/thủ-tục/` với `CREATE OR ALTER`; giữ `SET XACT_ABORT ON`, một `BEGIN TRAN … COMMIT`,
   khóa `Ingredients` bằng `WITH (UPDLOCK, HOLDLOCK)` trước khi kiểm/ghi; `THROW` mã 5000x theo contract.
4. Không bỏ `CK_Ingredients_Stock`, `CK_Ingredients_Reserved`, `UX_InvTxn_Order_Ingredient`, `UX_Payments_Session`, `UX_Payments_Order`.
   Nếu thay đổi cần nới → đó là thay đổi nghiệp vụ, phải có ADR.
5. Index: chỉ thêm khi có truy vấn cụ thể; ghi truy vấn đó vào data-model.md cạnh index.
6. Chạy migrate trên DB dev từ trống; chạy seed; chạy lại lần 2 để chắc idempotent (migration framework bỏ qua file đã chạy).
7. Viết/chạy integration test SP: happy path; thiếu kho; đồng thời (≥ 10 luồng) — kiểm bất biến sau test:
   `StockQty >= 0`, `ReservedQty` khớp tổng đơn PENDING/PREPARING, mỗi (OrderId, IngredientId) ≤ 1 dòng DEDUCT.
8. Cập nhật `tài-liệu/kiến-trúc/data-model.md` (DDL, SP, lý do) và `api-contract.md` nếu mã lỗi đổi.

## Validation
- Lệnh migrate/seed/test thực chạy + kết quả. Test concurrency trên SQL Server thật; không mock DB.
- Nếu không có SQL Server trong môi trường agent: NOT_RUN và ghi rõ các lệnh để người khác chạy.

## Khi thất bại
- Deadlock trong test: kiểm thứ tự khóa (join theo IngredientId tăng dần), giữ transaction ngắn; app retry 1205.
- Database bật `READ_COMMITTED_SNAPSHOT` (ADR-022): lệnh đọc thường không chờ khóa / không thấy dữ liệu chưa commit — đoạn "đọc rồi ghi" cần đúng phải tự khóa (`UPDLOCK, HOLDLOCK`) như các SP hiện có. Lệnh `ALTER DATABASE` không đặt trong file migration (migration chạy trong transaction) — làm bước riêng trong `kịch-bản/db-migrate.js` như `ensureReadCommittedSnapshot`.
- CHECK constraint ném lỗi trong test: logic SP sai → sửa SP, không nới constraint.

## Đầu ra
Migration + SP + test + data-model.md cập nhật + báo cáo lệnh đã chạy.

## Không làm
Sửa migration cũ; chạy migration lên staging/prod ngoài quyền được giao; xóa dữ liệu thật; thêm index hàng loạt.

## Hoàn thành khi
Migrate từ trống OK; test SP (gồm concurrency) PASS; docs đồng bộ; constraint bảo vệ kho còn nguyên.
