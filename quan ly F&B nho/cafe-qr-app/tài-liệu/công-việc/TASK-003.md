# TASK-003 — Migration 0001_init, script migrate/seed
Status: READY_FOR_REVIEW (14/10/2026). Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: — (nền cho mọi feature)
Story: —
Owner: Nhật Anh · Tuần: 1–2

## Mục tiêu
Tạo được DB dev từ trống bằng một lệnh và seed dữ liệu mẫu dùng chung cho test.

## Phạm vi và phần chưa làm
Trong:
- `cơ-sở-dữ-liệu/chuyển-đổi/0001_init.sql` theo DDL ở data-model, điều chỉnh theo ADR-001; xử lý ghi chú đối chiếu #1 (comment `OrderCode`) và #7 (collation CI).
- Kiểu bảng `dbo.OrderItemInput`.
- Script migrate (có bảng lịch sử, bỏ qua file đã chạy) và seed `cơ-sở-dữ-liệu/seed/seed_dev.sql`: admin từ `ADMIN_SEED_USERNAME`/`ADMIN_SEED_PASSWORD` (lưu hash), 2 danh mục, 8 món, 6 nguyên liệu, BOM mẫu, 6 bàn.
- Bộ dữ liệu đơn mẫu 01–10/10/2026 cho AC-012-01 (có thể tách thành seed riêng).

Ngoài:
- Stored procedures (TASK-004).

## Context cần đọc
- `tài-liệu/kiến-trúc/data-model.md`
- `tài-liệu/nghiệp-vụ/business-rules.md` (BR-001…004, BR-015)
- `tài-liệu/vận-hành/local-development.md`
- skill `change-database`

## Skill
change-database

## Acceptance Criteria
- Migrate trên DB trống thành công; chạy lại lần 2 không lỗi.
- Seed tạo đủ dữ liệu như phạm vi.
- Có đủ các constraint/index bảo vệ: `CK_Ingredients_Stock`, `CK_Ingredients_Reserved` (nếu A), `UX_InvTxn_Order_Ingredient`, `UX_Payments_Session`, `UX_Payments_Order`, `UX_Users_Username` (CI).

## Dependencies
TASK-002, Q-001

## Ràng buộc
Không sửa migration đã chạy; không nới constraint.

## Validation
Thực chạy migrate/seed; truy vấn `sys.check_constraints` và `sys.indexes` để kiểm; ghi lệnh vào `tài-liệu/vận-hành/local-development.md`.

## Đầu ra
`cơ-sở-dữ-liệu/chuyển-đổi/`, `cơ-sở-dữ-liệu/seed/`, script migrate/seed, data-model và local-development cập nhật. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-001, Q-011 (số liệu kho ban đầu).
