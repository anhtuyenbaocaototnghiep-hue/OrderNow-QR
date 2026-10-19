# TASK-035 — Gọi lại đơn lần trước & món yêu thích
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-045 (AC-045-01…04)
Nguồn: skill `advanced-features` §4 F-024 (đổi mã thành FEATURE-045 vì FEATURE-024 đã là "Gọi món tại bàn") · Quyết định: ADR-006 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Hội viên quay lại gọi nhanh: thấy đơn đã thu lần trước và bấm "Gọi lại", có dải món yêu thích (♥ + món hay gọi). Giỏ gọi lại luôn được kiểm lại (hết món, ngoài lịch, tùy chọn đã đổi) và lấy giá theo thực đơn hiện tại. Tổng chính thức vẫn do báo giá server tính (D-7); không phá luồng gọi món, thu tiền, kho.

## Phạm vi
- Migration `0015_goi_lai_don.sql` (`MemberFavorites`, index `IX_Payments_Member`).
- Backend:
  - `recallService` / `recallRepo` (đơn đã thu gần nhất, top 5 món hay gọi, kiểm từng dòng khi gọi lại → `skipped[]` kèm lý do);
  - route `GET /api/members/:id/recent-orders`, `GET /api/members/:id/favorites`, `PUT`/`DELETE /api/members/:id/favorites/:menuItemId`, `POST /api/cart/replay`;
  - quyền: khách chỉ dùng hội viên đang gắn vào phiên chưa đóng của chính điện thoại (cookie `cf_client`), sai → 403; quầy (JWT) dùng mọi hội viên.
- UI:
  - menu khách: thẻ "Lần trước bạn gọi … — Gọi lại", dải "Món yêu thích của bạn", nút ♡/♥ trên thẻ món;
  - Bán mang đi: tra SĐT hội viên → thẻ "Lần trước … gọi" + **Gọi lại**.

## Phụ thuộc
TASK-023 (hội viên), TASK-025 (`pricing`), TASK-028 (tùy chọn món), TASK-016 (bán mang đi).

## Validation
`phase4.test.js` → "Gọi lại đơn lần trước & món yêu thích (F-045)" (3 test), E2E "gọi lại đơn lần trước + thời gian chờ…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-045, ADR-006); hướng dẫn `chức-năng-mới/14-gọi-lại-đơn-lịch-thực-đơn-thời-gian-chờ.md`.
