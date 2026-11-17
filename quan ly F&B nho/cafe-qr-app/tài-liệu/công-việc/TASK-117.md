# TASK-117 — Thêm tài khoản chủ quán (F-096)
Status: READY_FOR_REVIEW (16/11/2026)
Feature: [FEATURE-096](../chức-năng/FEATURE-096.md) · ADR: [ADR-058](../quyết-định/ADR-058-them-tai-khoan-chu-quan.md) (D-236, D-237) · AC-096-01, AC-096-02 · US-096-1 · UC-17 · MOD-AUTH, MOD-ADMIN · SCR-20, SCR-47
Nguồn: chủ dự án — "làm thêm có thể tạo thêm tài khoản admin nữa nha" (16/11/2026). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-117-them-tai-khoan-chu-quan` chồng lên `task/TASK-116-logo-quan` · Kế hoạch: [TASK-117-plan](../kế-hoạch/TASK-117-plan.md)

## Phạm vi
- Trang Tài khoản: "+ Thêm tài khoản"; vai Chủ quán có cảnh báo + ô mật khẩu xác nhận (tạo và sửa).
- Máy chủ: `confirmPassword` khi tạo / nâng thành ADMIN (sai → 403, sai 5 lần → 429); cảnh báo ACCESS_GRANT cho chủ quán.
- Ngoài phạm vi: vai mới, đổi quyền vai khác, xác nhận qua email.

## Test
- Integration mới `owner-accounts.test.js` (AC-096-01); E2E mới "thêm tài khoản chủ quán…" (AC-096-02).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
