# TASK-002 — Khởi tạo backend Node.js + Express (D-4)
Status: READY_FOR_REVIEW (14/10/2026) — Express 5 + Socket.io + mssql theo ADR-002. Bằng chứng: `npm test` 39/39, `npm run test:e2e` 14/14, `npm run load` 10/10 (14/10/2026) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: —
Story: —
Owner: Nhật Anh · Tuần: 1

## Mục tiêu
`ứng-dụng/máy-chủ` chạy được, cấu trúc module theo system-overview, có health endpoint kiểm kết nối SQL Server và cơ chế map lỗi chuẩn.

## Phạm vi và phần chưa làm
Trong:
- Node.js + Express (ADR-002): `routes/` → `services/` → `repositories/` (gọi SP), `realtime/`, `middleware/`; serve FE tĩnh; Socket.io gắn cùng HTTP server.
- Module rỗng theo mapping: `orders`, `sessions`, `payments`, `inventory`, `menu`, `auth`, `users`, `reports`, `tables`, `realtime`.
- `GET /api/health` trả trạng thái DB.
- Filter/middleware chuyển lỗi nghiệp vụ → `{ code, message, details }` và map mã lỗi SP 5000x theo bảng ở data-model.
- Đọc cấu hình từ biến môi trường.

Ngoài:
- Auth thật, endpoint nghiệp vụ.

## Context cần đọc
- `tài-liệu/kiến-trúc/system-overview.md` (tầng, mapping module)
- `tài-liệu/kiến-trúc/tech-stack.md`
- `tài-liệu/kiến-trúc/data-model.md` (bảng mã lỗi SP)
- `tài-liệu/kiến-trúc/api-contract.md` (quy ước chung)

## Skill
—

## Acceptance Criteria
- Health trả 200 khi DB sẵn sàng và 503 khi không kết nối được.
- Lỗi `OUT_OF_STOCK` ném từ service được map thành `409 { code: "OUT_OF_STOCK" }` (unit test).
- Controller không truy cập DB trực tiếp (review).

## Dependencies
TASK-001 (Q-002 đã chốt — ADR-002)

## Ràng buộc
Không đổi stack trong task; giữ tầng controller → service → repository/SP.

## Validation
Unit test map lỗi; chạy app và gọi health; ghi lệnh vào `tài-liệu/vận-hành/local-development.md`.

## Đầu ra
`ứng-dụng/máy-chủ`, test, local-development cập nhật. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Không (Q-002 đã chốt — ADR-002).
