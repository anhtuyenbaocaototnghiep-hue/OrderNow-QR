# TASK-052 — Menu engineering
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-041 (AC-041-01…03)
Nguồn: skill `advanced-features` §4 F-041 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-30 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Chủ quán thấy món nào bán chạy và lãi cao (Ngôi sao), bán chạy lãi thấp (Ngựa kéo), lãi cao bán ít (Câu đố), bán ít lãi thấp (Chó) trong 30 ngày, kèm gợi ý hành động; ghim món vào gợi ý hoặc tạo khuyến mãi ngay từ bảng.

## Phạm vi
- Không migration (tính khi xem; dùng `OrderItems.CogsAmount` của F-031, đơn `COMPLETED` theo `CompletedAt`).
- Backend:
  - hàm thuần `classifyMenu` (`src/domain/analytics.js`): trung vị số lượng và lãi / món của món bán ≥ 5 lần; dưới 5 lần → "Chưa đủ dữ liệu";
  - `analyticsService` / `analyticsRepo`; dòng chưa có giá vốn → ước tính (`estimatedCogs`);
  - route `GET /api/admin/reports/menu-engineering`, `POST /api/admin/reports/menu-engineering/pin` (ghim vào gợi ý F-017, tối đa 20; chế độ AUTO chuyển thành BOTH); trưởng ca → 403.
- UI: trang mới `/admin/analytics` "Phân tích & menu engineering" → tab Menu engineering (biểu đồ 4 ô SVG, bảng, **Ghim món này**, **Tạo khuyến mãi** mở form khuyến mãi chọn sẵn món).

## Phụ thuộc
TASK-039 (giá vốn dòng đơn), TASK-024 (ghim gợi ý), TASK-026 (khuyến mãi).

## Validation
`analytics.test.js` → unit "menu engineering: 8 món số liệu biết trước…" + integration "menu engineering 30 ngày…" (ghim món, trưởng ca → 403); E2E "phân tích + dashboard…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-041, ADR-006); hướng dẫn `chức-năng-mới/23-phân-tích-và-menu-engineering.md`.
