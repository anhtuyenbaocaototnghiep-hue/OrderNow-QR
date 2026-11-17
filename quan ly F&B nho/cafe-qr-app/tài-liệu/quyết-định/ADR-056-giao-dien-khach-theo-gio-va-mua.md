# ADR-056 — Giao diện màn khách theo giờ (sáng / tối) và trang trí theo mùa

- **Trạng thái:** ACCEPTED (16/11/2026). Chủ dự án: "cái dạo này có thể làm sáng tối theo thời gian được không, giống như vào buổi tối giao diện sẽ khác buổi sáng giao diện khác, và theo mùa xuân hạ thu đông" (kèm ảnh màn chào) → đồng ý phương án: "ok tiến hành làm".
- **Bối cảnh:** màn khách (ADR-042, ADR-055) chỉ có một bảng màu sáng. Buổi tối quán thường để đèn vàng mờ, màn trắng chói mắt khách. Chủ dự án muốn giao diện khác nhau theo buổi và theo mùa.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-231 | **Theo giờ (giờ Việt Nam, UTC+7 — cùng mốc với lời chào F-092):** 5:00–10:59 **sáng** — nền sáng như cũ, khung giới thiệu ở màn chào có mặt trời vàng ló ở góc phải trên kèm vòng nắng (không pha vàng lên nền của mùa — vàng trên xanh đêm thành màu rêu đục); 11:00–17:59 **ngày** — như cũ; 18:00–4:59 **tối** — **giao diện tối** cho màn chào, thực đơn, giỏ, theo dõi đơn: nền `#16100c`, thẻ `#221913`, chữ kem `#f2e8dc`, chữ phụ `#bcab98`, màu chính caramel sáng `#e0a473` với chữ trên nút màu espresso `#241710` (nút "+", thanh giỏ, nút chính), khung giới thiệu có chấm sao ở lề trên / dưới (không sát chữ); tương phản đạt AA như ban ngày. ~~Điện thoại khách đang bật **chế độ tối** → tối cả ban ngày.~~ (bỏ — [ADR-060](ADR-060-mau-man-khach-chi-theo-gio-quan.md) D-240: chỉ theo giờ của quán) Trang đang mở tự đổi khi qua mốc giờ (kiểm 30 giây / lần, không tải lại), lời chào đổi theo. **Vẽ đúng ngay từ đầu (không nháy trắng):** script thường nhỏ `js/guest-theme.js` trong `<head>` đặt `data-daypart` / `data-theme` / `data-season` trên `<html>` trước khi trang vẽ, dùng cài đặt nhớ ở máy (`localStorage` `guest-theme`, chưa có = bật), rồi đọc `GET /api/shop` để cập nhật — **gọi không kèm cookie** (`credentials: "omit"`): khách mới quét QR lần đầu chưa có cookie danh tính `cf_client`, nếu lời gọi này cũng nhận cookie thì hai lời gọi cùng lúc (đọc cài đặt + quét QR) được cấp hai cookie khác nhau, cookie về sau đè cookie đã gắn với nhóm → điện thoại mất nhóm (lỗi tìm ra khi chạy E2E, đã chặn bằng bài test). Chỉ ba trang `t/index`, `t/menu`, `t/track`; trang quà ly tặng, vòng quay, chính sách dữ liệu, màn quầy, trang Quản lý không đổi. |
| D-232 | **Trang trí theo mùa (tháng dương lịch, giờ Việt Nam) — chỉ khung giới thiệu ở màn chào:** **Xuân** tháng 1–3 — nền đỏ trầm, hoa mai vàng 5 cánh; **Hạ** 4–6 — nền xanh rêu, ly đá mát + giọt nước; **Thu** 7–9 — nền cam đất, lá vàng; **Đông** 10–12 — nền xanh đêm, ly nóng + bông tuyết. Mỗi mùa: màu nền khung, hình lớn trong vòng tròn, vài hình nhỏ mờ trang trí (không nhận chạm, trình đọc màn hình bỏ qua). Nút, giá, chữ, thẻ món giữ màu quán. |
| D-233 | **Cài đặt** ở Cài đặt → Màn gọi món của khách: "Tự đổi sáng / tối theo giờ" (`guest.daypart_theme`, `guestDaypartTheme`) và "Trang trí theo mùa" (`guest.season_decor`, `guestSeasonDecor`), mặc định **bật**; chủ quán và quản lý cửa hàng đổi được (như F-083, F-092). `GET /api/shop` (công khai) thêm `guestTheme: { daypart, season }`. Tắt cả hai → màn khách như trước. E2E cũ chạy với cả hai tắt (như F-088, F-092); bài mới dùng đồng hồ giả của Playwright. |

## Phương án đã cân nhắc

- **Theo giờ mặt trời mọc / lặn thật:** cần vị trí và bảng thiên văn; mốc cố định 5 / 11 / 18 giờ dễ hiểu, khớp lời chào.
- **Đổi cả bảng màu theo mùa:** rối mắt, mất nhận diện quán, phải kiểm tương phản 4 bộ màu → chỉ trang trí khung giới thiệu.
- **Xuân theo âm lịch (Tết):** cần lịch âm; tháng 1–3 dương lịch phủ Tết hầu hết các năm.
- **Áp cho màn quầy / Quản lý:** nhân viên cần màn ổn định, quầy có đèn riêng → không áp.
- **Đọc cài đặt trước rồi mới tô màu:** khách mới quét lần đầu (đa số) sẽ thấy trang trắng rồi mới tối → dùng mặc định "bật" + nhớ ở máy.

## Hệ quả

- **Mã nguồn:** `js/guest-theme.js` (mới), `t/index.html`, `t/menu.html`, `t/track.html` (gắn script trong `<head>`), `css/customer.css` (bảng màu tối, mùa, quầng nắng / sao), `css/base.css` (`--c-on-primary` cho chữ trên nền màu chính), `js/pages/t-entry.js` (hình mùa trong khung giới thiệu, lời chào đổi theo giờ), `js/icons.js` (mai — vẽ riêng 5 cánh; cup-soda, droplet, leaf, snowflake — Lucide), `services/settingsService.js`, `routes/operations.js`, `auth/permissions.js`, `js/pages/admin-settings.js`, `kịch-bản/e2e-server.js`. Không migration.
- **Sửa kèm (F-092):** tên quán ở đầu thực đơn (liên kết về màn chào) cao 21 px → đệm dọc 2 px cho vùng chạm ≥ 24 px (WCAG 2.5.8) — bài a11y giao diện tối phát hiện vì chạy với màn chào bật.
- **Test:** `guest-theme.test.js` (AC-094-01); E2E theo giờ (AC-094-02), theo mùa (AC-094-03); a11y giao diện tối (AC-094-04); `basic-mode.test.js` cập nhật hợp đồng `/api/shop`.
- **Tài liệu:** FEATURE-094, api-contract, roles-permissions, design-system (bảng màu tối, mùa), screens-flows, user-stories, use-cases, tc-map.
