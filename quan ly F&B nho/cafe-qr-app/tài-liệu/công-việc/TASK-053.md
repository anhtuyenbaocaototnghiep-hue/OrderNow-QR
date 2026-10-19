# TASK-053 — Giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-042 (AC-042-01…04)
Nguồn: skill `advanced-features` §4 F-042 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 (dự báo dùng cách D-22) · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Chủ quán thấy giờ nào trong tuần đông nhất, doanh thu dự kiến 7 ngày tới, so sánh tuần / tháng này với kỳ trước, và bàn nào ngồi lâu mà doanh thu thấp — để xếp lịch làm, chuẩn bị nguyên liệu, sắp xếp bàn.

## Phạm vi
- Không migration (tính khi xem).
- Backend:
  - hàm thuần `heatmapMatrix`, `revenueForecast` (trung bình có trọng số 4 cùng thứ 0,4 / 0,3 / 0,2 / 0,1 ± 1 độ lệch chuẩn), `pctChange`, `flagTables` (`src/domain/analytics.js`); giờ quán UTC+7, hàng 0 = Thứ Hai;
  - route `GET /api/admin/reports/heatmap`, `GET /api/admin/reports/revenue-forecast`, `GET /api/admin/reports/compare`, `GET /api/admin/reports/tables`.
- UI: trang Phân tích & menu engineering → tab Giờ cao điểm (bảng 7 × 24 tô màu), Dự báo doanh thu (SVG tự vẽ, không Chart.js), So sánh kỳ, Theo bàn.

## Phụ thuộc
TASK-048 (doanh thu thuần), TASK-044 (cách dự báo D-22), TASK-052 (trang Phân tích).

## Validation
`analytics.test.js` → unit "heatmap 7×24 … dự báo WMA … cờ bàn" + integration 4 test (heatmap, dự báo doanh thu, so sánh tuần, theo bàn); E2E "phân tích + dashboard…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-042, ADR-006); hướng dẫn `chức-năng-mới/23-phân-tích-và-menu-engineering.md`.
