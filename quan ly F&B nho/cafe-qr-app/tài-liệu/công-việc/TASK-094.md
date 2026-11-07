# TASK-094 — Phân quyền rõ ràng, đợt 1: vai Quản lý cửa hàng, tên Chủ quán (F-077)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-035](../quyết-định/ADR-035-phan-quyen-quan-ly-cua-hang.md) D-156…D-161 · Feature: [FEATURE-077](../chức-năng/FEATURE-077.md) (US-077-1/2, AC-077-01…08) · BR-115
Module: MOD-AUTH, MOD-ADMIN, MOD-NOTIFY · Màn hình: SCR-20 (Tài khoản), SCR-10 (máy quầy), SCR-42 (Hôm nay) + thanh bên Quản lý, SCR-47 (Cảnh báo), SCR-46 (Tra cứu API)
Nguồn: chủ dự án 07/11/2026 "đề xuất phân quyền rõ ràng giữa khi vào admin thì chỉ thấy và làm cái gì, quản lý cũng vậy, và nhân viên chia ra từng cấp…"; agent đề xuất 5 vai + vị trí + cấp, chia hai đợt; chủ dự án: "tiến hành làm những cái tôi vừa nhắn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-094-phan-quyen` chồng lên `task/TASK-093-quy-trinh-1-cham` (chưa gộp `main`) · Kế hoạch: [TASK-094-plan.md](../kế-hoạch/TASK-094-plan.md)

## Mục tiêu
Chủ quán giao việc điều hành hằng ngày cho một người quản lý cửa hàng mà không đưa mật khẩu của mình: người đó làm được thực đơn, kho, khuyến mãi, hội viên, lịch làm, duyệt chi vừa phải; không thấy lương từng người, lãi / lỗ, tài khoản, cài đặt chung; đổi giá thì chủ quán được báo.

## Phạm vi
1. Migration 0053 (`CK_Users_Role` + `STORE_MGR`, `CK_Alerts_Kind` + `PRICE_CHANGE`).
2. Máy chủ: `auth/permissions.js` (`ROLES`, `STORE_MGR_AREAS`, `storeManagerMay`, `requireAdminArea`, `STORE_MGR_SETTINGS`, `OWNER_ONLY_ALERTS`, `storeManagerCashMax`, `discountLimits`); `routes/admin.js` (middleware, vai, báo đổi giá), `operations.js` (cài đặt, cảnh báo), `apiDocs.js` (vai từng dòng), `expiry.js`; `userService.resolveApproval` (`allowStoreManager`), `cashService`, `attendanceService`, `dashboardService`, `offlineSaleService`, `adminService` + `alertService.onPriceChange`, `alertsRepo` (lọc loại), realtime phòng `store`.
3. Giao diện: `js/roles.js` (mới), `auth.js`, `admin-shell.js` (menu theo vai), `pos-shell.js`, `cash-book.js`, `attendance.js`, trang Tài khoản (bảng vai trò), Hôm nay, Nhân sự, Hội viên, Sổ quỹ, Cảnh báo, Tra cứu API, quầy (Ca, Kho, Bán mang đi); CSS.
4. Test integration + E2E; tài liệu; skill `phan-quyen-quan-ly-cua-hang`.

## Không được sửa
Quyền của ba vai cũ (tài khoản cũ giữ nguyên quyền); mã vai `ADMIN` (chỉ đổi nhãn hiển thị); luồng duyệt / nhật ký thao tác; dữ liệu CafeQrDev (migration chỉ thêm).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **451/451 PASS** (49 file; thêm `store-manager.test.js` 7 test — AC-077-01…07; `api-docs.test.js` thêm quản lý cửa hàng: gọi thử mọi endpoint chỉ chủ quán → 403, sửa kỳ vọng `reviews` → `STORE_MGR`, vai của quyền quầy có `STORE_MGR`) |
| `npm run test:e2e` | **70/70 PASS** (thêm E2E "phân quyền: chủ quán tạo tài khoản…" — AC-077-08) |
| `npm run trace -- --check` | 174 US, 475 AC — PASS 475, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Tài khoản (bảng "Mỗi vai trò làm được gì?", nhãn 4 vai), thanh bên của quản lý cửa hàng (không có Lãi / lỗ, Lương, Tài khoản, Cài đặt, Nhật ký, Phân tích, Tra cứu API), máy quầy (nhãn + mục Quản lý), Nhân sự (không sửa được dòng của mình), Cảnh báo đổi giá — không cuộn ngang. Sửa theo ảnh: nhãn "Quản lý cửa hàng" trùng màu "Trưởng ca" → đổi màu; dòng chi tiết cảnh báo lặp tiêu đề → "Tăng 3.000đ (+7,7 %)"; bảng vai trò sát đoạn PIN → thêm khoảng cách |
| `npm run lint`, `npm run format:check` | PASS |
| Lỗi tìm được khi làm | Khảo sát từng trang được mở: Thực đơn gọi `settings` + `jobs`, Kho gọi `reports/cogs`, `costs`, Nhân sự gọi `users` + `attendance-settings`, Sổ quỹ sửa danh mục, Hội viên ẩn danh → mở đúng phần cần (`read` / `only`), ẩn phần chỉ chủ quán. Nút "Sửa" chấm công của chính mình ở trang Nhân sự (server chặn) → ẩn |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub. Đợt 2 (TASK-095: vị trí Thu ngân / Pha chế / Phục vụ, cấp Thử việc / Chính thức) chưa làm.
