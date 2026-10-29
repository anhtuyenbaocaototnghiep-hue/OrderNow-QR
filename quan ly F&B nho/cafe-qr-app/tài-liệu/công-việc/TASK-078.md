# TASK-078 — Trị gốc deadlock (READ_COMMITTED_SNAPSHOT), sửa DEF-014, phiếu chốt câu hỏi G1
Status: READY_FOR_REVIEW (29/10/2026)
Quyết định: [ADR-022](../quyết-định/ADR-022-read-committed-snapshot.md) D-83 · Lỗi: DEF-014, DEF-018, DEF-019
Nguồn: chủ dự án 29/10/2026 chọn nhóm 4 của góp ý xây dựng (quy trình và kỹ thuật). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-078-rcsi-def014` tách từ `main` (`v1.0.0-rc.2`)

## Phạm vi
1. `kịch-bản/db-migrate.js`: bật `READ_COMMITTED_SNAPSHOT` sau migration + thủ tục (bỏ qua nếu đã bật; thiếu quyền → cảnh báo).
2. DEF-014: trang Phân tích (hàng tab) và Lãi / lỗ (cột `.grid-2`) không cuộn ngang ở 320 / 390 px; kiểm hồi quy trong `a11y.spec.js`.
3. [Phiếu chốt câu hỏi G1](../chất-lượng/phieu-chot-cau-hoi-G1.md) cho buổi họp nhóm: Q-000, Q-019…Q-022 — agent **không** tự chốt / ký.
4. Gom thư mục làm việc (worktree): chỉ khảo sát + đề xuất, **không xóa** khi chủ dự án chưa đồng ý.

## Không được sửa
- Gợi ý khóa trong SP (`UPDLOCK`, `HOLDLOCK`, `READPAST`); `withDeadlockRetry` hiện có.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load:report` · `npm run trace -- --check` (tất cả trên CafeQrTest đã bật RCSI) · `npm run db:migrate` (CafeQrDev — dừng app trước).

## Kết quả (29/10/2026)
| Lệnh / việc | Kết quả |
| --- | --- |
| Quyền | Login `cafe_app` là `db_owner`, có `ALTER DATABASE` → bật được RCSI không cần tài khoản quản trị |
| `npm test` (CafeQrTest **đã bật RCSI**) | **355/355 PASS** |
| `npm run test:e2e` | **54/54 PASS** (gồm kiểm hồi quy DEF-014 trong dự án a11y); nhật ký máy chủ E2E **0 dòng deadlock** |
| `npm run load:report` | NFR-002 **10/10 vòng PASS** (giữ kho đồng thời vẫn đúng: mỗi vòng đúng 1 đơn nhận, 29 đơn `OUT_OF_STOCK`), NFR-001 p95 362 ms |
| `npm run trace -- --check` | 144 US, 375 AC — PASS 375, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| DEF-014 | Đo Playwright trước sửa: `scrollWidth` 441 (Phân tích), 638 (Lãi / lỗ) ở 320 / 390 px; sau sửa: bằng bề ngang màn |
| Phiếu chốt câu hỏi | [phieu-chot-cau-hoi-G1.md](../chất-lượng/phieu-chot-cau-hoi-G1.md) — chờ nhóm họp, agent không chốt |
| Gom thư mục làm việc | Khảo sát: 5 worktree cũ (`cafe-qr-app` nhánh TASK-069, `-release`, `-task070…072`) sạch, đã nằm trong `main` — chờ chủ dự án đồng ý mới xóa |
