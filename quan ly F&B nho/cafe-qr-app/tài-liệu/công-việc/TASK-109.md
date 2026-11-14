# TASK-109 — Kho nguyên liệu gọn: hạn sử dụng, "⋯", Theo dõi hạn; gộp Nhà cung cấp & đặt hàng vào "Nhập kho & kiểm kê" (F-089)
Status: READY_FOR_REVIEW (14/11/2026)
Feature: [FEATURE-089](../chức-năng/FEATURE-089.md) · AC-089-01…05 · US-089-1, US-089-2 · BR-041 (dùng lại) · UC-13 · MOD-INVENTORY, MOD-ADMIN · SCR-23, SCR-31, SCR-35
Nguồn: chủ dự án 14/11/2026 — "kho nguyên liệu hiện thêm cái hạn sử dụng và test thử, còn nhà cung cấp gộp chung với nhập khi kiểm kê thiết kế lại giao diện dễ dàng sử dụng" (kèm ảnh trang `/admin/ingredients`). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-109-kho-nguyen-lieu-gon` chồng lên `task/TASK-108-doi-ten-thu-chi` · Kế hoạch: [TASK-109-plan](../kế-hoạch/TASK-109-plan.md)

## Phạm vi
- API danh sách nguyên liệu thêm hạn sử dụng gần nhất (`ingredientsRepo`: `OUTER APPLY` trên lô còn hàng có hạn — không migration).
- Trang Kho nguyên liệu: 4 cột + "⋯" (ngăn việc phụ), cột Hạn sử dụng, dải Sắp hết hạn, nút Theo dõi hạn.
- `js/stock-nav.js` (mới): hàng thẻ chung cho `/admin/stock` + `/admin/purchasing`, `?tab=`; thanh bên bỏ mục Nhà cung cấp (`NAV_ALIAS`); tiêu đề trang purchasing; "Việc cần làm" ở Hôm nay → `?tab=pos`.
- Ngoài phạm vi: đổi quyền, đổi đường dẫn / API kho, bỏ trang purchasing; ghi hạn cho nguyên liệu chưa theo lô ngay trên phiếu nhập (bật Theo dõi hạn trước).

## Test
- Integration mới `ingredient-expiry.test.js` (AC-089-01, 02).
- E2E mới AC-089-03, AC-089-04; sửa bài ADR-004 (Xóa nguyên liệu qua "⋯") và F-075 AC-075-05 (Kho nâng cao qua "⋯").
- A11y: quét thêm ngăn "⋯" (320 / 390 px) và trang có hàng thẻ kho (AC-089-05).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
