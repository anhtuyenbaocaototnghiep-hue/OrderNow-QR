# TASK-044 — Dự báo nhập hàng
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-029 (AC-029-01…04)
Nguồn: skill `advanced-features` §4 F-029 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-22 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Quản lý biết nên đặt bao nhiêu gói mỗi nguyên liệu trước ngày giao kế tiếp: dự báo tiêu thụ theo thứ trong tuần, trừ tồn khả dụng và hàng đang về, cộng tồn an toàn; tạo PO nháp từ đề xuất. Quầy được cảnh báo nguyên liệu sẽ hết trước ngày giao.

## Phạm vi
- Migration `0024_du_bao_nhap.sql` (`DemandForecasts`, Settings `forecast.safety_percent = 20`).
- Backend:
  - hàm thuần `wmaForecast`, `replenishment`, `nextDeliveryDate` (`src/domain/inventory.js`): trung bình trượt 4 tuần 0,4 / 0,3 / 0,2 / 0,1 × (1 + hao hụt định mức), bỏ ngày quán đóng cửa;
  - `forecastService` / `forecastRepo`;
  - route `GET /api/admin/inventory/replenishment`, `POST /api/admin/purchase-orders/from-suggestion`, `GET /api/admin/inventory/forecast/:ingredientId`.
- Job: `demand-forecast` 02:00 (MERGE, idempotent), `runout-alert` 06:05 → realtime `inventory.runout`.
- UI: Nhà cung cấp & đặt hàng → tab **Đề xuất nhập hàng** (dòng đỏ, "Không đủ dữ liệu", **Tạo đơn đặt hàng từ dòng đã chọn**, biểu đồ SVG, **Tính lại dự báo**).

## Phụ thuộc
TASK-037 (bộ lập lịch), TASK-041 (hao hụt định mức), TASK-043 (nhà cung cấp, PO đang về).

## Validation
`inventory-unit.test.js` → "Dự báo nhập hàng (F-029)" (3 test), `inventory2.test.js` → "Dự báo nhập hàng (F-029)" (1 test); E2E "kho nâng cao…" (tab Đề xuất nhập hàng); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-029, ADR-006); hướng dẫn `chức-năng-mới/16-kho-nâng-cao.md`.
