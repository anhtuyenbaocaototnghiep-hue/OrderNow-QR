# TASK-077 — Kế hoạch: chế độ cơ bản, hướng dẫn quầy, chính sách dữ liệu, cảnh báo QR (FEATURE-061…063)

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Menu quản lý | `public/js/admin-shell.js` (`NAV`: 6 nhóm, mục `[khóa, đường dẫn, tên, tên đầy đủ]`, `mountAdminShell(active)`) |
| Thanh quầy | `public/js/pos-shell.js` (`nav` 5 mục, có "Kho & sơ chế" `/pos/stock`; `#shift-btn`, `#no-shift`) |
| Trang Đơn hàng | `public/pos/index.html` (`#col-PENDING`, `#col-PREPARING`, `#tables-panel`, `#tables-toggle` ở màn < 1200 px), `pages/pos-dashboard.js` |
| Phiên đăng nhập | `GET /api/auth/me` (`routes/public.js`) → `{ user, shop }`; `public/js/auth.js` `current`; `usersRepo` (`COLS`, `map`) |
| Cài đặt | `settingsService` (`toSettings`, `KEYS`, `csv`), route `PUT /api/admin/settings` (`routes/operations.js`), `pages/admin-settings.js` (`card()`) |
| Đồng ý / ẩn danh hội viên | **Đã có**: `memberService.register` (`CONSENT_REQUIRED`), `Members.ConsentAt`, `POST /api/admin/members/{id}/anonymize`; câu đồng ý ở `js/member-box.js`, `js/billing-controls.js`, `pages/pos-table-order.js` |
| QR bàn | `adminService.qrUrl` = `config.publicBaseUrl + /t/{token}`; trang in `pages/admin-qr-print.js` (nút In → `window.print()`), `pages/admin-tables.js` |
| Trang tĩnh | `routes/pages.js` (bảng đường dẫn → file trong `public/`) |
| Seed | `kịch-bản/seed-data.js` `seedBase` (tài khoản, menu) — test + cài đặt; `seedDemo` — E2E + `db:seed --demo` |

## Thiết kế
- `utils/modules.js` (dùng chung server): `MODULES = ['inventory','customers','finance','analytics','advanced']`.
- `settingsService`: `uiModules` = `csv(ui.modules)` lọc theo `MODULES`; KEYS thêm `uiModules: 'ui.modules'`; route zod `z.array(z.enum(MODULES)).refine(unique)`.
- `auth/me` → `{ user (có tourSeenAt), shop, modules }`; `POST /api/auth/tour-seen` (`usersRepo.markTourSeen`: `SET TourSeenAt = COALESCE(TourSeenAt, SYSUTCDATETIME())`).
- `admin-shell.js`: mỗi mục / nhóm gắn `module`; ẩn khi không có trong `current.modules`; nhóm rỗng thì bỏ; trang đang ẩn → dải `.alert` nhắc + link Cài đặt; dải cảnh báo QR lệch (gọi `/api/qr-check`).
- `pos-shell.js`: ẩn "Kho & sơ chế" khi tắt `inventory`; nút "Hướng dẫn"; dải QR lệch; `js/pos-tour.js` — lớp phủ 5 bước (khoanh phần tử bằng `outline` + hộp thoại `role=dialog`, focus vào hộp, Esc = bỏ qua, Tab vòng trong hộp), tự mở ở trang Đơn hàng khi `tourSeenAt` rỗng; ở màn < 1200 px bước "Bàn" mở ngăn bàn trước.
- `qrCheckService`: đọc `qr.printed_base_url` / `qr.printed_at` (settingsRepo), so `config.publicBaseUrl`; `localhost` theo host. Route `GET /api/qr-check` (requireStaff), `POST /api/admin/qr-printed`. `server.js` log cảnh báo lúc khởi động.
- Trang `public/chinh-sach-du-lieu.html` + `js/pages/privacy.js` (đọc `GET /api/shop`), route trang.
- Migration 0041 + `seedBase` đặt `TourSeenAt` cho tài khoản nó tạo; `seedDemo` đặt `ui.modules` đủ 5 nhóm.

## Test
- `tests/basic-mode.test.js`: AC-061-01…04, AC-062-01…02, AC-063-01…03 (đổi `config.publicBaseUrl` trong tiến trình test để tạo lệch).
- E2E: cơ bản → bật Kho hàng; hướng dẫn 5 bước với tài khoản mới; chính sách dữ liệu từ giỏ; In QR lưu địa chỉ + dải lệch (giả lập `qr-check` bằng `page.route` vì máy chủ E2E chỉ có một địa chỉ). Bài E2E có tài khoản `lead-e2e` mới đăng nhập quầy → bấm "Bỏ qua" hướng dẫn.
- Rủi ro: lớp hướng dẫn che nút trong E2E cũ (chỉ tài khoản mới mới hiện); a11y quét trang mới + hộp hướng dẫn.
