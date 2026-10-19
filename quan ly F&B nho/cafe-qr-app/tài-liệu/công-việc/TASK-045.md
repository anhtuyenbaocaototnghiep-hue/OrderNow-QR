# TASK-045 — Vai Trưởng ca (MANAGER) và ma trận quyền
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-036 (AC-036-01…05)
Nguồn: skill `advanced-features` §4 F-036 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-24 · Lệch docs: Q-022 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Thêm vai **Trưởng ca** giữa nhân viên và quản lý: quyền quầy + giảm tay / hoàn tiền / duyệt chi lớn hơn, điều chỉnh kho và kiểm kê ở quầy, xem "Hôm nay" bản rút gọn; không vào trang quản lý. Mọi quyền kiểm ở server theo một ma trận duy nhất; luôn còn ít nhất một tài khoản Quản lý.

## Phạm vi
- Migration `0025_truong_ca.sql` (`CK_Users_Role` thêm `'MANAGER'`; Settings `manager.discount_max_percent`, `manager.discount_max_amount`, `manager.refund_same_shift_only`, `manager.cash_out_approve_max`).
- Backend:
  - `src/auth/permissions.js`: bảng `PERMISSIONS`, `can(user, permission)`, middleware `requirePermission`, `discountLimits(role, settings)`;
  - giảm tay vượt ngưỡng / hoàn tiền ca khác cần người có quyền cao hơn nhập tài khoản (`Payments.ApprovedBy`);
  - `409 LAST_ADMIN` kiểm nguyên tử trong SQL (khóa U toàn bộ dòng ADMIN); `sp_DeleteUser` chặn xóa quản lý cuối (50150);
  - route quầy `/api/ops/*` cho điều chỉnh kho (`inventory.adjust`) và kiểm kê (`stocktake.post`); trưởng ca gọi `/api/admin/*` → 403.
- UI:
  - Tài khoản: vai trò "Trưởng ca";
  - thanh quầy: nhãn "Trưởng ca", mục "Hôm nay"; Kho & sơ chế: nút Điều chỉnh, tab Kiểm kê;
  - trang `/admin/*` chuyển trưởng ca về quầy;
  - Cài đặt: thẻ "Trưởng ca & sổ quỹ".
- Lệch ma trận skill so với docs (STAFF vẫn mở / đóng ca và ghi chi quỹ) ghi ở Q-022.

## Phụ thuộc
TASK-017 (tài khoản), TASK-030 (giảm tay có duyệt), TASK-033 (hoàn tiền, kiểm kê).

## Validation
`finance.test.js` → "Vai Trưởng ca & ma trận quyền (F-036)" (6 test, ma trận actor × endpoint sinh từ `PERMISSIONS`, hai quản lý hạ quyền nhau đồng thời) + test "hoàn tiền: trưởng ca tự hoàn lượt thu trong ca đang mở…" (nhóm Sổ quỹ); `finance-unit.test.js` → ngưỡng giảm tay theo vai, `can`; E2E "trưởng ca + sổ quỹ…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-036, ADR-006, Q-022); hướng dẫn `chức-năng-mới/17-trưởng-ca-và-phân-quyền.md`.
