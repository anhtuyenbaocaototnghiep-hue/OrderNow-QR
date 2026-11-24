# TASK-133-plan — Chuyển khoản qua nhân viên: mã chỉ trên bill (F-099, ADR-069)

## Mục tiêu

Kẻ gian dán mã QR giả ở bàn không lấy được tiền: điện thoại khách không hiện mã chuyển khoản (mặc định), nhân viên mang bill in sẵn mã QR. In bill một chạm từ dải Gọi thanh toán.

## Điểm chạm

| Tầng | Tệp | Thay đổi |
| --- | --- | --- |
| Cài đặt | `settingsService.js`, `routes/operations.js` | `guestTransferQr` ↔ `pay.guest_qr` (mặc định tắt, chỉ chủ quán); `/api/shop` `transfer.guestQr` |
| Service | `sessionService.transferForCustomer` | `409 TRANSFER_STAFF_ONLY` khi quán nhận chuyển khoản mà công tắc tắt (sau kiểm quyền xem nhóm) |
| Khách | `pages/t-track.js`, `customer.css` | hộp gọi thanh toán, thông báo, thẻ "Đã gọi thanh toán" (`.pay-safe`) |
| Quầy | `pages/pos-dashboard.js`, `pos.css` | nút "In bill" ở dải (`.pay-item`), chân hộp Thu tiền "In bill" |
| Bill | `pages/pos-receipt.js` | "Chủ tài khoản: …" + dòng kiểm tên |
| Quản lý | `pages/admin-settings.js`, `pages/admin-qr-print.js`, `admin.css` | công tắc + giải thích; khung "Mã này chỉ để gọi món…" trên thẻ bàn (`.qr-safe`) |
| CSDL / realtime | — | không đổi (Settings khóa / giá trị) |

## Rủi ro

- **Bài cũ thử mã trên điện thoại khách** (transfer-qr, bank-feed, E2E QR1 / SP1, a11y AQ1): bật `guestTransferQr` trong bài, trả lại cuối bài.
- **`/api/shop` có thêm `guestQr`:** bài bank-feed kiểm "không lộ thêm gì" → cập nhật danh sách khóa (chỉ cờ, không số tài khoản).
- **Dữ liệu thật:** sau khởi động lại, điện thoại khách hết thấy mã (mặc định tắt). Báo chủ quán: in lại thẻ bàn, nhân viên dùng nút "In bill".

## Kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- Khởi động lại máy chủ của quán.
