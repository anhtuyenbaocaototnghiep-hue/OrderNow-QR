# TASK-116 — Logo quán (F-095)
Status: READY_FOR_REVIEW (16/11/2026)
Feature: [FEATURE-095](../chức-năng/FEATURE-095.md) · ADR: [ADR-057](../quyết-định/ADR-057-logo-quan.md) (D-234, D-235) · AC-095-01…03 · US-095-1 · UC-17 · MOD-ADMIN · SCR-33, SCR-01, SCR-02
Nguồn: chủ dự án — "làm thêm chỗ úp hình lên logo nha" (16/11/2026, sau khi xem màn chào). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-116-logo-quan` chồng lên `task/TASK-115-giao-dien-theo-gio-va-mua` · Kế hoạch: [TASK-116-plan](../kế-hoạch/TASK-116-plan.md)

## Phạm vi
- Tải / bỏ logo ở Cài đặt → Thông tin quán (chủ quán); lưu `uploads/brand/`; `GET /api/shop/logo` công khai; `logoUrl` ở /shop, /menu, /auth/me, phiếu in.
- Hiện logo: màn chào, đầu thực đơn, thanh quầy, thanh bên Quản lý, Hôm nay, đăng nhập Quản lý, phiếu in, thẻ QR in.
- Ngoài phạm vi: cắt / thu nhỏ ảnh ở máy chủ, SVG, ảnh bìa màn chào, trang quà / vòng quay / chính sách.

## Test
- Integration mới `shop-logo.test.js` (AC-095-01).
- E2E mới "logo quán…" (AC-095-02); a11y mới "logo quán (F-095)…" (AC-095-03).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
