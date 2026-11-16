# TASK-113 — Màn chào khi khách quét QR (F-092)
Status: READY_FOR_REVIEW (16/11/2026)
Feature: [FEATURE-092](../chức-năng/FEATURE-092.md) · ADR: [ADR-054](../quyết-định/ADR-054-man-chao-khi-quet-qr.md) (D-228, D-229) · AC-092-01…04 · US-092-1 · UC-01 · MOD-ORDER, MOD-NOTIFY · SCR-01, SCR-02, SCR-33
Nguồn: chủ dự án 16/11/2026 — "bạn thiết kế giao diện khi quét QR nó vào sẽ thấy cái này được không" (kèm ảnh màn chào gọi món tại bàn của một hệ thống khác). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-113-man-chao-khi-quet-qr` chồng lên `task/TASK-112-trang-quyen-nang-cao-sdt` · Kế hoạch: [TASK-113-plan](../kế-hoạch/TASK-113-plan.md)

## Phạm vi
- Màn chào trong `t-entry.js` sau khi vào nhóm (giữ các màn chọn F-001 / F-086); hộp Gọi nhân viên dùng chung (`call-staff.js`); Theo dõi đơn `?act=pay`; tên quán ở thực đơn dẫn về màn chào.
- Cài đặt `guestWelcome` (mặc định bật) + `/api/menu` `ui.welcome`, `shop.address`.
- Ngoài phạm vi: ảnh bìa tải lên, đánh giá trước khi thanh toán, chép hình ảnh / thương hiệu của ảnh mẫu.

## Test
- Integration mới `guest-welcome.test.js` (AC-092-01).
- E2E mới "màn chào khi quét QR…" (AC-092-02, 03); a11y khách thêm màn chào (AC-092-04).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
