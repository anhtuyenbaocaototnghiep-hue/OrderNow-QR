# TASK-116 — Kế hoạch: logo quán (F-095, ADR-057)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| Lưu ảnh | `services/brandService.js` (mới) | kiểm chữ ký jpg / png / webp, ≤ 1 MB, ghi `uploads/brand/logo-<ngẫu nhiên>.<đuôi>` (`wx`), đổi cài đặt `shop.logo`, xóa tệp cũ; đọc tệp chống thoát thư mục (như ảnh hóa đơn F-033) |
| API | `routes/operations.js` (PUT / DELETE `/settings/logo` — chỉ chủ quán), `routes/public.js` (`GET /shop/logo`; `logoUrl` ở /shop, /menu, /auth/me), phiếu in | thân request là ảnh (`express.raw`), lỗi quá cỡ → `LOGO_TOO_LARGE` |
| Giao diện | `js/icons.js` `brandMark(shop)`, `admin-settings.js`, `t-entry.js`, `t-menu.js`, `pos-shell.js`, `admin-shell.js`, `admin-today.js`, `admin-login.js`, `pos-receipt.js`, `admin-qr-print.js`, CSS | khung tròn nền trắng `contain`; chưa có logo → ly cà phê |
| Test | `tests/shop-logo.test.js`, `flow.spec.js`, `a11y.spec.js` | ảnh png / jpg nhỏ tạo trong test (không thêm tệp mẫu); dọn logo ở `finally` |

Rủi ro: (1) tệp ảnh lưu ngoài CSDL → sao lưu thư mục `uploads/` cùng CSDL (đã có cho ảnh hóa đơn). (2) Đường dẫn ảnh do người dùng gửi → tên tệp do máy chủ tạo, đọc tệp kiểm nằm trong `uploads/brand/`. (3) Lưu đệm trình duyệt → địa chỉ có `?v=` đổi mỗi lần thay ảnh.
