# TASK-034 — Gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn
Status: READY_FOR_REVIEW (16/10/2026). Bằng chứng: `npm test` 109/109, `npm run test:e2e` 21/21, `npm run load` 10/10 (p95 105 ms) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-024 (AC-024-01…07)
Nguồn: yêu cầu chủ dự án 16/10/2026 · Mặc định chờ xác nhận: Q-021

## Mục tiêu
Khách không dùng QR vẫn gọi món được: nhân viên ra bàn hỏi món, nhập trên máy quầy vào đúng bàn. Nhân viên ghi chú bàn để nhớ (chỉ nhân viên thấy). Không phá luồng QR, thu tiền, kho.

## Phạm vi
- Migration `0014_goi_mon_tai_ban.sql` (`Sessions.OpenedBy/Note/NoteUpdatedAt/NoteUpdatedBy`).
- `sp_SubmitOrder @AcceptNow`; `sp_DeleteUser` tính cả người mở bàn / sửa ghi chú.
- Backend:
  - `sessionsRepo.openByStaff/setNote`;
  - `sessionService.tablesOverview/openTable/setNote`, `customerView`;
  - `orderService.submitByStaff`;
  - route `GET /api/tables`, `POST /api/tables/:id/sessions`, `POST /api/sessions/:id/orders`, `PUT /api/sessions/:id/note`.
- UI:
  - trang mới `/pos/table-order` (S-16);
  - dashboard: ghi chú, nút Gọi món, phiếu "Nhân viên nhập", `?settle=`.

## Phụ thuộc
TASK-023…033 (pricing, tùy chọn món, combo, ca).

## Validation
`table-order.test.js` (11 test), E2E "gọi món tại bàn", chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format.

## Đầu ra
Code + test + docs đồng bộ; mục "Cập nhật — gọi món tại bàn" trong `tài-liệu/chất-lượng/handover-2026-10-16.md`; hướng dẫn `chức-năng-mới/13-gọi-món-tại-bàn.md`.
