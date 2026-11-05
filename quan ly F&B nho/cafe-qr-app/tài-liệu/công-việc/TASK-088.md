# TASK-088 — Chống sửa / xóa dữ liệu trái phép
Status: READY_FOR_REVIEW (05/11/2026)
Quyết định: [ADR-029](../quyết-định/ADR-029-chong-sua-du-lieu.md) D-119…D-123 · Feature: [FEATURE-071](../chức-năng/FEATURE-071.md) · BR-108
Module: MOD-AUTH, MOD-SHIFT, MOD-ADMIN · Màn hình: SCR-09 (Đăng nhập), SCR-15 (Ca), SCR-47 (Cảnh báo bất thường), SCR-38 (Nhật ký)
Nguồn: chủ dự án 05/11/2026 — "bạn có thể tăng cường bảo mật để ở phần backend để người ta ko lợi dụng để sửa". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-088-chong-sua-du-lieu` chồng lên `task/TASK-087-ly-treo` (chưa gộp `main`) · Kế hoạch: [TASK-088-plan.md](../kế-hoạch/TASK-088-plan.md)

## Mục tiêu
Bịt các lỗ có thật tìm được khi rà backend: trưởng ca tự sửa chấm công của mình; dò mật khẩu quản lý qua ô "tài khoản duyệt" ở quầy (không giới hạn số lần) và qua đăng nhập; xóa dấu vết bằng SQL (nhật ký, tiền, ca, chấm công).

## Phạm vi
1. Migration 0048 (`AuthFailures`, `AUTH_LOCK`, trigger chặn xóa 8 bảng + nhật ký).
2. Máy chủ: `authGuardRepo`, `authGuardService`; `userService.login` / `resolveApproval`; `attendanceService` (`assertNotSelf`); `alertService.onAuthLock`; route đăng nhập truyền `req.ip`.
3. Giao diện: màn Ca (ẩn Sửa dòng của mình, bỏ tên mình khỏi Thêm chấm công); trang Cảnh báo (loại "Sai mật khẩu nhiều lần").
4. Test integration + bước E2E; tài liệu; skill `chong-sua-du-lieu`.

## Không được sửa
Thủ tục lưu trữ (`sp_*`); quy tắc duyệt hiện có (D-14, D-15, D-23, D-24, D-33) — chỉ thêm giới hạn số lần sai.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (05/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **416/416 PASS** (42 file; thêm `tamper-guard.test.js` 4 test — AC-071-01…04; mọi test duyệt / chấm công / sổ quỹ / nhật ký cũ vẫn xanh) |
| `npm run test:e2e` | **64/64 PASS** (E2E "trưởng ca + sổ quỹ…" thêm bước AC-071-05: dòng chấm công của trưởng ca không có nút Sửa, dòng người khác có; a11y quầy / quản lý vẫn đạt) |
| `npm run trace -- --check` | 160 US, 433 AC — PASS 433, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Rà backend | `cafe_app` là `db_owner`, không `sysadmin`; không luồng app nào xóa cứng 8 bảng được bảo vệ (`OrderItems` bị `sp_VoidOrderItem` xóa nên không chặn); sổ quỹ đã chặn tự duyệt từ trước |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án. Đề xuất vận hành (tách tài khoản CSDL, tài khoản Windows riêng cho máy chủ) ghi ở ADR-029 — chủ dự án tự làm.
