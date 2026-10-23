# TASK-071 — Chưa mở ca thì không nhận và không xử lý đơn
Status: READY_FOR_REVIEW (23/10/2026)
Feature: [FEATURE-055](../chức-năng/FEATURE-055.md) · Quyết định: [ADR-017](../quyết-định/ADR-017-bat-buoc-mo-ca.md) D-64…D-66 · Module: MOD-ORDER, MOD-SHIFT, MOD-TABLE, MOD-BILLING, MOD-NOTIFY · Màn hình: SCR-02 / SCR-03 (menu khách), SCR-10, SCR-14, SCR-16 (quầy)
Nguồn: chủ dự án yêu cầu 23/10/2026 ("khi chưa mở ca thì không thể order, bắt buộc phải mở ca để hoạt động các chức năng"); chọn: khách xem menu không gửi đơn, quầy khóa "xử lý đơn", làm nối tiếp sau TASK-069. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-071-bat-buoc-mo-ca` tách từ `task/TASK-069-mau-bieu-do` (chưa gộp `main`) · Phụ thuộc: F-018 (ca), F-020 (trạng thái nhận đơn), F-054 (đăng xuất phải đóng ca)

## Mục tiêu
- Không có ca mở thì khách không gửi được đơn QR (vẫn xem menu) và quầy không xử lý được đơn.
- Khách thấy rõ lý do và tự mở lại được khi quầy mở ca.

## Kế hoạch
1. Tài liệu trước code: ADR-017, FEATURE-055, BR-087, task này.
2. Server:
   - `shiftService.requireOpenShift(việc)` — lời nhắn theo việc; `open` / `close` phát `store.status_changed`.
   - `settingsService.storeStatus()` + sự kiện công tắc QR thêm `shiftOpen`; `menuService` trả `store.shiftOpen`.
   - Chặn: `orderService` (`submitDineIn`, `submitByStaff`, `accept`, `complete`, `cancel`), `voidService` (3 thao tác), `sessionService.moveSession`, `splitService` (`create`, `assign`, `merge`).
3. Giao diện: `t-menu.js` (gửi được = nhận đơn QR + ca mở; lỗi `NO_OPEN_SHIFT`), `pos-shell.js` (dải cảnh báo), `pos-dashboard.js` (khóa nút trên phiếu), `pos-table-order.js` (khóa Gửi đơn).
4. Test: `tests/shift-required.test.js`; sửa test cũ tạo / xử lý đơn khi chưa mở ca (mở ca trước); E2E "chưa mở ca…"; E2E / a11y mở ca nếu đang đóng.
5. Đồng bộ docs, chạy toàn bộ lệnh kiểm chứng, review G3 độc lập.

## Không được sửa
- Công tắc nhận đơn QR (F-020): `acceptingOrders` giữ nguyên nghĩa.
- Kho ở quầy, trang Quản lý, mở / đóng ca, các luật thu tiền hiện có.
- Không migration, không dependency.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Cần hỏi duyệt nếu
- Muốn chặn đóng ca khi còn đơn chưa xong.
- Muốn khóa thêm kho ở quầy hoặc trang Quản lý.

## Kết quả thực chạy (23/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **304/304 PASS** (27 file — thêm `shift-required.test.js` 4 test). Với server cũ (chép tạm 8 file của `2c1eae5`, chạy, chép lại): **AC-055-01…03 FAIL**, AC-055-04 PASS — đúng mong đợi vì AC-055-04 kiểm những việc *không* bị khóa (lần đầu ghi "FAIL cả 4" là sai: AC-055-04 lỗi lây do ca bị bỏ mở — đã thêm dọn ca sau mỗi test) |
| `npm run test:e2e` | **43/43 PASS** (40 luồng + 3 khả năng tiếp cận; thêm E2E "chưa mở ca…") |
| `npm run load` | NFR-002 10/10 vòng PASS; NFR-001 p50 164 ms, p95 274 ms |
| `npm run trace -- --check` | 133 US, 335 AC — PASS 335, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |

**Test cũ phải sửa vì luật mới (đúng nghiệp vụ, không nới luật):** `shop-info.test.js` (F-053) gửi đơn khách trong `before` mà chưa mở ca → mở ca trước. Kịch bản ép tải `load-concurrency.js` mở ca sau khi đăng nhập. a11y tự mở ca nếu luồng E2E kết thúc khi ca đã đóng (và đóng lại ở cuối).

## Review G3 (agent độc lập, 23/10/2026)
Kết luận lần 1: **Request changes** (1 phải sửa). Đã kiểm đúng: mọi đường ghi đơn / kho / phiên đều đã chặn hoặc vốn cần ca; những việc không khóa đúng ADR; thứ tự kiểm (`STORE_CLOSED` → `NO_OPEN_SHIFT`, 403 trước kiểm ca); không vòng import; người nghe `store.status_changed` cũ vẫn đúng; không lỗi thứ tự khai báo. Đã sửa:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | Ngăn chi tiết bàn / đơn (SCR-11, SCR-14) và khung bàn chưa khóa: Tiếp nhận / Hủy, Xóa đơn, bút sửa món, Chuyển bàn, Hủy bàn, chia bill (chọn phần, Thêm phần, Gộp lại) vẫn bấm được → nhập lý do / mật khẩu xong mới bị 409 | Một hàm `shiftGate()` khóa đủ 11 chỗ, kèm `aria-describedby="no-shift"`; cảnh báo trong ngăn nói đủ việc bị khóa; ngăn và khung bàn vẽ lại khi ca đổi. E2E kiểm thêm "Chuyển bàn" khóa |
| N1 | Kiểm ca dùng truy vấn ca đầy đủ (6 truy vấn con) ở mỗi lần tải menu khách / mỗi thao tác | `shiftsRepo.isOpen()` (chỉ index `UX_Shifts_OneOpen`) + `assertShiftOpen()`; thu tiền vẫn dùng `requireOpenShift()` (cần số liệu ca) |
| N2 | Phát `store.status_changed` sau khi mở / đóng ca lỗi → API trả 500 dù ca đã đổi | Bọc try/catch, ghi log; realtime không phải nguồn sự thật |
| N3 | Ca bị đóng ở máy khác lúc mất kết nối: nút vẫn bật; Gọi món tại bàn mở bàn rồi mới bị 409 → để lại bàn trống | `run()` và trang Gọi món tại bàn tải lại ca khi gặp `NO_OPEN_SHIFT`; trước khi mở bàn kiểm lại ca |
| N4 | Khách chia bill nhận lời nhắn dành cho nhân viên | Lời nhắn riêng cho khách |
| N5 | Menu khách: nếu sự kiện "đã mở ca" tới trước phản hồi 409 thì nút gửi khóa sai; hai cảnh báo cùng lúc | Tải lại menu sau 409; chỉ hiện một lý do |
| N6 | Test không dọn ca khi lỗi giữa chừng; câu "FAIL cả 4" sai; AC-055-04 ghi "phiếu sơ chế" nhưng test ghi phiếu hủy hàng; chưa test nút gửi ở Gọi món tại bàn | `afterEach` đóng ca; sửa câu chữ; AC-055-04 ghi đúng "phiếu hủy hàng"; E2E kiểm nút gửi Gọi món tại bàn khóa + lý do |
| N7 | a11y không quét giao diện khi chưa mở ca; dải `#no-shift` thiếu `role="status"`; lý do chỉ ở `title`; dải hiện mã "(F-055)" | a11y đóng ca tạm, quét Đơn hàng + Gọi món tại bàn rồi mở lại; `role="status"`; nút khóa trỏ `aria-describedby` tới dải; bỏ mã khỏi chữ |
| N8 | Contract `/api/store` chưa ghi `shiftOpen`; bảng F-055 ghi "gộp lại" cho khách; nút "QR: đang nhận đơn" vẫn hiện khi chưa mở ca | Sửa contract, FEATURE-055 (gộp lại chỉ quầy); ghi rõ nút QR chỉ là công tắc F-020 |

