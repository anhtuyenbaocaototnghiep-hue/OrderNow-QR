# FEATURE-027 — Bán thành phẩm / BOM 2 cấp / phiếu sơ chế

> **Nguồn:** skill `advanced-features` §4 F-027. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-19.

- **Status:** CONFIRMED (ADR-006 D-19) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN khai báo bán thành phẩm + công thức; STAFF pha mẻ ở quầy.
- **Màn hình:**
  - **Quản lý → Kho nguyên liệu:**
    - **Kho nâng cao** → loại "Bán thành phẩm", "Dùng trong … giờ";
    - **Công thức**: một mẻ ra bao nhiêu + nguyên liệu đầu vào.
  - **Quầy → Kho & sơ chế → tab Sơ chế:**
    - chọn bán thành phẩm, số mẻ (×2 = pha 2 mẻ);
    - xem trước nguyên liệu sẽ trừ (đủ / thiếu), giá vốn ước tính;
    - bấm **Hoàn tất mẻ**;
    - danh sách mẻ hôm nay; cảnh báo "Nên pha thêm" khi dưới ngưỡng.
- **Dữ liệu:** migration `0020_ban_thanh_pham.sql`:
  - `Ingredients.Kind ('RAW'|'SEMI')`, `ShelfLifeHours`;
  - `SemiRecipes`, `SemiRecipeLines`;
  - `PrepBatches(OutputQty, TotalCost, UnitCost, ExpiresAt…)`;
  - `InventoryTransactions.Type` thêm `PREP_OUT`/`PREP_IN`, `PrepBatchId`.
- **SP:** `sp_PostPrepBatch` (mới).

## Quy tắc (D-19)

1. BOM món trỏ vào bán thành phẩm **như nguyên liệu thường**. Giữ kho / trừ kho / tự hết món / giá vốn không đổi cách tính.
2. **Công thức:**
   - bán thành phẩm dùng được bán thành phẩm khác, lồng tối đa **3 cấp**;
   - **cấm vòng lặp** → `400 RECIPE_CYCLE` / `RECIPE_TOO_DEEP`;
   - không tự dùng chính nó.
3. **Một mẻ = một transaction**:
   - khóa nguyên liệu theo `IngredientId` tăng dần;
   - kiểm đủ khả dụng (tồn − đang giữ − lô hết hạn), thiếu → `409 PREP_SHORT` kèm tên, không đổi gì;
   - trừ đầu vào (`PREP_OUT`, giá vốn AVG/FIFO), cộng đầu ra `OutputQty × hệ số` (`PREP_IN`);
   - giá vốn mẻ = Σ giá vốn đầu vào; giá đơn vị = tổng ÷ đầu ra; `AvgCost` bán thành phẩm bình quân lại;
   - bán thành phẩm theo lô → tạo lô hạn = lúc pha + `ShelfLifeHours` (F-028).
4. Nguyên liệu đang kiểm kê (phiếu nháp) → `409 STOCKTAKE_LOCKED`.

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `PUT /api/admin/ingredients/{id}/advanced` | ADMIN | `{ kind, shelfLifeHours, wastePercent, trackLots }` |
| `GET` / `PUT /api/admin/ingredients/{id}/recipe` | ADMIN | `{ outputQty, instructions, lines[{ ingredientId, qty }] }` |
| `GET /api/prep/recipes` · `GET /api/prep/preview?semiId&multiplier` | STAFF+ | Danh sách bán thành phẩm; xem trước mẻ |
| `POST /api/prep/batches { semiIngredientId, multiplier, note }` | STAFF+ | → mẻ + nhật ký kho; realtime `inventory.prepared` |
| `GET /api/prep/batches?from&to` | STAFF+ | Mẻ trong kỳ |

## Acceptance Criteria

- AC-027-01: Công thức 100 g hạt + 1.000 ml nước → 900 ml cốt; pha ×2 → hạt −200, nước −2.000, cốt +1.800.
- AC-027-02: Thiếu hạt → 409, không đổi gì.
- AC-027-03: A dùng B dùng A → 400 `RECIPE_CYCLE`.
- AC-027-04: Bán ly cà phê có BOM 25 ml cốt → trừ cốt 25 ml; giá vốn ly = 25 × giá cốt.
- AC-027-05: Bất biến: mỗi mẻ Σ giá trị `PREP_OUT` = giá trị `PREP_IN` (`PREP_UNBALANCED`).

## Bằng chứng

- `tests/inventory-unit.test.js` → "Công thức sơ chế".
- `tests/inventory2.test.js` → "Bán thành phẩm…": 3 test.
- E2E "kho nâng cao…" (pha mẻ ở quầy).
