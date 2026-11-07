# TASK-096 — Quyền riêng từng tài khoản + Xin quyền / Duyệt (F-079)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-037](../quyết-định/ADR-037-quyen-rieng-tung-tai-khoan.md) D-167…D-172 · Feature: [FEATURE-079](../chức-năng/FEATURE-079.md) (US-079-1/2, AC-079-01…07) · BR-117
Module: MOD-AUTH, MOD-ADMIN, MOD-NOTIFY · Màn hình: SCR-20 (Tài khoản: nút Quyền, khung Xin quyền chờ duyệt), SCR-42 (Hôm nay), thanh "Xin quyền" ở mọi trang quầy / Quản lý, SCR-47 (Cảnh báo), SCR-46 (Tra cứu API)
Nguồn: chủ dự án 07/11/2026 "tôi muốn admin có nhiều quyền hơn giống như có thể duyệt hoặc cấp quyền để truy cập ở mỗi tài khoản"; agent đề xuất "Quyền riêng từng tài khoản + Xin quyền / Duyệt"; chủ dự án: "ok". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-096-quyen-rieng-tung-tai-khoan` chồng lên `task/TASK-095-vi-tri-cap-nhan-vien` (chưa gộp `main`) · Kế hoạch: [TASK-096-plan.md](../kế-hoạch/TASK-096-plan.md)

## Mục tiêu
Chủ quán cho phép / không cho từng người một việc cụ thể (có thể chỉ hôm nay) mà không phải đổi vai trò; nhân viên bị chặn thì xin quyền ngay, chủ quán duyệt từ xa.

## Phạm vi
1. Migration 0055 (`UserGrants`, `AccessRequests`, `Alerts.Kind` + `ACCESS_GRANT`); `sp_DeleteUser` theo hai bảng mới.
2. Máy chủ: `auth/permissions.js` (17 `CAPABILITIES`, `hasCap`, `capsOf`, `adminMay`, `capabilityForAdmin`; `can` / `hasPosition` / `requireAdminArea` qua `hasCap`; 403 kèm `details.capability`); `userFromToken` nạp quyền riêng; `usersRepo` (quyền riêng), `accessRepo`, `accessService`, `routes/access.js`; `/auth/me` trả `caps`; cảnh báo `ACCESS_GRANT`; Hôm nay `pendingAccess`; Tra cứu API `capability`; người không phải chủ quán (không chỉ quản lý cửa hàng) bị ẩn loại cảnh báo chỉ chủ quán, chỉ đổi cài đặt vận hành.
3. Giao diện: `js/access.js` (thanh + hộp Xin quyền, hỏi lại kết quả), `api.js` (`setAccessNotifier`), `roles.js` theo `caps`, `auth.js` / `pos-shell.js` / `admin-shell.js` (chuyển về kèm `cap`, mục Quản lý theo quyền), `admin-users.js` (hộp Quyền, khung chờ duyệt, nhãn Có quyền riêng), `admin-today.js`, `pos-stock.js`, `pos-shift.js`; CSS.
4. Test integration + E2E (sửa 1 kỳ vọng E2E F-078: lời nhắc khi bị chuyển về nay là thanh Xin quyền); tài liệu; skill `quyen-rieng-tung-tai-khoan`.

## Không được sửa
Quyền mặc định của mọi vai / vị trí (giữ nguyên khi chưa đặt riêng); luật duyệt tiền theo vai + ngưỡng; phần chỉ chủ quán (tài khoản, cài đặt chung, duyệt xin quyền).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **462/462 PASS** (51 file; thêm `access-grants.test.js` 6 test — AC-079-01…06; test quyền cũ `finance`, `store-manager`, `staff-positions`, `api-docs`, `delete` chạy lại trước khi làm giao diện: 56/56 — quyền mặc định không đổi) |
| `npm run test:e2e` | **72/72 PASS** (thêm E2E "quyền riêng: nhân viên Phục vụ mở Bán mang đi…" — AC-079-07) |
| `npm run trace -- --check` | 178 US, 488 AC — PASS 488, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Thanh "Xin quyền" ở máy quầy, khung "Xin quyền chờ duyệt", hộp "Quyền" — không cuộn ngang. Sửa theo ảnh: hộp Quyền hẹp làm cắt chữ ô chọn → hộp rộng 52rem, ô chọn "Mặc định / Cho phép / Không cho", dòng "Mặc định theo vai trò: có / không" và "Hạn hiện tại" tách riêng; điện thoại → mỗi quyền một thẻ dọc; thanh Xin quyền bị bó nửa màn hình ở 390 px và trùng lời nhắc cũ → thanh căn giữa theo bề ngang, bỏ lời nhắc trùng |
| `npm run db:migrate` (CafeQrDev) | 0055 + `sp_DeleteUser` đã áp (0055 được áp sớm do lệnh `db:migrate -- --help` chạy migrate thật — cùng nội dung bản cuối, chỉ thêm); máy chủ thử nghiệm chạy lại ở `http://10.50.2.7:3000` |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
