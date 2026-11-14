# TASK-106 — Kế hoạch: màn quầy một màn hình (F-088, ADR-049)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Trang Đơn hàng | `pos/index.html`, `pos-dashboard.js` (~2.000 dòng): dải `#pos-alerts` → `.orders-area` (cột Mới / Đang pha, F-076 "Cần làm") + `#tables-panel` (ngăn trượt dưới 1200 px, ADR-018) | Bán mang đi, Gọi món tại bàn, Ca là trang riêng |
| Trang quầy khác | `pos-takeaway.js` (791 dòng), `pos-table-order.js` (811), `pos-shift.js` (643) — mỗi trang `await mountPosShell(key)` rồi tự kết nối realtime | Có thanh trên + điều hướng riêng |
| Khung trang quầy | `pos-shell.js mountPosShell` (thanh trên, điều hướng, dải chưa mở ca, nhắc chấm công…) | Không có chế độ nhúng |
| Hộp thoại | `ui.js modal()` gắn `.overlay` (`position: fixed; inset: 0`) vào `body` | Phủ cả màn hình |
| Chuyển hướng đăng nhập | `api.js` (401 → `/pos/login`), `auth.js requireStaffPage`, `onAuthError` của từng trang | Đổi `location` của chính khung |
| In | `print.js printUrl` (khung ẩn, `autoprint=1&embed=1`), `pos-receipt.js mode=ticket` (phiếu pha F-087) | Chỉ in phiếu khi đổi bàn |
| Còn / hết món | `PATCH /api/admin/menu-items/:id/availability` → `adminService.setAvailability` → `refreshAvailability` | Chỉ trang Quản lý |
| Quyền vị trí | `requirePosition('BARISTA')` cho `/orders/:id/accept|complete|cancel` (`routes/staff.js`), `hasPosition` (F-078) | — |
| Cài đặt | `settingsService` (map key ↔ tên, mặc định), zod `routes/operations.js`, `STORE_MGR_SETTINGS`, `/api/auth/me pos.oneTap` | — |
| E2E | `kịch-bản/e2e-server.js` đặt cài đặt cũ (`pos.one_tap = false`…) cho bài cũ | — |

## Thiết kế
- **Migration 0058:** `ALTER TABLE MenuItems ADD Station VARCHAR(10) NOT NULL CONSTRAINT DF_MenuItems_Station DEFAULT 'BAR'` + `CK_MenuItems_Station`; `Orders ADD ServedAt DATETIME2(0) NULL, ServedBy INT NULL` (FK Users). Không SP mới: "Đã mang" chỉ đổi cột thông tin (không kho, không tiền) → `UPDATE … WHERE Status = 'COMPLETED' AND Type = 'DINE_IN' AND ServedAt IS NULL` có điều kiện (một câu, nguyên tử), 0 dòng → đọc lại trạng thái để trả `ALREADY_SERVED` / `INVALID_STATE`.
- **Cài đặt:** `singleScreen` (`pos.single_screen`, ≠ `'false'` → bật), `serveMode` (`pos.serve_mode`, `'COUNTER'` hoặc mặc định `'TABLE'`); zod + `STORE_MGR_SETTINGS`; `/api/auth/me pos`; phiên khách (`sessionService.getDetail` view khách) `serveMode`.
- **Trạm:** `menuRepo.itemParams` `keepStation` như `keepPrep`; `ordersRepo.attachItems` đọc `m.Station`; zod `station` ở `itemBody`.
- **Xong đơn chỉ có món trạm Quầy:** route `complete` đổi sang `requirePosition('BARISTA', 'CASHIER', 'SERVER')`; `orderService.complete` kiểm: người không có Pha chế mà đơn có món trạm Bar → `403 POSITION_REQUIRED` (cùng mã F-078).
- **Đã mang:** `orderService.markServed` (ca mở — F-055) → `ordersRepo.markServed` → `publishOrderEvent('order.served')`; route `POST /orders/:id/served` (`requirePosition('CASHIER', 'SERVER')`).
- **Hết món tại quầy:** route `PATCH /menu-items/:id/availability` (`requirePosition('BARISTA')`) → `adminService.setAvailability`; luật nhật ký `menu.availability`.
- **Chế độ nhúng:** `?embed=1` trong khung cùng nguồn → `pos-shell` không dựng thanh trên / điều hướng / dải nhắc, thêm lớp `pos-embed`; `topNav(url)` (`window.top.location`) cho chuyển hướng đăng nhập; trang gọi món nhúng: "Thu tiền bàn này" → `postMessage({ type: 'pos:settle', sessionId })` tới màn chính.
- **Màn chính:** `pos/index.html` thêm `.zone-bar` (`.orders-area`) và `.zone-counter` (thanh thẻ + `#tables-panel` + 3 khung `iframe` tải lười); `pos-dashboard.js` bật khi `current.pos.singleScreen`; `ui.js modal({ host })` + `setModalHost(fn)` (chọn vùng theo nút mở); ngưỡng ngăn trượt 1024 px khi một màn hình.
- **Gom ly / Quầy lấy / Mang ra / Hết món / In phiếu:** tính ở `pos-dashboard.js` từ `state.orders` (`items[].station`, `children`, `options`), dải mới trong `#pos-alerts`; Hết món là hộp thoại trong vùng Hàng pha đọc `/api/menu`; tự in theo máy: `localStorage cf_auto_ticket`.
- **Khách:** `t-track.js` + `customer.js` đọc `serveMode`, `servedAt`, nghe `order.served`.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Trang nhúng chuyển hướng ngay trong khung (đăng nhập hết hạn, liên kết về `/pos`) → màn lồng màn | `topNav` cho mọi chuyển hướng đăng nhập; trang gọi món gửi `postMessage` thay cho liên kết `/pos?settle=` khi nhúng; test E2E thẻ nhúng |
| Ba khung = thêm ba kết nối realtime | Khung chỉ tải khi mở thẻ lần đầu; mỗi trang tự đóng kết nối khi rời (DEF-011) |
| Bài E2E cũ dựa vào bố cục cũ, ngăn trượt 1200 px, chữ "nhận tại quầy" | `e2e-server.js` đặt `pos.single_screen = false`, `pos.serve_mode = COUNTER` (như `pos.one_tap`); bài mới tự bật |
| Hai người bấm cùng lúc trên một màn hình | Hai vùng độc lập, hộp thoại trong vùng; không đổi luật tranh chấp phía máy chủ (UPDATE có điều kiện) |
| Đã mang bấm hai lần / hai máy | `UPDATE … ServedAt IS NULL` nguyên tử → lần sau `409 ALREADY_SERVED` |
| Thu ngân Xong nhầm đơn có món pha | Máy chủ kiểm trạm từng món trước khi gọi `sp_CompleteOrder` (`403 POSITION_REQUIRED`) |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · đi luồng thật: máy quầy 1920 / 1366 / 1024 px (staff1 — Thu ngân + Pha chế + Phục vụ; nhatanh — quản lý cửa hàng), điện thoại 390 px, chủ quán (Thực đơn, Cài đặt).

## Khác với kế hoạch (ghi sau khi làm, 14/11/2026)
- Vùng của hộp thoại chọn bằng `setModalHost(fn)` (một hàm cho cả trang, đọc nút vừa chạm trong 1,5 giây) thay cho tham số `modal({ host })` — không phải sửa từng chỗ gọi `modal`. Hộp thoại trong vùng bỏ `aria-modal` (vùng kia vẫn dùng được).
- `/orders/:id/accept` cũng mở cho Thu ngân / Phục vụ (đơn chỉ có món trạm Quầy: nút Xong ở dải "Quầy lấy" = nhận + hoàn tất); kiểm trạm ở `orderService.assertMayMake` cho cả hai.
- Dải "Mang ra" chỉ lấy đơn Xong trong 60 phút gần nhất (dải không dài mãi khi quên bấm); thẻ ghi "n ly" / tên món (không "0 ly").
- Gom ly tính món có ở ≥ 2 đơn (một đơn 3 ly đã nằm trên một thẻ), tùy chọn khác nhau ghi dưới dòng — ADR-049 D-219 và FEATURE-088 sửa theo.
- Đi thử 900 px tìm ra `.zone { position: relative }` đè `position: fixed` của ngăn trượt → chỉ đặt cho `.zone-bar` và `.zone-counter` khi không phải ngăn trượt. Nút đóng ngăn đưa ra ngoài `role=tablist`; thẻ theo mẫu ARIA (← / → / Home / End).
- Thêm bài a11y "quầy một màn hình (F-088)" (`a11y.spec.js`).

## Đợt 2 (14/11/2026): màn gọn D-220 + sửa theo review G3
- Chủ dự án: "bạn là một chuyên gia thiết kế giao diện làm cho nó đơn giản hơn nữa dễ thao tác". Chỉ đổi khi bật một màn hình (bố cục cũ và bài test cũ không đổi): thanh trên một hàng (`body.pos-compact`), thẻ đơn / thẻ bàn một nút (việc phụ ở chi tiết đơn / bill đã có sẵn), "Đã xong" thu gọn, dải không mã đơn.
- Review G3 độc lập (1 MAJOR, 13 MINOR): hộp thoại từ dải trên nằm trong ngăn Quầy đang đóng (< 1024 px) → `counterHost()` mở ngăn; chọn vùng sau `await` → `modal({ host })`; Esc theo focus; không View Transition cho hộp trong vùng; ← / → trong ngăn; "Gọi thêm món" đóng bill; trang nhúng giữ `embed=1` + `location.replace`; `sp_DeleteUser` tính `ServedBy`; tự in theo "vào Hàng pha lần đầu"; tải sẵn Bán mang đi; dải dựng lại khi đổi + xét lại mỗi phút; điện thoại theo luật 60 phút; giới hạn một tài khoản / hai người ghi ở ADR-049.
- Đi thử 24 luồng (walk106b): 23 đạt ngay; luồng ← / → lỗi do kịch bản bấm khi ngăn còn đang trượt đóng (đã kiểm riêng: focus đúng).
