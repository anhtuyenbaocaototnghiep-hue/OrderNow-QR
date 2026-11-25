# ADR-070 — Số điện thoại quán trong Cài đặt + chữ "WIFI" giữa mã Wi-Fi trên thẻ bàn

- **Trạng thái:** ACCEPTED (25/11/2026).
- **Chủ dự án yêu cầu (25/11/2026):**
  1. "làm sạch dữ liệu , cài đặt thêm chỗ số điện thoại".
  2. "làm lại hình mã QR ở wifi quán này ghi thêm wifi nữa".
- **Cách hiểu (agent ghi lại để chủ dự án xác nhận):**
  - Ý 1 — "cài đặt thêm chỗ số điện thoại": thẻ **Thông tin quán** trong Cài đặt đã có tên, địa chỉ, logo nhưng chưa có số điện thoại. Thêm ô số điện thoại quán, in cùng chỗ với địa chỉ. "Làm sạch dữ liệu" là việc dữ liệu riêng (không nằm trong ADR này), chờ chủ dự án duyệt danh sách xóa.
  - Ý 2: quán đã nhập Wi-Fi trong Cài đặt nên thẻ bàn đã có mã Wi-Fi, nhưng mã Wi-Fi và mã gọi món nhìn giống nhau. Ghi chữ **WIFI** ngay trên mã Wi-Fi để khách nhận ra.
- **Liên quan:** [FEATURE-053](../chức-năng/FEATURE-053.md) (tên / địa chỉ quán, BR-085), [FEATURE-059](../chức-năng/FEATURE-059.md) (QR Wi-Fi, BR-092), [FEATURE-010](../chức-năng/FEATURE-010.md) (thẻ QR bàn — TASK-134).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-262 | **Số điện thoại quán** (không bắt buộc) ở Cài đặt → Thông tin quán, khóa `shop.phone` trong `dbo.Settings` (không migration — bảng khóa / giá trị).<ul><li>**Ai đổi:** chỉ chủ quán, như tên / địa chỉ (không thêm vào `STORE_MGR_SETTINGS`).</li><li>**Hợp lệ:** tối đa 20 ký tự; chỉ gồm chữ số, khoảng trắng, `.`, `-`, `(`, `)` và dấu `+` ở đầu. Đếm chữ số: `0` + 9–10 số (di động, số bàn), `+84` + 9–10 số, hoặc tổng đài `1800` / `1900` + 4–6 số. Sai → `400 VALIDATION_ERROR` ở trường `shopPhone`. Rỗng = không in.</li><li>**Giữ cách viết** của chủ quán (vd. `0909 123 456`), chỉ bỏ khoảng trắng hai đầu và gộp khoảng trắng liền nhau.</li><li>**Một nguồn**, đọc chung qua `settingsService.shopInfo()`: hóa đơn / phiếu tạm tính, hóa đơn bán lúc mất mạng + phiếu bán tay, phiếu đặt hàng gửi nhà cung cấp, chân thẻ QR bàn, màn chào khi quét QR (bấm là gọi — `tel:`).</li><li>**Thông tin công khai** như địa chỉ: `GET /api/menu` và `GET /api/shop` trả `shop.phone` / `phone` (null khi chưa có). Nhật ký thao tác vẫn che số như mọi trường có "phone" (không đổi).</li></ul> |
| D-263 | **Chữ "WIFI" giữa mã Wi-Fi trên thẻ bàn.**<ul><li>Thẻ bàn (TASK-134) vẽ một ô trắng viền xanh rêu ở giữa mã Wi-Fi, có biểu tượng sóng Wi-Fi và chữ **WIFI**.</li><li>Mã Wi-Fi (`GET /api/admin/wifi-qr.png`) đổi mức sửa lỗi **M → H** (khôi phục ~30 %). Nhãn 78 px trên mã 280 px che khoảng 9 % diện tích.</li><li>Kiểm bằng bộ giải mã thật (jsQR) trên thẻ vẽ bằng `table-card.js`: mức H giải đúng cả ba mẫu (mật khẩu ngắn, mật khẩu 63 ký tự, mạng mở), kể cả khi thu nhỏ còn 40 %. Mức M thu nhỏ 40 % thì một mẫu không giải được.</li><li>**Mã gọi món không đổi** (mức M, không che gì) — đường dẫn bàn vẫn như cũ.</li></ul> |

## Phương án đã cân nhắc

- **Chỉ đổi dòng chữ "① Quét để vào Wi-Fi" to hơn:** khách vẫn phải đọc chữ phía trên mới biết; nhìn mã không phân biệt được. Bỏ.
- **Đổi màu khung mã Wi-Fi:** in đen trắng thì mất tác dụng. Bỏ.
- **Đặt chữ giữa mã nhưng giữ mức M:** thu nhỏ (camera xa / ảnh mờ) có mẫu không quét được. Bỏ.
- **Số điện thoại lấy từ tài khoản chủ quán (`Users.Phone`, ADR-053):** đó là số riêng của người, không phải số của quán, và chỉ chủ quán xem được. Bỏ.

## Hệ quả

- **Mã nguồn:**
  - máy chủ: `utils/shopPhone.js` (mới — kiểm số), `settingsService` (`shopPhone`, `shopInfo().phone`, `publicShop().phone`), `routes/operations.js` (trường `shopPhone`), `routes/public.js` (`/api/menu` `shop.phone`), `adminService.wifiQrPng` (mức H);
  - giao diện: `admin-settings.js` (ô "Số điện thoại quán"), `pos-receipt.js`, `offline-sales.js`, `admin-po-print.js`, `t-entry.js` (màn chào, `.h-phone`), `table-card.js` (`wifiBadge`, số ở chân thẻ), `admin-qr-print.js`, `icons.js` (`phone`), `customer.css`.
- **Vận hành:** **phải khởi động lại máy chủ** (đổi kiểm tra cài đặt + mã Wi-Fi). Muốn thẻ có chữ WIFI / số điện thoại thì in lại thẻ bàn (Bàn & mã QR → In).
- **Tài liệu:** FEATURE-053 (AC-053-06…08), FEATURE-010 (AC-010-10), BR-085, US-053-1, US-010-2, api-contract, screens-flows, tc-map.
