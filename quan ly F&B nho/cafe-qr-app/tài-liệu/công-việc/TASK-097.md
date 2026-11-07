# TASK-097 — Trang Quản lý riêng: đăng nhập riêng, phiên riêng với máy quầy (F-080)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-038](../quyết-định/ADR-038-trang-quan-ly-rieng.md) D-173…D-177 · Feature: [FEATURE-080](../chức-năng/FEATURE-080.md) (US-080-1, AC-080-01…03) · BR-118
Module: MOD-AUTH, MOD-ADMIN · Màn hình: SCR-56 (Đăng nhập Quản lý — mới), SCR-42 (Hôm nay), thanh bên Quản lý, máy quầy (nút Quản lý)
Nguồn: chủ dự án 07/11/2026 "tôi muốn admin nó là một trang riêng biệt thì được không"; agent đề xuất "Trang Quản lý riêng"; chủ dự án: "duyệt". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-097-trang-quan-ly-rieng` chồng lên `task/TASK-096-quyen-rieng-tung-tai-khoan` (chưa gộp `main`) · Kế hoạch: [TASK-097-plan.md](../kế-hoạch/TASK-097-plan.md)

## Mục tiêu
Chủ quán lưu một địa chỉ `/admin`, đăng nhập ở trang riêng, vào thẳng Hôm nay; trang Quản lý không làm văng máy quầy, không tính vào ca.

## Phạm vi
1. Máy chủ: `POST /api/auth/login` thêm `area` (`admin` không chấm công vào); `GET /admin` → `/admin/today`; trang `/admin/login`.
2. Giao diện: `admin/login.html` + `js/pages/admin-login.js` (SCR-56); `auth-store.js` (phiên Quản lý riêng, đi theo máy quầy, `isAdminArea`); `auth.js` (`requireStaffPage` theo khu, `?from=pos`, `adminLogout`); `api.js` (hết phiên → đúng trang đăng nhập); `admin-shell.js` (Mở màn hình quầy tab mới, Đăng xuất trang Quản lý); `admin-today.js`; `pos-shell.js` (nút Quản lý `?from=pos`); `roles.js` (`firstAdminHref` chủ quán → Hôm nay); CSS.
3. Test integration + E2E; sửa 2 bài E2E cũ theo hành vi mới (bài "báo cáo: khoảng ngày sai…" đăng nhập ở máy quầy rồi sang Báo cáo; bài F-077 AC-077-08: mở thẳng Lãi / lỗ → ở lại Hôm nay kèm Xin quyền — đổi tên bài + dòng tc-map); tài liệu; skill `trang-quan-ly-rieng`.

## Không được sửa
Quyền, dữ liệu, cách xác thực ở máy chủ (cùng JWT); luồng đăng nhập / đăng xuất / đóng ca của máy quầy.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **464/464 PASS** (52 file; thêm `admin-area.test.js` 2 test — AC-080-01, 02) |
| `npm run test:e2e` | **73/73 PASS** (thêm E2E "trang Quản lý riêng: máy mới mở /admin…" — AC-080-03). Lần chạy đầu 1 FAIL: bài "báo cáo: khoảng ngày sai…" xóa phiên rồi mở `/admin/reports` — nay sang Đăng nhập Quản lý (phiên riêng) nên các bài sau mở `/pos` không còn phiên quầy → sửa bài đăng nhập ở `/pos/login?next=/admin/reports` (đúng hành vi mới) |
| `npm run trace -- --check` | 179 US, 491 AC — PASS 491, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Đăng nhập Quản lý (trống; thẻ "Vào bằng tài khoản này"; nhân viên chưa có quyền + Xin quyền) — không cuộn ngang |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
