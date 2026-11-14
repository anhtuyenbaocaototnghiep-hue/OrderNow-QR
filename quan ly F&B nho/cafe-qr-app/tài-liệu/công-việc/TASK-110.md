# TASK-110 — Phân quyền đơn giản: Cho phép / Không cho phép, quyền theo vai lúc tạo tài khoản, Quyền nâng cao (F-090)
Status: READY_FOR_REVIEW (14/11/2026)
Feature: [FEATURE-090](../chức-năng/FEATURE-090.md) · ADR: [ADR-051](../quyết-định/ADR-051-phan-quyen-don-gian.md) (D-222…D-224) · AC-090-01…04 · US-090-1, US-090-2 · UC-17 · MOD-AUTH, MOD-ADMIN · SCR-20
Nguồn: chủ dự án 14/11/2026 — "còn về phân quyền chỉ cho phép và không cho phép, khi tạo tài khoản thì quyền giao diện là nhân viên hay gì đó sẽ có quyền như vậy và có thêm giao diện cấp quyền nâng cao do chính admin cấp làm lại cho dễ sử dụng hơn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-110-phan-quyen-don-gian` chồng lên `task/TASK-109-kho-nguyen-lieu-gon` · Kế hoạch: [TASK-110-plan](../kế-hoạch/TASK-110-plan.md)

## Phạm vi
- API mới (chỉ chủ quán) `GET /api/admin/role-permissions` — quyền mặc định của vai trò + vị trí, tính bằng hàm kiểm quyền thật.
- `js/perm-editor.js` (mới): phần "Quyền" trong hộp Thêm / Sửa tài khoản — "Vai trò này được làm" + "Quyền nâng cao" (công tắc Cho phép / Không cho phép, Về như vai trò, giữ hạn quyền tạm chưa chạm).
- Trang Tài khoản: bỏ nút + hộp "Quyền" ba trạng thái; nhãn "Có quyền nâng cao"; nhãn ô nhập gắn đúng ô (`for` / `id`).
- Ngoài phạm vi: mô hình quyền riêng, `PUT …/grants`, kiểm quyền ở máy chủ, khung Xin quyền (giữ nguyên).

## Test
- Integration mới `role-permissions.test.js` (AC-090-01); `access-grants.test.js`, `api-docs.test.js` chạy lại PASS.
- E2E mới AC-090-02, AC-090-03; sửa AC-079-07 (đặt lại quyền qua hộp Sửa); a11y quét hộp Sửa mở Quyền nâng cao (AC-090-04).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
