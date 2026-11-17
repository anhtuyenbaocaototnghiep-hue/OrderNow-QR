# ADR-057 — Logo quán

- **Trạng thái:** ACCEPTED (16/11/2026). Chủ dự án: "làm thêm chỗ úp hình lên logo nha" (16/11/2026, sau khi xem màn chào).
- **Bối cảnh:** quán chỉ có tên + địa chỉ (F-053). Chỗ "dấu hiệu quán" (thanh quầy, thanh bên Quản lý) là biểu tượng ly cà phê chung; màn chào (F-092), thực đơn, hóa đơn, thẻ QR chỉ có chữ. App đã có cách nhận ảnh an toàn cho ảnh hóa đơn sổ quỹ (F-033: thân request là ảnh, kiểm chữ ký tệp, lưu `uploads/`).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-234 | **Tải logo ở Cài đặt → Thông tin quán** (chỉ chủ quán — như tên / địa chỉ quán): khung xem trước + "Chọn ảnh…" (lưu ngay khi chọn) + "Bỏ logo" (hỏi lại). Ảnh **jpg / png / webp ≤ 1 MB**, kiểm chữ ký tệp (không nhận SVG — có thể chứa mã chạy). Lưu `uploads/brand/logo-<ngẫu nhiên>.<đuôi>`, cài đặt `shop.logo` = đường dẫn tương đối; ảnh mới thay → xóa tệp cũ. API: `PUT /api/admin/settings/logo` (thân là ảnh, như ảnh hóa đơn — không multipart), `DELETE /api/admin/settings/logo`; công khai `GET /api/shop/logo` (tệp ảnh, lưu đệm lâu vì địa chỉ có `?v=<tên tệp>` đổi mỗi lần thay). `logoUrl` (chuỗi hoặc `null`) thêm vào `shop` của `GET /api/shop`, `GET /api/menu`, `GET /api/auth/me` và phiếu in. |
| D-235 | **Logo hiện ở:** màn chào (trên tên quán), đầu thực đơn (ô tròn trước tên quán), thanh quầy, thanh bên Quản lý, trang Hôm nay, trang đăng nhập Quản lý (thay biểu tượng ly cà phê), hóa đơn / phiếu tạm tính in (trên tên quán), thẻ QR in cho bàn. Ảnh đặt trong khung tròn nền trắng, `object-fit: contain` (logo chữ không bị cắt), chữ thay thế "Logo <tên quán>" (chỗ đã có tên quán ngay bên cạnh thì để trống chữ thay thế). Chưa có logo → như cũ. |

## Phương án đã cân nhắc

- **Nhập địa chỉ ảnh (URL) như ảnh món:** chủ quán thường có logo trong máy / điện thoại, không có chỗ đăng ảnh; ảnh ở trang khác có thể mất → tải lên máy chủ quán.
- **Nhận SVG:** sắc nét nhưng SVG có thể chứa mã chạy trong trình duyệt → chỉ ảnh điểm.
- **Tự cắt / thu nhỏ ảnh ở máy chủ:** cần thư viện xử lý ảnh (dependency lớn) → giới hạn 1 MB + hiển thị `contain`; gợi ý dùng ảnh vuông.
- **Cho quản lý cửa hàng đổi:** logo là nhận diện quán như tên quán → chỉ chủ quán.

## Hệ quả

- **Mã nguồn:** `services/brandService.js` (mới — kiểm ảnh, lưu, xóa, đọc tệp), `services/settingsService.js` (`shop.logo`, `logoUrl`), `routes/operations.js` (PUT / DELETE logo), `routes/public.js` (`GET /api/shop/logo`, `logoUrl` ở /shop, /menu, /auth/me), phiếu in (`logoUrl`), `js/icons.js` (`brandMark(shop)`), `js/pages/admin-settings.js`, `t-entry.js`, `t-menu.js`, `pos-shell.js`, `admin-shell.js`, `admin-today.js`, `admin-login.js`, `pos-receipt.js`, `admin-qr-print.js`, CSS. Không migration (cài đặt dạng khóa – giá trị).
- **Test:** `shop-logo.test.js` (AC-095-01); E2E logo (AC-095-02); a11y logo (AC-095-03).
- **Tài liệu:** FEATURE-095, FEATURE-053 (ghi chú), api-contract, roles-permissions, design-system, screens-flows, user-stories, use-cases, tc-map.
