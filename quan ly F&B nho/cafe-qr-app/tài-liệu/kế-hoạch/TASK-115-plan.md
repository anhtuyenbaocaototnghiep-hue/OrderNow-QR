# TASK-115 — Kế hoạch: giao diện màn khách theo giờ và theo mùa (F-094, ADR-056)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| Cài đặt | `services/settingsService.js`, `routes/operations.js`, `auth/permissions.js`, `js/pages/admin-settings.js` | `guestDaypartTheme` (`guest.daypart_theme`), `guestSeasonDecor` (`guest.season_decor`), mặc định bật; quản lý cửa hàng đổi được |
| API công khai | `routes/public.js` `GET /api/shop` | thêm `guestTheme: { daypart, season }` (trang theo dõi đơn không tải thực đơn nên đọc ở đây) |
| Tô màu sớm | `js/guest-theme.js` (mới, script thường), `t/index.html`, `t/menu.html`, `t/track.html` | đặt thuộc tính trên `<html>` trước khi vẽ; nhớ cài đặt ở máy; kiểm 30 giây / lần; sự kiện `guest-theme` khi đổi buổi |
| Màu | `css/customer.css`, `css/base.css` | `:root[data-theme='dark']` đổi token + vài chỗ màu cố định; `--c-on-primary`; quầng nắng / chấm sao; 4 mùa cho `.h-hero` |
| Màn chào | `js/pages/t-entry.js`, `js/icons.js` | hình theo mùa (CSS chọn theo `data-season`), lời chào vẽ lại khi đổi buổi |
| Test | `tests/guest-theme.test.js`, `tests/basic-mode.test.js`, `flow.spec.js`, `a11y.spec.js`, `kịch-bản/e2e-server.js` | E2E cũ chạy với hai cài đặt tắt; bài mới dùng đồng hồ giả (`page.clock`) |

Rủi ro: (1) bài a11y cũ chạy theo đồng hồ thật — buổi tối sẽ gặp giao diện tối → seed tắt hai cài đặt. (2) Đồng hồ giả của Playwright làm giả cả hẹn giờ của trang → chỉ dùng `install` + `fastForward` ở bài đổi giờ khi đang mở, các bài khác dùng `setFixedTime`. (3) Màu cố định trong CSS lọt qua giao diện tối → quét tương phản a11y ở 20:00 trên cả 5 màn.
