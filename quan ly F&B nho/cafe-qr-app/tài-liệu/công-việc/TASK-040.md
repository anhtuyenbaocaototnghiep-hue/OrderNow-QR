# TASK-040 — Bán thành phẩm / BOM 2 cấp / phiếu sơ chế
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-027 (AC-027-01…05)
Nguồn: skill `advanced-features` §4 F-027 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-19 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Quán pha sẵn bán thành phẩm (cốt cà phê, syrup…) theo công thức; quầy ghi phiếu sơ chế để trừ nguyên liệu đầu vào và cộng bán thành phẩm. BOM món trỏ vào bán thành phẩm như nguyên liệu thường, nên giữ kho / trừ kho / tự hết món / giá vốn không đổi cách tính.

## Phạm vi
- Migration `0020_ban_thanh_pham.sql` (`Ingredients.Kind ('RAW'|'SEMI')/ShelfLifeHours`, `SemiRecipes`, `SemiRecipeLines`, `PrepBatches`; `InventoryTransactions.Type` thêm `PREP_OUT`/`PREP_IN`, cột `PrepBatchId`).
- SP: mới `sp_PostPrepBatch` (một mẻ một transaction, khóa nguyên liệu theo `IngredientId` tăng dần, thiếu → `409 PREP_SHORT`, đang kiểm kê → `409 STOCKTAKE_LOCKED`).
- Backend:
  - kiểm công thức `checkRecipeGraph` (`src/domain/inventory.js`): vòng lặp → `400 RECIPE_CYCLE`, quá 3 cấp → `400 RECIPE_TOO_DEEP`;
  - route `PUT /api/admin/ingredients/:id/advanced`, `GET`/`PUT /api/admin/ingredients/:id/recipe`, `GET /api/prep/recipes`, `GET /api/prep/preview`, `GET`/`POST /api/prep/batches`;
  - realtime `inventory.prepared`.
- UI:
  - Kho nguyên liệu → **Kho nâng cao** (loại "Bán thành phẩm", hạn dùng theo giờ) + **Công thức**;
  - trang quầy mới `/pos/stock` "Kho & sơ chế" (S-17), tab Sơ chế (xem trước, **Hoàn tất mẻ**, mẻ hôm nay).

## Phụ thuộc
TASK-007 (BOM), TASK-039 (giá vốn).

## Validation
`inventory-unit.test.js` → "Công thức sơ chế (F-027)" (1 test), `inventory2.test.js` → "Bán thành phẩm / phiếu sơ chế (F-027)" (3 test); bất biến `PREP_UNBALANCED`; E2E "kho nâng cao…" (pha mẻ ở quầy); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-027, ADR-006); hướng dẫn `chức-năng-mới/16-kho-nâng-cao.md`.
