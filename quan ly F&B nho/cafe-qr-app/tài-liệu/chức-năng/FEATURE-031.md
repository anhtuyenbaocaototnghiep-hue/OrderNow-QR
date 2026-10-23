# FEATURE-031 — Đổi đơn vị & giá vốn bình quân / FIFO

> **Nguồn:** skill `advanced-features` §4 F-031. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-21.

- **Status:** CONFIRMED (ADR-006 D-21) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN (đơn vị, phiếu nhập, báo cáo); hệ thống chốt giá vốn lúc hoàn tất đơn.
- **Màn hình:**
  - **Quản lý → Nhập kho & kiểm kê:**
    - phiếu nhập có ô **đơn vị** (gốc hoặc đơn vị quy đổi được, ví dụ "2 thùng" sữa);
    - tab **Đơn vị** (1 thùng = 24 lon, 1 lon = 330 ml…);
    - tab **Giá vốn thực tế** (theo món: SL, doanh thu, giá vốn, biên %; theo nguyên liệu).
  - **Kho nguyên liệu:** mỗi dòng ghi "Giá vốn bình quân: …đ/đơn vị".
- **Dữ liệu:** migration `0019_don_vi_gia_von.sql`:
  - `Units(UnitCode NVARCHAR(10), Name, BaseUnitCode, Factor)`. Seed: ml, g, cái, miếng, l, kg, lon, thùng + mọi đơn vị nguyên liệu đang dùng.
  - `Ingredients.BaseUnitCode` (= `Unit`), `AvgCost`.
  - `StockReceiptLines.PackUnitCode/PackQty/PackPrice`.
  - `InventoryTransactions.UnitCost/CostAmount`.
  - `OrderItems.CogsAmount`.
  - Settings `cost.method = AVG`.
- **SP:**
  - `sp_ReceiveStock`: nhận `@LinesJson`; TVP cũ vẫn chạy.
  - `sp_CompleteOrder`, `sp_AdjustInventory`, `sp_PostStocktake`, `sp_RefundPayment`: ghi giá vốn trên dòng kho.

## Quy tắc

1. **Đơn vị gốc:** tồn, BOM, kiểm kê luôn theo đơn vị gốc của nguyên liệu.
   - Nhập theo đơn vị đóng gói → quy đổi theo chuỗi `Units` (thùng → lon → ml): `qty = packQty × hệ số`, `giá gốc = packPrice ÷ hệ số`.
   - Không quy về được → `400 UNIT_MISMATCH`.
   - Chuỗi quy đổi không được vòng lặp.
2. **Giá vốn bình quân khi nhập:**
   - `AvgCost = (tồn × AvgCost + nhập × giá) / (tồn + nhập)`.
   - Tồn cũ chưa có giá (`AvgCost = 0`) hoặc tồn ≤ 0 → lấy giá nhập.
   - Dòng không có giá → giữ `AvgCost`.
3. **Hoàn tất đơn:**
   - mỗi dòng `DEDUCT` ghi `UnitCost` (AVG, hoặc giá lô khi `cost.method = FIFO` và nguyên liệu theo lô — F-028) và `CostAmount`;
   - tổng giá vốn đơn chia cho dòng món theo trọng số (định lượng × giá vốn), gồm thành phần combo và định lượng tùy chọn → `OrderItems.CogsAmount`;
   - phần dư làm tròn dồn vào dòng lớn nhất, nên Σ dòng = tổng giá vốn đơn;
   - có nguyên liệu chưa biết giá → `CogsAmount = NULL` ("chưa biết giá").
4. **Đơn cũ không bị tính lại** khi giá nhập đổi.

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/admin/units` · `PUT /api/admin/units/{code}` · `DELETE …` | `{ name, baseUnitCode?, factor? }`; đang dùng → `409 IN_USE` |
| `POST /api/admin/stock-receipts` | Dòng: `{ ingredientId, qty, unitCost }` **hoặc** `{ ingredientId, packUnitCode, packQty, packPrice }` (+ `expiryDate`, `lotCode` — F-028) |
| `GET /api/admin/reports/cogs?from&to` | `{ items[{ name, qty, revenue, cogs, unknownQty, marginPct }], ingredients[{ name, qty, cost }] }` |
| `PUT /api/admin/settings` | `costMethod: 'AVG' \| 'FIFO'` |

## Acceptance Criteria

- AC-031-01: Nhập 1 thùng (24 lon × 330 ml) → tồn +7.920 ml; giá 792.000đ/thùng → 100đ/ml.
- AC-031-02: AvgCost đúng sau 2 lần nhập giá khác (100 rồi 200 → 125 với tồn 2.000 + 1.000 + 1.000).
- AC-031-03: Hoàn tất ly cà phê → `CogsAmount = 25 ml × giá cốt + 10 g × giá đường`; giá đổi sau đó không làm đổi đơn cũ.
- AC-031-04: Bất biến: Σ `CogsAmount` của đơn = Σ `CostAmount` các dòng DEDUCT (`COGS_MISMATCH`).
- AC-031-05: Nhập kho theo đơn vị không quy được về đơn vị gốc (ví dụ "kg" cho Sữa tươi tính theo ml) → 400 `UNIT_MISMATCH`. _(bổ sung — TASK-057, 20/10/2026)_
- AC-031-06: Khai đơn vị tạo vòng quy đổi (ml → hộp1l → ml) → 400; xóa đơn vị đang dùng ("ml") → 409 `IN_USE`; xóa đơn vị chưa dùng → thành công. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/inventory-unit.test.js` → "Đơn vị".
- `tests/inventory2.test.js` → "Đơn vị & giá vốn bình quân (F-031)": 4 test.
- E2E "kho nâng cao…" (tab Giá vốn thực tế).
