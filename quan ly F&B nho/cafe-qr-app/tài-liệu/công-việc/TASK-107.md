# TASK-107 — Bỏ "Đổi người" ở máy quầy (F-072, ADR-050)
Status: READY_FOR_REVIEW (14/11/2026)
Quyết định: [ADR-050](../quyết-định/ADR-050-bo-doi-nguoi.md) D-221 · Feature: [FEATURE-072](../chức-năng/FEATURE-072.md) (AC-072-04, AC-072-07 sửa), [FEATURE-084](../chức-năng/FEATURE-084.md) (AC-084-01 test) · BR-109
Module: MOD-AUTH, MOD-SHIFT · Màn hình: thanh trên máy quầy (mọi trang), SCR-53 (hộp Chấm công)
Nguồn: chủ dự án 14/11/2026 — "bỏ chức năng đổi người ở màn hình quầy". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-107-bo-doi-nguoi` chồng lên `task/TASK-106-man-quay-mot-man-hinh` · Kế hoạch: [TASK-107-plan.md](../kế-hoạch/TASK-107-plan.md)

## Phạm vi
1. Giao diện: bỏ nút "Đổi người" (`pos-shell.js`), hộp `switchUserDialog` (`staff-pin.js`), chữ "đổi người" trong lời giới thiệu PIN; lời nhắc Hàng pha (`pos-dashboard.js`).
2. Máy chủ: bỏ `POST /api/auth/switch` (`routes/payroll.js`) và `userService.switchTo`.
3. Test: AC-072-04 (kiểm đã bỏ), AC-084-01 (404), E2E AC-072-07 / AC-072-12 (đăng xuất / đăng nhập thay cho Đổi người).
4. Tài liệu: ADR-050, FEATURE-072, BR-109, api-contract, screens-flows, UAT-41, ADR-030, ADR-049 / FEATURE-088, skill, mục lục.

## Không được sửa
PIN chấm công màn chung, PIN thao tác tiền (`X-Actor-Pin`), "Đặt PIN" / "Quên PIN?", khóa tạm khi sai PIN (F-071), đóng ca trước khi đăng xuất (F-054).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · đi thử máy quầy (staff1) 1366 px: không còn nút, đăng xuất / đăng nhập người khác.
