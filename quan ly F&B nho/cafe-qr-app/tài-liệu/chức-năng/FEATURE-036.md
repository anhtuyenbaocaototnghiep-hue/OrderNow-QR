# FEATURE-036 — Vai Trưởng ca (MANAGER) và ma trận quyền

> **Nguồn:** skill `advanced-features` §4 F-036. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-24; lệch docs ghi ở Q-022.

- **Status:** CONFIRMED (ADR-006 D-24) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN (tạo tài khoản Trưởng ca); MANAGER (dùng quyền); hệ thống (kiểm quyền ở mọi endpoint).
- **Màn hình:**
  - **Quản lý → Tài khoản:** chọn vai trò "Trưởng ca".
  - **Quầy:** thanh trên hiện nhãn "Trưởng ca".
  - **Quầy → Ca & hoàn tiền:** duyệt chi quỹ, chấm công hôm nay.
  - **Quầy → Kho & sơ chế:** nút "Điều chỉnh" ở tab Tồn kho, tab "Kiểm kê".
  - **Quản lý → Cài đặt:** thẻ "Trưởng ca & sổ quỹ".
- **Dữ liệu:** migration `0025_truong_ca.sql`:
  - `CK_Users_Role` thêm `'MANAGER'`.
  - Settings `manager.discount_max_percent = 20`, `manager.discount_max_amount = 50000`, `manager.refund_same_shift_only = true`, `manager.cash_out_approve_max = 2000000`.
- **Mã nguồn:** `src/auth/permissions.js`:
  - bảng `PERMISSIONS`;
  - `can(user, permission)`;
  - middleware `requirePermission(permission)`;
  - `discountLimits(role, settings)`.

## Ma trận (server kiểm; giao diện chỉ ẩn/hiện)

| Quyền | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- |
| `pos.use`: bán, tiếp nhận, hoàn tất, thu tiền, mang đi, in | ✔ | ✔ | ✔ |
| Giảm giá tay (tự duyệt) | ≤ 10 % và ≤ 20.000đ | ≤ 20 % và ≤ 50.000đ | không giới hạn |
| Hoàn tiền (tự duyệt) | ✘ (cần người duyệt) | lượt thu trong ca đang mở | ✔ |
| `shift.manage`: mở / đóng ca | ✔ (Q-022) | ✔ | ✔ |
| `cash.create`: ghi thu / chi quỹ | ✔ (khoản lớn chờ duyệt — Q-022) | ✔ | ✔ |
| `cash.approve`: duyệt chi quỹ | ✘ | ≤ 2.000.000đ | ✔ |
| `attendance.edit`: sửa chấm công | ✘ | trong ngày | ✔ |
| `prep.post`, `waste.create`, `po.receive`: sơ chế, hủy hàng, nhận hàng theo PO | ✔ | ✔ | ✔ |
| `inventory.adjust`, `stocktake.post`: điều chỉnh kho tay, kiểm kê | ✘ | ✔ | ✔ |
| `admin.all`: menu, giá, BOM, khuyến mãi, hội viên, tài khoản, báo cáo tài chính, lãi/lỗ, nhật ký | ✘ | ✘ | ✔ |
| `dashboard.view`: `/admin/today` | ✘ | bản rút gọn (F-043) | ✔ |

## Quy tắc

1. **Giảm giá tay vượt ngưỡng của người thao tác** → cần người có quyền cao hơn nhập tài khoản:
   - trưởng ca được duyệt nếu mức giảm nằm trong ngưỡng trưởng ca;
   - vượt ngưỡng trưởng ca → chỉ quản lý duyệt.
   - `Payments.ApprovedBy` = người duyệt. Khi trưởng ca / quản lý tự giảm, người duyệt là chính họ.
2. **Hoàn tiền:**
   - lượt thu thuộc ca đang mở → trưởng ca tự hoàn;
   - lượt thu ca khác → cần quản lý.
   - Tắt `manager.refund_same_shift_only` thì trưởng ca hoàn mọi lượt trong ngày.
3. **Luôn còn ít nhất một tài khoản Quản lý đang hoạt động.**
   - Tự hạ vai trò / tự khóa vẫn trả 400 như FEATURE-009 (`CANNOT_CHANGE_OWN_ROLE`, `CANNOT_LOCK_SELF`).
   - Hạ vai trò / khóa quản lý cuối cùng → `409 LAST_ADMIN`. Kiểm nguyên tử trong SQL (khóa U toàn bộ dòng ADMIN), nên hai quản lý hạ quyền nhau cùng lúc chỉ một người thành công.
   - Xóa quản lý cuối cùng bị chặn ở `sp_DeleteUser` (50150).
4. **Trưởng ca không vào được `/api/admin/*`** (403) và trang `/admin/*` (bị chuyển về quầy). Thao tác kho của trưởng ca đi qua `/api/ops/*`.

## API

| Method & path | Quyền |
| --- | --- |
| `POST /api/ops/ingredients/{id}/adjust` · `GET /api/ops/ingredients/{id}/transactions` | `inventory.adjust` |
| `GET/POST /api/ops/stocktakes` · `GET/DELETE /api/ops/stocktakes/{id}` · `PUT …/lines` · `POST …/post` | `stocktake.post` |
| `POST /api/admin/users`, `PUT /api/admin/users/{id}` | `role: 'STAFF' \| 'MANAGER' \| 'ADMIN'`; `409 LAST_ADMIN` |
| `PUT /api/admin/settings` | `managerMaxPercent`, `managerMaxAmount`, `managerRefundSameShiftOnly`, `managerCashApproveMax`, `cashApproveThreshold` |

## Acceptance Criteria

- AC-036-01: Bảng test sinh từ `PERMISSIONS`. Với mỗi quyền × mỗi vai, vai được phép không nhận 401/403, vai khác nhận 403.
- AC-036-02: Khách (không token) gọi endpoint quầy / trưởng ca / quản lý → 401.
- AC-036-03: Giảm tay:
  - nhân viên 15 % → cần duyệt; trưởng ca 15 % → không cần;
  - trưởng ca 25 % → cần quản lý; quản lý 90 % → không cần.
- AC-036-04: Hai quản lý hạ quyền nhau đồng thời → đúng một thành công, còn đúng một quản lý; hạ / khóa quản lý cuối cùng → 409 `LAST_ADMIN`.
- AC-036-05: Trưởng ca điều chỉnh kho và chốt kiểm kê ở quầy được; nhân viên → 403.

## Bằng chứng

- `tests/finance.test.js` → "Vai Trưởng ca & ma trận quyền (F-036)": 6 test.
- `tests/finance-unit.test.js` → ngưỡng theo vai, `can`.
- E2E "trưởng ca + sổ quỹ…".
