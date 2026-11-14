# TASK-106 — Màn quầy một màn hình (F-088)
Status: READY_FOR_REVIEW (14/11/2026) — chờ chủ dự án xem ở máy quầy (cổng 3000) và duyệt gộp
Quyết định: [ADR-049](../quyết-định/ADR-049-man-quay-mot-man-hinh.md) D-214…D-220 · Feature: [FEATURE-088](../chức-năng/FEATURE-088.md) (US-088-1…3, AC-088-01…10) · BR-126
Module: MOD-ORDER, MOD-MENU, MOD-ADMIN, MOD-NOTIFY · Màn hình: SCR-10 (Máy quầy), SCR-12 (Trang in), SCR-21 (Thực đơn), SCR-33 (Cài đặt), SCR-05 (Theo dõi đơn của khách)
Nguồn: chủ dự án 13/11/2026 — "thiết kế website hệ thống bán cafe… thực tế… mô hình nhỏ gồm 1 chủ 1 quản lý 2 nhân viên trong 1 ca", "chỉ có 1 màn hình th", "tiến hành làm đi", "nãy tôi kêu tiến hành làm sao không thay đổi gì vậy". Bản thiết kế `THIẾT-KẾ-HỆ-THỐNG-QUÁN-CÀ-PHÊ.md` (mục 4.4, 8.6, 13.1) — đợt 1/5. · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-106-man-quay-mot-man-hinh` chồng lên `task/TASK-105-hoan-thien-doi-ban` (chưa gộp `main`), worktree `../cafe-qr-app-task106` · Kế hoạch: [TASK-106-plan.md](../kế-hoạch/TASK-106-plan.md)

## Mục tiêu
Hai nhân viên dùng chung **một màn hình**: người pha thấy hàng pha, người đứng quầy bán / thu tiền / gọi món tại bàn trên cùng màn hình, không che nhau; bánh / nước chai không chen vào hàng pha; món tại bàn được mang ra và khách biết; quầy tự báo hết món.

## Phạm vi
1. CSDL: migration `0058_man_quay_mot_man_hinh.sql` (`MenuItems.Station`, `Orders.ServedAt`, `Orders.ServedBy`).
2. Máy chủ: `settingsService` + `routes/operations.js` + `STORE_MGR_SETTINGS` (`singleScreen`, `serveMode`), `/api/auth/me`; `menuRepo` / `adminService` / `routes/admin.js` (`station`); `ordersRepo` (`station`, `servedAt`), `orderService.markServed` + `complete` (đơn chỉ có món trạm Quầy), `routes/staff.js` (`POST /orders/:id/served`, `PATCH /menu-items/:id/availability`), `sessionService` (`serveMode` cho khách), `middleware/audit.js` (luật `menu.availability`, `order.served`), sự kiện `order.served`.
3. Giao diện: `pos/index.html` + `pos-dashboard.js` (hai vùng, thẻ, khung nhúng, hộp thoại trong vùng, gom ly, dải Mang ra / Quầy lấy, Hết món, In phiếu, tự in theo máy), `pos-shell.js` (chế độ nhúng, điều hướng), `api.js` / `auth.js`, `ui.js` (`modal` trong vùng), `pos-table-order.js` (thu tiền trong màn chính khi nhúng), `pos.css`, `admin-menu.js`, `admin-settings.js`, `t-track.js`, `customer.js`.
4. Test: `tests/single-screen.test.js` (AC-088-01…05), E2E AC-088-06…09; `kịch-bản/e2e-server.js` đặt `pos.single_screen = false`, `pos.serve_mode = COUNTER` cho bài cũ.
5. **Bổ sung 14/11 (D-220, chủ dự án "làm cho nó đơn giản hơn nữa dễ thao tác"):** màn gọn — `pos-shell.js` (thanh trên một hàng, nút biểu tượng), `pos-dashboard.js` (thẻ đơn / thẻ bàn một nút, việc phụ ở chi tiết đơn / bill, "Đã xong" thu gọn, nút máy in tự in), `pos.css`; E2E AC-088-10.
6. **Sửa theo review G3:** vùng hộp thoại chọn sẵn (`ui.js modal({ host })`), ngăn Quầy tự mở (< 1024 px), Esc theo focus, không hiệu ứng phủ trang, ← / → trong ngăn, "Gọi thêm món" đóng bill, trang nhúng giữ `embed=1` (`pos-table-order.js`, `auth.js topNav`), `sp_DeleteUser` (`ServedBy`), tự in theo "vào Hàng pha lần đầu", tải sẵn thẻ Bán mang đi, dải chỉ dựng lại khi đổi + xét lại mỗi phút, điện thoại theo luật 60 phút (`t-track.js`); test AC-088-03 / 05 / 09 bổ sung.
7. Tài liệu: ADR-049, FEATURE-088, BR-126, user-stories, tc-map, api-contract, realtime-events, data-model, screens-flows, roles-permissions, các mục lục.

## Không được sửa
Quy tắc tiền (bộ `pricing.js`, `sp_SettleSession`, D-1…D-3 — đợt 2 mới đổi bằng ADR riêng), quy trình 1 chạm F-076, cách giữ / trừ kho (ADR-001), quyền các việc khác của F-078, bán khi mất mạng F-074, hành vi các trang quầy khi mở riêng.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · đi luồng thật máy quầy 1920 / 1366 / 1024 px + điện thoại 390 px (staff1, nhatanh quản lý cửa hàng, chủ quán).

## Kết quả kiểm chứng (14/11/2026)
| Lệnh / việc | Kết quả |
| --- | --- |
| `npm run lint` · `npm run format:check` | PASS |
| `npm test` | PASS — 485 / 485 (gồm `single-screen.test.js` 5 bài; bài AC-088-03 phần xóa tài khoản đã thử: bỏ bản sửa `sp_DeleteUser` → 500, có bản sửa → qua) |
| `npm run test:e2e` | PASS — 91 / 91 (flow + a11y; AC-088-06…10, a11y "quầy một màn hình (F-088)") |
| `npm run load:report` | PASS — 10 / 10 vòng; realtime p95 246 ms |
| `npm run trace -- --check` | PASS — 191 US, 527 AC, 527 PASS, 0 FAIL / NOT_RUN / GAP |
| Review G3 độc lập (agent chỉ đọc) | 1 MAJOR + 13 MINOR → đã sửa MAJOR và m2…m13; m14 (một tài khoản cho hai người) ghi giới hạn ở ADR-049 + lời nhắc ở Hàng pha; còn lại nhỏ chưa làm: ETA đếm cả món Quầy lấy, "Làm ngay" đơn hẹn chỉ-món-Quầy chỉ Pha chế thấy, test combo có thành phần Pha chế, test NO_OPEN_SHIFT của "Đã mang" |
| Đi luồng thật (CafeQrTest, script 24 luồng) | 24 / 24 ĐẠT — staff1 (1920 / 1366 / 1024 / 900 px), chỉ Pha chế, chỉ Thu ngân, chỉ Phục vụ, quản lý cửa hàng (như nhatanh), chủ quán, 3 điện thoại 390 px; không lỗi trang / 5xx |
| CafeQrDev | migration 0058 + thủ tục đã áp (chỉ thêm cột); máy chủ cổng 3000 chạy từ worktree `cafe-qr-app-task106` |

NOT_RUN: máy in nhiệt thật (tự in phiếu pha), hai người thật dùng chung một màn hình — xem UAT-58.
