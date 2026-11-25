# TASK-135 — Kế hoạch: số điện thoại quán + chữ WIFI giữa mã Wi-Fi (ADR-070)

- **Vì sao cần plan:** đổi hợp đồng API (`shopPhone`, `shop.phone`, `/api/shop` `phone`) và chạm ≥ 2 module (Cài đặt, hóa đơn, màn khách, thẻ QR, phiếu đặt hàng).
- **Không đổi:** CSDL (khóa mới trong bảng Settings, không migration), quyền (chỉ ADMIN như tên / địa chỉ), realtime, mã QR gọi món.

## Các bước

1. **Máy chủ:**
   - `utils/shopPhone.js` — `isShopPhone()`.
   - `settingsService`: `shopPhone` ← `shop.phone`; khóa `KEYS.shopPhone`; `shopInfo()` / `publicShop()` thêm `phone` (null khi chưa có).
   - `routes/operations.js`: trường `shopPhone` (trim, ≤ 20, gộp khoảng trắng, kiểm `isShopPhone`).
   - `routes/public.js`: `/api/menu` `shop.phone`.
   - `adminService.wifiQrPng`: mức sửa lỗi H.
2. **Giao diện:**
   - `admin-settings.js`: ô "Số điện thoại quán", chỉ gửi khi đổi.
   - `pos-receipt.js`, `offline-sales.js` (hóa đơn + phiếu bán tay), `admin-po-print.js`: dòng "ĐT: …".
   - `t-entry.js` + `customer.css` + `icons.js` (`phone`): số bấm gọi ở màn chào.
   - `table-card.js`: `wifiBadge()` giữa mã Wi-Fi, số ở chân thẻ; `admin-qr-print.js` truyền số + bản văn bản ẩn.
3. **Test:**
   - `tests/shop-info.test.js`: AC-053-06, AC-053-07; ba chỗ `deepEqual` cũ thêm `phone: null` (hợp đồng mới, không làm yếu test).
   - E2E `flow.spec.js` "số điện thoại quán + chữ WIFI…" (AC-053-08, AC-010-10): đo điểm ảnh giữa mã Wi-Fi.
   - Kiểm riêng bằng jsQR (không thêm vào dự án): thẻ vẽ bằng `table-card.js`, mã Wi-Fi mức H giải đúng ở 100 / 60 / 40 %.
4. **Tài liệu:** ADR-070, FEATURE-053, FEATURE-010, BR-085, US-053-1, US-010-2, api-contract, screens-flows, tc-map, README chỉ mục.
5. **Vận hành:** khởi động lại máy chủ của quán; in lại thẻ bàn để có chữ WIFI + số điện thoại.

## Rủi ro

- **Nhãn che mã Wi-Fi:** mức H + nhãn ~9 % diện tích. Đã kiểm bằng bộ giải mã thật, cả bản thu nhỏ.
- **Hợp đồng `shop` có thêm khóa `phone`:** máy khách cũ bỏ qua khóa lạ. Test cũ so sánh nguyên đối tượng được cập nhật.
