---
name: man-quay-mot-man-hinh
description: Màn quầy một màn hình của cafe-qr-app (F-088, ADR-049 D-214…D-220, BR-126, TASK-106, migration 0058) — /pos hai vùng Hàng pha (trái) / Quầy (phải, thẻ Bàn · Bán mang đi · Gọi món tại bàn · Ca & két nhúng trang quầy ?embed=1), hộp thoại chỉ phủ vùng mở nó (setModalHost, .overlay.in-zone, không aria-modal), trạm làm món MenuItems.Station BAR / COUNTER (dải "Quầy lấy", "Quầy lấy kèm"), mang ra bàn (pos.serve_mode TABLE, POST /api/orders/{id}/served, Orders.ServedAt / ServedBy, sự kiện order.served, dải "Mang ra" + "Đã mang", điện thoại "nhân viên đang mang ra bàn"), báo hết món tại quầy (PATCH /api/menu-items/{id}/availability, vị trí Pha chế), gom ly + In phiếu + tự in theo máy (cf_auto_ticket); màn gọn D-220 (body.pos-compact: thanh trên một hàng, nút biểu tượng; thẻ đơn / thẻ bàn một nút, việc phụ ở chi tiết đơn / bill; "Đã xong" thu gọn). Dùng khi task chạm pos-dashboard.js vùng / thẻ / khung nhúng, embed.js, pos.single_screen, pos.serve_mode, station, servedAt, hoặc nhắc "một màn hình", "hàng pha", "mang ra bàn", "đã mang", "quầy lấy", "gom ly", "hết món ở quầy", "in phiếu pha".
---

# Mục đích

Ghi lại F-088 (13/11/2026, đợt 1/5 của bản thiết kế quán cà phê) để người làm sau không phá các bảo đảm: hai người dùng chung **một màn hình** không che nhau, bánh / nước chai không chen vào hàng pha, món tại bàn được mang ra và khách biết, người pha tự báo hết món.

| Tài liệu     | Đường dẫn                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Quyết định   | `tài-liệu/quyết-định/ADR-049-man-quay-mot-man-hinh.md` (D-214…D-220); bổ sung ADR-018 (ngưỡng 1024 px)         |
| Chức năng    | `tài-liệu/chức-năng/FEATURE-088.md` (US-088-1…3, AC-088-01…10, BR-126)                                         |
| Việc         | `tài-liệu/công-việc/TASK-106.md`; kế hoạch `tài-liệu/kế-hoạch/TASK-106-plan.md`                                |
| Dữ liệu      | `cơ-sở-dữ-liệu/chuyển-đổi/0058_man_quay_mot_man_hinh.sql` (`MenuItems.Station`, `Orders.ServedAt`, `ServedBy`) |
| Thiết kế gốc | `THIẾT-KẾ-HỆ-THỐNG-QUÁN-CÀ-PHÊ.md` ở thư mục cha / `nop-bai/` (mục 4.4, 8.6, 13.1)                             |

# Luật (đã chạy)

- **Cài đặt** (`settingsService`): `singleScreen` = `pos.single_screen !== 'false'` (mặc định bật), `serveMode` = `pos.serve_mode === 'COUNTER' ? 'COUNTER' : 'TABLE'`. Có trong `STORE_MGR_SETTINGS` (quản lý cửa hàng đổi được). `/api/auth/me` → `pos: { oneTap, singleScreen, serveMode }`; phiên khách (`sessionService.getDetail`) → `serveMode`. `kịch-bản/e2e-server.js` đặt `false` / `COUNTER` cho bài E2E cũ — bài F-088 tự bật rồi trả lại trong `finally`.
- **Hai vùng** (`pos-dashboard.js`, khối `if (singleScreen)`): `.orders-area` → `.zone.zone-bar` ("Hàng pha"), `#tables-panel` → `.zone.zone-counter` ("Quầy") với `.counter-tabs` > `.counter-tablist[role=tablist]` (chỉ chứa thẻ — nút "Đóng" ngăn trượt nằm **ngoài** tablist) + các `.tab-panel`. Thẻ theo vị trí (`TAB_DEFS`: `canPay` / `canServe` / `canShift`). Mẫu thẻ ARIA: roving `tabindex`, ← / → / Home / End. Khung `iframe.tab-frame` tải lần đầu khi mở thẻ, giữ nguyên khi đổi thẻ; liên kết có tham số (`/pos/table-order?table=…`) mở lại đúng chỗ.
- **Chế độ nhúng** (`js/embed.js`): `embedded` = `?embed=1` **và** `window.top !== window.self` (mở thẳng URL có `embed=1` → trang thường). Trong khung: `pos-shell` không gắn thanh trên / dải / kiểm QR / nhắc; đăng nhập hết hạn → `topNav` (cả màn hình); "Thu tiền bàn này" → `tellHost({ type: 'pos:settle', sessionId })` → màn chính mở ngăn thu tiền ở vùng Quầy. Màn chính bắt click (capture) vào liên kết `/pos/takeaway|table-order|shift` và `/pos?tab=…` → mở thẻ, không rời `/pos`.
- **Hộp thoại trong vùng** (`ui.js setModalHost` + `modal({ host })`): mặc định hỏi vùng của nút vừa bấm (pointerdown ≤ 1,5 giây) → gắn `.overlay.in-zone` (`position: absolute`) vào vùng đó, **bỏ `aria-modal`**, đóng không View Transition. Hộp thoại mở **sau khi chờ máy chủ** truyền `host` sẵn: `openSettle` / `moveTable` → `counterHost()` (màn < 1024 px tự mở ngăn), `openSoldOut` → `zoneBar`. Dải `#pos-alerts` → vùng Quầy, trừ `.banner` (chưa mở ca, PIN, chấm công) → cả màn hình; thanh trên → cả màn hình. Esc đóng hộp **đang chứa focus** (không có thì hộp trên cùng).
- **Trạm làm món**: `counterLine(i)` = món `COUNTER` (combo: mọi thành phần `COUNTER`); `needsBar(o)`. Đơn PENDING / PREPARING không giữ mà không cần pha → `renderCounterStrip` (dải "Quầy lấy", nút Xong = `acceptAndComplete` / `complete`), không vào bảng. Máy chủ: `orderService.assertMayMake` — đơn có món trạm Bar mà người không có vị trí Pha chế → `positionError('BARISTA')`; `routes/staff.js` `maker = requirePosition('BARISTA','CASHIER','SERVER')` cho accept / complete.
- **Mang ra bàn**: `toServe()` = đơn `DINE_IN` `COMPLETED`, chưa `servedAt`, `completedAt` trong `SERVE_WINDOW_MS = 60 phút`. Thẻ ghi "n ly · kèm …" hoặc tên món (đơn chỉ có món Quầy — không "0 ly"). `ordersRepo.markServed` một câu `UPDATE … WHERE … ServedAt IS NULL` + `@@ROWCOUNT` → `409 ALREADY_SERVED` / `INVALID_STATE`; phát `order.served` (staff + `session:{id}`); API **không** trả `servedBy` (điện thoại khách cũng nhận sự kiện). `t-track.js`: `doneText`, `progress(o)` 4 bước (`.progress.four`, `text-wrap: balance`).
- **Hết món ở quầy**: `PATCH /api/menu-items/:id/availability` (`requirePosition('BARISTA')`) → `adminService.setAvailability`; nhật ký `menu.availability` (`middleware/audit.js`). Hộp `openSoldOut()` đọc `/api/menu` (có cả món tắt, `soldOut` = hết nguyên liệu → chỉ ghi nhãn).
- **Màn gọn (D-220, `body.pos-compact` do `pos-shell` gắn khi một màn hình, không nhúng)**: `nav` bỏ khóa thuộc `POS_TABS`, "Kho"; `#conn > .conn-text` ẩn kiểu sr-only khi đã kết nối; nút `.icon-only` (loa khi đã bật, `#tour-btn`, `#auto-ticket` do màn chính gắn vào `.pos-status`); `Ca #n · HH:MM`. `ticket()` nhánh `singleScreen` chỉ một nút; `openOrder` thêm Hủy đơn / In phiếu pha / Tiếp nhận & Hoàn tất (`cancelOrder` trả `false` khi thôi → chi tiết giữ mở). `groupCardCompact` (một nút + nút tên bàn `.tc-name` mở bill, chạm chỗ trống cũng mở). `.done-band.collapsed` + nút "Xem" / "Ẩn".
- **Gom ly**: `batchLines` (combo tách thành phần Bar) → nhóm theo `menuItemId`, chỉ giữ món có ở **≥ 2 đơn**; `dataset.batch` trên thẻ đơn; chạm → `.batch-hit`. **In phiếu**: `printSlip(o)` (`mode=ticket` của F-087). **Tự in**: `localStorage cf_auto_ticket` (theo máy); `autoPrintNew(queue)` trong `renderBoard` in đơn **vào Hàng pha lần đầu** (mọi lối: đơn mới, hết giữ, tải bù), chỉ sau `autoPrintArmed` (lần tải đầu đánh dấu đã thấy, không in lặp sau F5). Dải Quầy lấy / Mang ra / gom ly chỉ dựng lại khi khóa nội dung đổi (`unchanged(strip, key)`) — không mất cú bấm khi sự kiện tới.

# Cạm bẫy đã gặp

- **`.zone { position: relative }` đè `position: fixed` của ngăn trượt** (< 1200 px) → ngăn ẩn thành hàng lưới thứ hai, Hàng pha còn nửa chiều cao (ảnh 900 px). Chỉ đặt `relative` cho `.zone-bar`, cho `.zone-counter` từ 1200 px, và trong khoảng 1024–1199 px (ngăn thành tĩnh).
- Lưới hai cột phải nằm trong `@media (min-width: 1024px)` — đặt ngoài là màn 900 px có vùng Quầy hẹp vô dụng.
- Nút đóng nằm trong `role=tablist` → trình đọc / axe báo phần tử con không hợp lệ.
- `aria-modal="true"` cho hộp thoại trong vùng làm trình đọc màn hình "ẩn" vùng kia đang dùng được.
- `renderTables` ghi đè chữ của nút mở vùng Quầy — đổi chữ trong `renderTables`, không đặt một lần lúc khởi tạo.
- Kiểu đơn mang đi là `TAKE_AWAY` (có gạch dưới), không phải `TAKEAWAY`.
- Không so `ServedAt >= CompletedAt` trong CHECK: đơn bán lúc mất mạng (F-074) mang giờ máy quầy.
- Python `write_text` trên Windows ghi CRLF → hỏng Prettier; sửa tệp bằng Node / công cụ Edit, kiểm `git ls-files --eol`.
- `playwright test -g …` với dự án `a11y` phụ thuộc `flow` → chạy **cả** `flow`. Chạy riêng: `--project=flow -g "F-088"`, a11y: `--project=a11y --no-deps -g "F-088"`.

- Bản đầu chọn vùng bằng cú chạm gần nhất ở BẤT KỲ đâu → hộp thoại mở sau `await` (Hết món, chuyển bàn, PIN) có thể sang vùng người kia; ngăn thu tiền mở từ chi tiết đơn che Hàng pha; dưới 1024 px hộp thoại nằm trong ngăn đang đóng (không ai thấy) — review G3, sửa bằng `host`.
- `replaceChildren(icon, null)` ghi chữ "null" — lọc `filter(Boolean)`. `:only-child` không tính nút chữ → dùng lớp `.icon-only`.
- Thanh trên 1366 px từng vừa khít 0 px (một chữ giờ đổi là xuống hai hàng) — đo khoảng trống `tools.left − nav.right`, không đo `scrollWidth` (luôn ≥ clientWidth).
- E2E dùng chung dữ liệu cả lượt: giữa lượt Bạc xỉu có Size (bấm là mở bảng chọn) — bán thử bằng Cà phê đen; Latte có công thức, có thể tự hết sữa — hết món thử bằng món không công thức. Bài đầu lượt chạy riêng thì qua, cả lượt mới lộ.
- Chấm công kiểu LOGIN (DB test) tạo dòng chấm công khi đăng nhập → che lỗi khóa ngoại `ServedBy` khi xóa tài khoản; đổi bằng `PUT /api/admin/attendance-settings` (`/api/admin/settings` bỏ qua `attendanceMode`).
- Đi thử: Esc đóng ngăn có hiệu ứng 0,2 giây — `isVisible()` ngay sau vẫn true; chờ `state: hidden` trước bước kế.

# Chưa làm (đợt 2–5 của bản thiết kế, cần ADR riêng)

Khách tự trả VietQR + tự xác nhận (thay ADR-000 D-1…D-3), số thứ tự mang đi; host duyệt vào bàn, "Có khách?", tự dừng QR khi quầy mất mạng; giao ca đếm mù + "Nhận ca"; đặt trước, chế độ cao điểm, đơn app giao hàng, duyệt từ xa, nước nhân viên. "Xong cả nhóm" khi gom ly cần trạng thái theo món.

# Kiểm thử

`npm run lint` · `npm run format:check` · `npm test` (`tests/single-screen.test.js` — AC-088-01…05) · `npm run test:e2e` (AC-088-06…10 + a11y "quầy một màn hình (F-088)") · `npm run trace -- --check` · `npm run db:migrate` (0058) · đi luồng thật: máy quầy 1920 / 1366 / 1024 / 900 px (staff1, nhatanh quản lý cửa hàng) + điện thoại 390 px + chủ quán (Thực đơn → Trạm làm món, Cài đặt).
