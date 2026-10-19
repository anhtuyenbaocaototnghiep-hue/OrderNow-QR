# FEATURE-032 — Hao hụt định mức & phiếu hủy hàng

> **Nguồn:** skill `advanced-features` §4 F-032. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md).

- **Status:** CONFIRMED (ADR-006) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** STAFF ghi phiếu hủy; ADMIN đặt định mức + xem báo cáo.
- **Màn hình:**
  - **Quầy → Kho & sơ chế → Hủy hàng:**
    - nguyên liệu, số lượng, lý do (đổ/vỡ, hết hạn, hỏng, khác), ghi chú;
    - danh sách phiếu hủy hôm nay.
  - **Quản lý → Kho nguyên liệu → Kho nâng cao:** "Hao hụt định mức (%)".
  - **Quản lý → Nhập kho & kiểm kê → tab Thất thoát:** theo nguyên liệu, gồm:
    - tiêu thụ;
    - định mức;
    - hủy đã ghi;
    - hụt kiểm kê;
    - chênh lệch;
    - **thất thoát bất thường** (tô đỏ) và giá trị.
- **Dữ liệu:** migration `0021_hao_hut.sql`:
  - `Ingredients.WastePercent`;
  - `WasteLogs(IngredientId, Qty, Reason, Note, CostAmount, CreatedBy…)`;
  - `InventoryTransactions.WasteId`.
- **SP:** `sp_LogWaste` (mới; cũng dùng để hủy lô — F-028).

## Quy tắc

1. **Phiếu hủy** trừ tồn + `InventoryTransactions(ADJUST, Reason 'WASTE:<lý do> — <ghi chú>', WasteId)` có giá vốn, trong một transaction.
   - Không hủy vào phần đang giữ cho đơn → `409 BELOW_RESERVED`.
   - Nguyên liệu đang kiểm kê → `409 STOCKTAKE_LOCKED`.
   - Lý do ngoài danh sách → 400.
2. **Báo cáo theo kỳ, từng nguyên liệu:**
   - tiêu thụ lý thuyết = Σ `DEDUCT` + `PREP_OUT`;
   - định mức = tiêu thụ × `WastePercent`;
   - chênh lệch = hụt kiểm kê + hủy đã ghi;
   - **thất thoát bất thường** = chênh lệch − định mức − hủy đã ghi (tức hụt kiểm kê − định mức, ≥ 0).
   - Tô đỏ khi > 0 **và** > 2 % tiêu thụ.
3. Dự báo nhập hàng (F-029) nhân `(1 + WastePercent)`.

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `POST /api/waste { ingredientId, qty, reason, note }` | STAFF+ | `reason ∈ SPILL, EXPIRED, QUALITY, OTHER` |
| `GET /api/waste?from&to` | STAFF+ | Phiếu hủy trong kỳ |
| `GET /api/admin/reports/loss?from&to` | ADMIN | `[{ consumption, standard, loggedWaste, stocktakeShortage, gap, abnormal, flagged, abnormalValue }]` |

## Acceptance Criteria

- AC-032-01: WastePercent 5 %, tiêu thụ 1.000 ml, kiểm kê thiếu 40 ml → "bình thường".
- AC-032-02: Thiếu 120 ml → thất thoát 70 ml, tô đỏ.
- AC-032-03: Phiếu hủy trừ tồn + dòng ADJUST "WASTE:…"; hủy vượt phần khả dụng → 409.

## Bằng chứng

- `tests/inventory-unit.test.js` → "Hao hụt định mức".
- `tests/inventory2.test.js` → "Hao hụt định mức & phiếu hủy": 2 test.
- E2E "kho nâng cao…" (phiếu hủy ở quầy).
