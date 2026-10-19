# TASK-039 — Đổi đơn vị & giá vốn bình quân / FIFO
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-031 (AC-031-01…04)
Nguồn: skill `advanced-features` §4 F-031 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-21 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Nhập kho theo đơn vị đóng gói (thùng, lon…) mà tồn, BOM, kiểm kê vẫn theo đơn vị gốc. Giá vốn bình quân gia quyền cập nhật mỗi lần nhập; giá vốn dòng đơn chốt lúc hoàn tất, đơn cũ không bị tính lại.

## Phạm vi
- Migration `0019_don_vi_gia_von.sql` (`Units` + seed; `Ingredients.BaseUnitCode/AvgCost`; `StockReceiptLines.PackUnitCode/PackQty/PackPrice`; `InventoryTransactions.UnitCost/CostAmount`; `OrderItems.CogsAmount`; Settings `cost.method = AVG`).
- SP:
  - `sp_ReceiveStock` nhận `@LinesJson` (TVP cũ vẫn chạy), quy đổi gói và tính lại `AvgCost`;
  - `sp_CompleteOrder` ghi `UnitCost`/`CostAmount` trên dòng `DEDUCT` và chia `CogsAmount` cho dòng món;
  - `sp_AdjustInventory`, `sp_PostStocktake`, `sp_RefundPayment` ghi giá vốn trên dòng kho.
- Backend:
  - hàm thuần quy đổi đơn vị `factorToBase` (`src/domain/inventory.js`), `400 UNIT_MISMATCH`, cấm chuỗi quy đổi vòng lặp;
  - route `GET /api/admin/units`, `PUT`/`DELETE /api/admin/units/:code` (`409 IN_USE`), `POST /api/admin/stock-receipts` (dòng theo gói), `GET /api/admin/reports/cogs`; `costMethod` qua `PUT /api/admin/settings`.
- UI:
  - Nhập kho & kiểm kê: ô đơn vị trên phiếu nhập, tab **Đơn vị**, tab **Giá vốn thực tế**;
  - Kho nguyên liệu: "Giá vốn bình quân: …đ/đơn vị".

## Phụ thuộc
TASK-033 (nhập kho & kiểm kê, giá vốn — F-023), TASK-013 (hoàn tất & trừ kho).

## Validation
`inventory-unit.test.js` → "Đơn vị (F-031)" (1 test), `inventory2.test.js` → "Đơn vị & giá vốn bình quân (F-031)" (4 test); bất biến `COGS_MISMATCH`; E2E "kho nâng cao…" (tab Giá vốn thực tế); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-031, ADR-006); hướng dẫn `chức-năng-mới/16-kho-nâng-cao.md`.
