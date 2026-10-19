# TASK-046 — Sổ quỹ (thu / chi tiền mặt ngoài bán hàng)
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-033 (AC-033-01…05)
Nguồn: skill `advanced-features` §4 F-033 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-23 · Lệch docs: Q-022 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Ghi mọi khoản chi / thu tiền mặt ngoài bán hàng (mua đá, trả shipper, bổ sung tiền lẻ…) vào ca đang mở, có lý do, danh mục, ảnh hóa đơn; khoản lớn chờ trưởng ca / quản lý duyệt. Tiền dự kiến trong két lúc chốt ca tính cả sổ quỹ.

## Phạm vi
- Migration `0026_so_quy.sql` (`CashCategories` + seed 7 danh mục chi, 2 danh mục thu; `CashTransactions`; Setting `cash.approve_threshold = 500000`).
- SP (file `sp_CashTransactions.sql`, `sp_CloseShift.sql`):
  - `sp_CreateCashTxn`: khóa S trên ca đang mở → chạy tuần tự với `sp_CloseShift`;
  - `sp_ReviewCashTxn`: hai người cùng duyệt → người sau `409 CASH_NOT_PENDING`;
  - `sp_CloseShift` viết lại: `ExpectedCash` gồm thu khác / chi đã duyệt; còn khoản chờ → `409 CASH_PENDING`.
- Backend:
  - `cashService` / `cashRepo`; không tự duyệt khoản của mình (`403 SELF_APPROVAL`, trừ quản lý);
  - ảnh hóa đơn gửi thẳng thân request (không multipart — ADR-006), kiểm chữ ký file, ≤ 2 MB, lưu dưới `UPLOADS_DIR`;
  - CSV `src/utils/csv.js` (BOM UTF-8, chặn công thức Excel);
  - route `/api/cash-categories`, `/api/cash-transactions` (+ `receipt`, `approve`, `reject`), `/api/admin/cash-transactions` (+ `export.csv`), `/api/admin/cash-categories`; realtime `cash.created`, `cash.reviewed`.
- UI:
  - Ca & hoàn tiền: thẻ "Sổ quỹ trong ca" (Chi tiền / Thu khác, Duyệt / Từ chối / Gắn ảnh / 🧾 Ảnh), ô "Chi quỹ (đã duyệt)";
  - phiếu chốt ca in kèm bảng thu chi;
  - trang mới `/admin/cash` "Sổ quỹ" (lọc, tổng theo danh mục, Xuất CSV) + tab "Danh mục thu chi".

## Phụ thuộc
TASK-029 (chốt ca), TASK-045 (trưởng ca duyệt).

## Validation
`finance.test.js` → "Sổ quỹ (F-033)" (10 test, gồm ảnh > 2 MB / không phải ảnh, đóng ca có khoản chờ), `finance-unit.test.js` → "CSV (F-033)"; bất biến `SHIFT_EXPECTED_CASH`, `CLOSED_SHIFT_CASH_PENDING`; E2E "trưởng ca + sổ quỹ…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-033, ADR-006); hướng dẫn `chức-năng-mới/18-sổ-quỹ.md`.
