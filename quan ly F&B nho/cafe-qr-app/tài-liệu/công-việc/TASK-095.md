# TASK-095 — Phân quyền rõ ràng, đợt 2: vị trí và cấp của nhân viên (F-078)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-036](../quyết-định/ADR-036-vi-tri-va-cap-nhan-vien.md) D-162…D-166 · Feature: [FEATURE-078](../chức-năng/FEATURE-078.md) (US-078-1/2, AC-078-01…06) · BR-116
Module: MOD-AUTH, MOD-ORDER, MOD-BILLING, MOD-SHIFT · Màn hình: SCR-20 (Tài khoản), SCR-10 (Đơn hàng) + menu máy quầy, SCR-46 (Tra cứu API)
Nguồn: chủ dự án 07/11/2026 "…và nhân viên chia ra từng cấp để dễ giải quyết công việc của mỗi người một cách hiệu quả tối ưu công việc"; agent đề xuất đợt 2 (vị trí + cấp); chủ dự án: "tiến hành làm những cái tôi vừa nhắn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-095-vi-tri-cap-nhan-vien` chồng lên `task/TASK-094-phan-quyen` (chưa gộp `main`) · Kế hoạch: [TASK-095-plan.md](../kế-hoạch/TASK-095-plan.md)

## Mục tiêu
Mỗi nhân viên chỉ thấy và làm phần việc của vị trí mình (thu ngân / pha chế / phục vụ), tiền chỉ qua tay thu ngân; người thử việc không tự giảm giá, chi tiền hay xóa món. Quán không đặt vị trí thì không đổi gì.

## Phạm vi
1. Migration 0054 (`Users.Positions`, `Users.StaffLevel`).
2. Máy chủ: `auth/permissions.js` (`POSITIONS`, `hasPosition`, `isProbation`, `discountRole`, `requirePosition`, `discountLimits('PROBATION')`); `usersRepo` / `userService` / `POST·PUT /api/admin/users` (vị trí + cấp); gắn `requirePosition` ở `staff.js`, `ops.js`, `finance.js`, `giftDrinks.js`; thử việc ở `orderService`, `sessionService`, `splitService` (ngưỡng giảm tay), `cashService.create` (ngưỡng chi 0), `voidService.approverFor`; Tra cứu API ghi `positions`.
3. Giao diện: `js/roles.js` (`hasPosition`, `canOpenPosPage`, nhãn), `pos-shell.js` (menu theo vị trí, chuyển trang, nhãn Thử việc, mở ca), `pos-dashboard.js` (nút theo vị trí), Tài khoản (ô vị trí + cấp, cột vai trò), Tra cứu API; CSS.
4. Test integration + E2E; tài liệu; skill `vi-tri-va-cap-nhan-vien`.

## Không được sửa
Quyền của tài khoản chưa đặt vị trí (= mọi việc); quyền trưởng ca trở lên; gửi bù đơn bán lúc mất mạng; luật duyệt hiện có (chỉ thêm cho thử việc).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **456/456 PASS** (50 file; thêm `staff-positions.test.js` 5 test — AC-078-01…05; test cũ không đổi vì tài khoản test không có vị trí) |
| `npm run test:e2e` | **71/71 PASS** (thêm E2E "vị trí + cấp: chủ quán tạo nhân viên…" — AC-078-06) |
| `npm run trace -- --check` | 176 US, 481 AC — PASS 481, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Hộp Thêm nhân viên (Vị trí, Cấp), danh sách tài khoản (vị trí + nhãn Thử việc), máy quầy của Pha chế thử việc (menu Đơn hàng / Kho & sơ chế / Giờ công, nhãn Thử việc, thẻ bàn không "Gọi món") và của Phục vụ (không nút Hoàn tất) — không cuộn ngang. Sửa theo ảnh: hai nút tắt "Gọi món" / "Mang đi" ở khung Bàn vẫn hiện cho người không có vị trí đó → ẩn |
| `npm run db:migrate` (CafeQrDev) | 0054 đã áp; máy chủ thử nghiệm chạy lại ở `http://10.50.2.7:3000` — tài khoản hiện có = mọi vị trí, chính thức |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
