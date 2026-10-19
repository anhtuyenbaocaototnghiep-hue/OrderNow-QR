# TASK-041 — Hao hụt định mức & phiếu hủy hàng
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-032 (AC-032-01…03)
Nguồn: skill `advanced-features` §4 F-032 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Quầy ghi phiếu hủy (đổ vỡ, hết hạn, hỏng) có giá vốn; quản lý đặt hao hụt định mức theo nguyên liệu và xem báo cáo thất thoát, tô đỏ phần thất thoát bất thường. Không cho hủy vào phần đang giữ cho đơn.

## Phạm vi
- Migration `0021_hao_hut.sql` (`Ingredients.WastePercent`, `WasteLogs`, `InventoryTransactions.WasteId`).
- SP: mới `sp_LogWaste` (trừ tồn + `ADJUST` "WASTE:<lý do> — <ghi chú>" có giá vốn trong một transaction; `409 BELOW_RESERVED`, `409 STOCKTAKE_LOCKED`; dùng lại cho hủy lô — F-028).
- Backend:
  - công thức thất thoát `lossAnalysis` (`src/domain/inventory.js`);
  - route `POST`/`GET /api/waste` (lý do `SPILL`, `EXPIRED`, `QUALITY`, `OTHER`), `GET /api/admin/reports/loss`.
- UI:
  - quầy Kho & sơ chế → tab **Hủy hàng**;
  - Kho nâng cao: "Hao hụt định mức (%)";
  - Nhập kho & kiểm kê → tab **Thất thoát**.

## Phụ thuộc
TASK-033 (kiểm kê), TASK-039 (giá vốn), TASK-040 (`PREP_OUT` tính vào tiêu thụ).

## Validation
`inventory-unit.test.js` → "Hao hụt định mức (F-032)" (1 test), `inventory2.test.js` → "Hao hụt định mức & phiếu hủy (F-032)" (2 test); E2E "kho nâng cao…" (phiếu hủy ở quầy); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-032, ADR-006); hướng dẫn `chức-năng-mới/16-kho-nâng-cao.md`.
