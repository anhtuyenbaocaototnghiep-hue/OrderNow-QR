# TASK-113 — Kế hoạch: màn chào khi quét QR (F-092, ADR-054)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| Cài đặt | `services/settingsService.js`, `routes/operations.js`, `auth/permissions.js`, `js/pages/admin-settings.js` | `guestWelcome` (`guest.welcome`, mặc định bật), quản lý cửa hàng đổi được (như `menuSheetAll`) |
| API công khai | `services/menuService.js` (`ui.welcome`), `routes/public.js` (`shop.address`) | Màn chào đọc cùng lời gọi `/api/menu` (ưu đãi đang chạy, quán tạm ngưng / chưa mở ca) |
| Màn chào | `js/pages/t-entry.js`, `css/customer.css`, `js/icons.js` | `enter()` → tải `/api/menu` + `/api/sessions/{id}` → màn chào (hoặc chuyển thẳng thực đơn khi tắt / lỗi); lời nhắn chuyển tiếp như cũ |
| Việc nhanh | `js/call-staff.js` (mới), `js/pages/t-track.js` | Hộp Gọi nhân viên dùng chung; `?act=pay` mở hộp Gọi thanh toán sau lần tải đầu (chỉ nhóm OPEN có đơn) |
| Quay lại | `js/pages/t-menu.js` | Tên quán đầu thực đơn là liên kết về `/t/{qr}` khi bật |
| Test | `tests/guest-welcome.test.js`, `flow.spec.js`, `a11y.spec.js`, `kịch-bản/e2e-server.js` | E2E cũ chạy với cài đặt tắt; bài mới tự bật rồi trả lại |

Rủi ro: 34 bài E2E cũ vào bằng địa chỉ QR và chờ `/menu` → giữ nguyên nhờ seed tắt; luồng mặc định (bật) có bài riêng. Bàn thử W1 / W2 dọn ở `finally`.
