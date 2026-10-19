# TASK-048 — Lãi / lỗ đơn giản & điểm hòa vốn
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-034 (AC-034-01…04)
Nguồn: skill `advanced-features` §4 F-034 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-31 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Chủ quán xem lãi / lỗ **ước tính** theo ngày hoặc tháng: doanh thu thuần − giá vốn − chi quỹ (danh mục chi phí) − chi phí cố định phân bổ theo ngày, cùng doanh thu hòa vốn mỗi ngày. Chỉ quản lý xem được.

## Phạm vi
- Migration `0028_lai_lo.sql` (`FixedCosts(Name, MonthlyAmount, EffectiveFrom, EffectiveTo)`).
- Backend:
  - `pnlService` / `pnlRepo` (công thức D-31; đơn chưa có giá vốn chốt → ước tính định lượng × giá vốn bình quân hiện tại, đếm `estimatedCogsRows`);
  - route `GET /api/admin/reports/pnl?from&to&groupBy=day|month` (tối đa ~13 tháng, sai khoảng → 400), `/api/admin/fixed-costs` (ngày kết thúc trước ngày bắt đầu → 400); trưởng ca → 403.
- UI: trang mới `/admin/pnl` "Lãi / lỗ" — nhãn "Ước tính" cố định, ô số, biểu đồ cột SVG tự vẽ kèm đường hòa vốn, bảng theo kỳ, chi quỹ theo danh mục, thẻ "Chi phí cố định / tháng".

## Phụ thuộc
TASK-039 (giá vốn dòng đơn), TASK-046 (chi quỹ), TASK-033 (hoàn tiền).

## Validation
`finance.test.js` → "Lãi / lỗ ước tính (F-034)" (4 test), `finance-unit.test.js` → "Lãi / lỗ (F-034, D-31)" (2 test); E2E "trưởng ca + sổ quỹ…" (trang Lãi / lỗ: nhãn Ước tính, biểu đồ); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-034, ADR-006); hướng dẫn `chức-năng-mới/20-lãi-lỗ.md`.
