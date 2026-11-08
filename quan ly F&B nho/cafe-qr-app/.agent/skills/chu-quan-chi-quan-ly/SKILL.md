---
name: chu-quan-chi-quan-ly
description: Luật "tài khoản Chủ quán chỉ dùng trang Quản lý" của cafe-qr-app (F-084, ADR-043 D-196…D-198, BR-122, TASK-102 — cố định, không có cài đặt) — POST /api/auth/login area 'pos' + vai ADMIN → 403 OWNER_ADMIN_ONLY sau khi đúng mật khẩu; pos-login.js luôn gửi area 'pos' và tự đăng nhập trang Quản lý (ownerToAdmin); auth.js requireStaffPage đổi phiên máy quầy cũ của chủ quán thành phiên Quản lý; trang Quản lý ẩn "Mở màn hình quầy" / "Mở trang ca ở quầy" cho chủ quán; việc cần làm ở Hôm nay dẫn tới Sổ quỹ / Đặt hàng / Nguyên liệu; in lại hóa đơn ?area=admin (auth-store.isAdminArea); giữ duyệt hộ ở quầy bằng tài khoản (resolveApproval) và API không gửi area. Dùng khi sửa đăng nhập, phân quyền theo vai, trang quầy / trang Quản lý, lối giữa hai khu, trang in hóa đơn, E2E đăng nhập, hoặc khi nhắc "admin vào quầy", "chủ quán đứng quầy", "OWNER_ADMIN_ONLY", "area pos", "tách quản lý với quầy".
---

# Mục đích

Ghi lại luật F-084 (08/11/2026) để agent sau không vô tình mở lại lối cho chủ quán vào máy quầy, không chặn nhầm những thứ phải giữ (duyệt hộ, công cụ gọi API, quyền vai khác), và biết bộ E2E đã đổi cách đăng nhập.

| Tài liệu        | Đường dẫn                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Quyết định      | `tài-liệu/quyết-định/ADR-043-chu-quan-chi-quan-ly.md` (D-196…D-198; thay một dòng bảng ADR-035 §4.6)                   |
| Feature / luật  | `tài-liệu/chức-năng/FEATURE-084.md` (US-084-1, AC-084-01…03) · BR-122 · `nghiệp-vụ/roles-permissions.md` §4.8 · UAT-54 |
| Task / kế hoạch | `tài-liệu/công-việc/TASK-102.md`, `tài-liệu/kế-hoạch/TASK-102-plan.md`                                                 |

# Luật (đã chạy)

1. **Máy chủ** (`services/userService.js login`): `area === 'pos' && user.role === 'ADMIN'` → `forbidden(…, 'OWNER_ADMIN_ONLY')`. Kiểm tra chạy **sau** khi đúng mật khẩu và tài khoản còn mở: sai mật khẩu vẫn chỉ trả 401 (không lộ vai trò). Lần bị từ chối không đếm là gõ sai (F-071), không chấm công, không cấp token. `routes/public.js`: `area` là `z.enum(['pos','admin']).optional()` — **không gửi thì như trước** (công cụ, script, `tests/helpers/harness.js` đăng nhập admin không gửi `area`).
2. **Màn đăng nhập quầy** (`js/pages/pos-login.js`): luôn gửi `area: 'pos'`; bắt `OWNER_ADMIN_ONLY` → `ownerToAdmin()` đăng nhập lại `area: 'admin'`, `saveAdminSession`, sang `/admin/today` (hoặc `next` bắt đầu bằng `/admin`).
3. **Trang quầy** (`js/auth.js requireStaffPage`): khu quầy + `user.role === 'ADMIN'` (phiên cũ) → `saveAdminSession(getPosToken(), user)`, `clearStaffSession()`, sang `/admin/today`. Không gọi `/api/auth/logout` (chủ quán không chấm công).
4. **Trang Quản lý:**
   - `admin-shell.js` ẩn `.nav-pos` khi `isOwner(user)`; `admin-shifts.js` ẩn "Mở trang ca ở quầy →".
   - `admin-today.js` việc cần làm (chủ quán): chi chờ duyệt `/admin/cash`, đơn đặt hàng đến hạn `/admin/purchasing`, lô hết hạn `/admin/ingredients`, kiểm kê `/admin/stock`. Vai khác giữ link `/pos/…`.
5. **Trang in hóa đơn:** `admin-reports.js` mở `/pos/…/receipt?area=admin`. `auth-store.isAdminArea()` coi đường dẫn kết thúc `/receipt` có `area=admin` là khu Quản lý, nên `staffApi` dùng phiên Quản lý.

# Giữ nguyên (đừng chặn)

- **Duyệt hộ ở quầy:** `resolveApproval` (giảm giá vượt ngưỡng, chi quỹ, hoàn tiền) nhận tài khoản người duyệt trong body, không qua đăng nhập — chủ quán vẫn duyệt được trên máy nhân viên.
- **Quyền vai khác:** Quản lý cửa hàng, trưởng ca, nhân viên đăng nhập quầy và chấm công như cũ; "Vào bằng tài khoản này" (F-080) giờ chỉ gặp với người không phải chủ quán.
- **Ca chủ quán mở từ trước:** nhân viên đóng ở quầy (`shiftService.close` không cần đúng người mở).
- **Không** chặn từng API quầy theo vai ADMIN: trang Quản lý, công cụ, test dùng chung endpoint.

# Kiểm thử

- Integration `ứng-dụng/máy-chủ/tests/owner-admin-only.test.js` (AC-084-01).
- E2E `flow.spec.js`:
  - "chủ quán chỉ dùng trang Quản lý…" (AC-084-02, 03), gồm mở trang in `?area=admin`.
  - Trang dùng chung `P` giữ **hai phiên**: trang Quản lý = chủ quán, đăng nhập ở `/admin/login?next=/admin/reports` trong bài Báo cáo; máy quầy = quản lý cửa hàng `quay-ql` / `Quay@123`, tạo ở bài kế tiếp, lần đầu có hướng dẫn → "Bỏ qua". Đừng đăng nhập chủ quán ở `/pos/login` trong E2E: sẽ bị chuyển sang `/admin/today`.
  - Bài F-080 "Vào bằng tài khoản này" dùng `quay-ql`.
- a11y `adminLogin()` đăng nhập ở `/admin/login`.

# Vận hành

Quán phải có ít nhất một tài khoản nhân viên / trưởng ca / quản lý cửa hàng để bán hàng (Hệ thống → Tài khoản). Không migration, không cài đặt.
