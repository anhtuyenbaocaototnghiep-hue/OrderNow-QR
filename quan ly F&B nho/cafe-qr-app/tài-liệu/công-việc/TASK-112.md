# TASK-112 — Trang riêng "Quyền nâng cao" + số điện thoại tài khoản (F-091)
Status: READY_FOR_REVIEW (14/11/2026)
Feature: [FEATURE-091](../chức-năng/FEATURE-091.md) · ADR: [ADR-053](../quyết-định/ADR-053-trang-quyen-nang-cao-va-sdt-tai-khoan.md) (D-226, D-227) · AC-091-01…04 (+ AC-090-02…04, AC-079-07 chạy trên trang mới) · US-091-1, US-091-2 · UC-17 · MOD-AUTH, MOD-ADMIN · SCR-20, SCR-58
Nguồn: chủ dự án 14/11/2026 — "bạn tạo thêm một trang riêng về quyền nâng cao bên tài khoản để thêm mục số điện thoại". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-112-trang-quyen-nang-cao-sdt` chồng lên `task/TASK-111-bo-trang-phan-tich` · Kế hoạch: [TASK-112-plan](../kế-hoạch/TASK-112-plan.md)

## Phạm vi
- Migration 0059 `Users.Phone` (chỉ thêm cột) + API `phone` ở tạo / sửa / danh sách tài khoản (chỉ chủ quán thấy).
- Trang mới `/admin/permissions` (SCR-58): Xin quyền chờ duyệt + danh sách người + công tắc của người đang chọn; mục thanh bên ngay sau Tài khoản.
- Trang Tài khoản: ô + cột Số điện thoại; hộp Thêm / Sửa chỉ còn tóm tắt quyền theo vai + liên kết; nhãn "Có quyền nâng cao" là liên kết; bỏ khung Xin quyền (thay bằng dòng nhắc).
- Ngoài phạm vi: đăng nhập bằng SĐT, SĐT bắt buộc / duy nhất, cho quản lý cửa hàng xem SĐT.

## Test
- Integration mới `staff-phone.test.js` (AC-091-01).
- E2E mới AC-091-02, AC-091-03; viết lại AC-090-02, AC-090-03, AC-079-07 theo trang mới; a11y hộp Thêm nhân viên + trang Quyền nâng cao (AC-091-04, AC-090-04).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `node kịch-bản/db-migrate.js` (CafeQrDev lên 0059)
