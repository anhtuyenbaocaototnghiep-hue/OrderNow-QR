# TASK-074 — Kế hoạch: QR Wi-Fi cho khách (FEATURE-059)

## Khảo sát (tên thật trong code)
| Thứ | Ở đâu |
| --- | --- |
| Cài đặt (key–value) | `dbo.Settings`; `services/settingsService.js` (`toSettings`, `KEYS`, `updateSettings`); route `PUT /api/admin/settings` trong `routes/operations.js` (zod) |
| Ảnh QR bàn | `services/adminService.js` `qrPng()` dùng thư viện `qrcode`; route `GET /api/admin/tables/:id/qr.png` trong `routes/admin.js` |
| Trang In QR | `admin/qr-print.html` + `js/pages/admin-qr-print.js`; CSS `.qr-grid`, `.qr-card` trong `css/admin.css` |
| Trang Cài đặt | `js/pages/admin-settings.js` (thẻ "Thông tin quán" F-053, nút "Lưu cài đặt" gửi các trường đã đổi) |
| Nhật ký thao tác | `middleware/audit.js` `sanitize()` bỏ mọi khóa khớp `/pass(word)?|hash|token|secret|otp/i` → `wifi.password`, `wifiPassword` không vào nhật ký |
| Quyền | `/api/admin/*` dùng `requireAdmin` → chỉ ADMIN |

## Thiết kế
- `src/utils/wifiQr.js`: `wifiQrText({ ssid, password })` → `WIFI:T:WPA;S:…;P:…;;` / `WIFI:T:nopass;S:…;;`, thoát `\ ; , : "`.
- `adminService.wifiQrPng()`: đọc cài đặt; không có tên → `404`; `QRCode.toBuffer` như QR bàn.
- Route zod: `wifiSsid` trim, ≤ 32 byte UTF-8; `wifiPassword` rỗng hoặc 8–63 ký tự (không trim).
- In QR: tải cài đặt + ảnh QR Wi-Fi một lần, gắn vào mọi thẻ bàn.

## Test
- `tests/wifi-qr.test.js`: unit `wifiQrText` (thoát ký tự, nopass); integration lưu / đọc / ảnh PNG / 404 / 400 / 403 / 401 / nhật ký không có mật khẩu.
- E2E (flow): nhập Wi-Fi ở Cài đặt → trang In QR có khối Wi-Fi; a11y quét lại trang Cài đặt và In QR.
- Rủi ro: thẻ bàn dài hơn khi in → kiểm in A4 vẫn không cắt thẻ (`break-inside: avoid` có sẵn).
