# TASK-102 — Tài khoản Chủ quán chỉ dùng trang Quản lý (F-084)
Status: READY_FOR_REVIEW (08/11/2026)
Quyết định: [ADR-043](../quyết-định/ADR-043-chu-quan-chi-quan-ly.md) D-196…D-198 (thay một dòng bảng ADR-035 §4.6) · Feature: [FEATURE-084](../chức-năng/FEATURE-084.md) (US-084-1, AC-084-01…03) · BR-122
Module: MOD-AUTH, MOD-ADMIN · Màn hình: SCR-09 (Đăng nhập quầy), SCR-42 (Hôm nay), SCR-32 (Lịch sử ca), SCR-25 (Báo cáo), SCR-56 (Đăng nhập Quản lý)
Nguồn: chủ dự án 08/11/2026 "với sao admin vẫn có thể vào màn hình quầy vậy" → agent giải thích + đề xuất → chủ dự án (kèm ảnh Hôm nay) "tài khoản admin chỉ ở trong này thôi không có ra màn hình quầy cố định luôn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-102-chu-quan-chi-quan-ly` chồng lên `task/TASK-101-giao-dien-tinh-gon` (chưa gộp `main`) · Kế hoạch: [TASK-102-plan.md](../kế-hoạch/TASK-102-plan.md)

## Mục tiêu
Tài khoản Chủ quán chỉ ở trang Quản lý, không vào được màn hình quầy. Việc chủ quán cần làm vẫn làm được ở trang Quản lý: duyệt chi, nhận hàng, hủy lô, in lại hóa đơn.

## Phạm vi
1. **Máy chủ:** `POST /api/auth/login` — `area` tùy chọn; `area = 'pos'` + ADMIN → `403 OWNER_ADMIN_ONLY` (sau khi đúng mật khẩu).
2. **Giao diện:**
   - `pos-login.js`: gửi `area: 'pos'`; nhận `OWNER_ADMIN_ONLY` → đăng nhập trang Quản lý → Hôm nay.
   - `auth.js`: phiên quầy cũ của chủ quán → phiên Quản lý.
   - `auth-store.js`: trang in `?area=admin` dùng phiên Quản lý.
   - `admin-shell.js`, `admin-shifts.js`: ẩn lối sang quầy cho chủ quán.
   - `admin-today.js`: việc cần làm → trang Quản lý.
   - `admin-reports.js`: in lại `?area=admin`.
3. **Test:**
   - Integration `owner-admin-only.test.js` (AC-084-01).
   - E2E mới (AC-084-02, 03).
   - Sửa E2E cũ:
     - `P` vào trang Quản lý bằng chủ quán, đứng quầy bằng quản lý cửa hàng `quay-ql`;
     - bài F-080 "Vào bằng tài khoản này" đổi sang quản lý cửa hàng;
     - a11y đăng nhập ở `/admin/login`.
4. **Tài liệu:**
   - ADR-043, FEATURE-084, BR-122, US-084-1, UAT-54, tc-map;
   - `roles-permissions.md` (§4.6 + §4.8), `api-contract.md`, `screens-flows.md`;
   - ghi chú ở ADR-035 / ADR-038 / F-080, README;
   - skill `chu-quan-chi-quan-ly` + bản ở thư mục gốc.

## Không được sửa
Quyền của Quản lý cửa hàng / trưởng ca / nhân viên; hộp duyệt ở quầy (`resolveApproval`); dữ liệu `CafeQrDev`; migration.

## Tiêu chí nghiệm thu
AC-084-01…03 (FEATURE-084) + toàn bộ test cũ vẫn đạt.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration. Khởi động lại máy chủ thử nghiệm vì có đổi mã máy chủ.

## Kết quả thực chạy (08/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **469/469 PASS** (55 file; thêm `owner-admin-only.test.js` — 2 test AC-084-01) |
| `npm run test:e2e` | **78/78 PASS** (4,5 phút; thêm bài "máy quầy P đứng bằng quản lý cửa hàng" và E2E AC-084-02/03; bài F-080, a11y quản lý đổi cách đăng nhập) |
| `npm run trace -- --check` | **183 US, 500 AC — PASS 500, FAIL 0, NOT_RUN 0, GAP 0** |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main`; chưa đẩy GitHub. Máy chủ thử nghiệm đã khởi động lại (đổi mã máy chủ).
