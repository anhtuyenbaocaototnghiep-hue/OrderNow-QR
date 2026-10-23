# TASK-059 — Không báo "Mất kết nối" khi chuyển giữa các mục
Status: READY_FOR_REVIEW (21/10/2026)
Feature: FEATURE-007 (quầy nhận đơn realtime, REQ-017) · Lỗi: DEF-011 · Module: MOD-NOTIFY · Màn hình: SCR-10, SCR-13, SCR-15, SCR-16, SCR-17 (thanh trên quầy), SCR-02 / SCR-05 (khách)
Nguồn: chủ dự án báo 21/10/2026 — "chuyển đổi giữa các mục lại hiện dòng đỏ mất kết nối" · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-059-bao-mat-ket-noi-khi-chuyen-trang`

## Mục tiêu
Chuyển giữa các mục (Đơn hàng, Gọi món tại bàn, Bán mang đi, Kho, Ca…) hoặc giữa menu ↔ theo dõi đơn của khách **không** làm hiện chữ / dải đỏ "Mất kết nối"; trang mới khi đang kết nối hiện trạng thái trung tính "Đang kết nối…". Mất mạng thật vẫn báo đỏ như cũ (AC-007-05).

## Nguyên nhân
1. `js/socket.js`: khi rời trang, `beforeunload` gọi `socket.close()` → Socket.io phát `disconnect` (lý do `io client disconnect`) → code coi là mất mạng → `onOffline` bật dải đỏ "Mất kết nối" trên trang cũ trong lúc trang mới đang tải.
2. `js/pos-shell.js`: ô trạng thái tạo sẵn với lớp `offline` (chữ đỏ, chấm nhấp nháy) cho tới khi kết nối xong.

## Phạm vi sửa
- `js/socket.js`: đóng kết nối ở `pagehide` (thay `beforeunload`), bỏ qua ngắt kết nối do chính trang đóng; trang được khôi phục từ bfcache (nút Back) thì mở lại kết nối và tải lại ảnh chụp.
- `js/pos-shell.js` + `css/base.css` + `css/pos.css`: trạng thái ban đầu "Đang kết nối…" màu trung tính (lớp `connecting`).
- `kiểm-thử/e2e/flow.spec.js`: test hồi quy.
- `js/pages/pos-shift.js`: bỏ kết quả lượt tải cũ (DEF-012 — phát hiện khi chạy E2E cho task này).
- Tài liệu: TASK-059, DEF-011, DEF-012.

## Không được sửa
Hành vi khi mất mạng thật (vẫn báo đỏ + tải lại ảnh chụp khi có mạng lại — AC-007-05, AC-004-02), API, server.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm run test:e2e` (gồm test mất kết nối thật AC-007-05 và test hồi quy mới).

## Cần hỏi duyệt nếu
Đổi cách báo khi mất mạng thật.

## Kết quả thực chạy (21/10/2026)

| Lệnh / việc | Kết quả |
| --- | --- |
| E2E với code **cũ** + test hồi quy mới | **FAIL** đúng chỗ: `#offline-banner` hiện ngay khi rời trang — tái hiện đúng lỗi chủ dự án thấy |
| `npm run test:e2e` với code mới | **35/35 PASS**, chạy **2 lần liên tiếp** (32 luồng + 3 a11y; gồm test mất mạng thật AC-007-05) |
| `npm run test:e2e` sau khi sửa theo review | **35/35 PASS** (1,8 phút) |
| E2E luồng `flow` với code **tạm bỏ** đoạn mở lại kết nối khi khôi phục trang (M1) | **FAIL** đúng chỗ: chờ tải lại ảnh chụp `/api/shifts/current` hết giờ — test bắt được lỗi; code đã khôi phục |
| `node kịch-bản/traceability.js --check` | 289 / 289 AC PASS, exit 0 |
| `npm run lint`, `npm run format:check` | PASS |
| `npm test` | Không chạy lại — task chỉ đổi giao diện, không đổi server / CSDL (lần chạy gần nhất 255/255) |

## Lệch phạm vi
- DEF-012 (`pos-shift.js`) không có trong phạm vi ban đầu: lỗi tranh chấp có sẵn từ trước, lộ ra khi chạy E2E cho task này; sửa nhỏ, cùng loại (lượt tải do sự kiện realtime kích hoạt), có E2E bao phủ.

## Review G3 (agent độc lập, 21/10/2026)
Kết luận lần 1: **Request changes (nhỏ)** — đã sửa hết:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | Đóng kết nối ở `beforeunload` → bấm Back, Chrome khôi phục trang từ bfcache với kết nối đã đóng; bản sửa đầu (bỏ qua lý do `io client disconnect`) khiến trang hiện "Đã kết nối" mà **không nhận đơn** — tệ hơn báo đỏ | `socket.js`: đóng ở `pagehide`; `pageshow` (persisted) → `socket.connect()` → `onOnline(true)` → trang tải lại ảnh chụp. Test hồi quy thêm bước khôi phục trang (FAIL khi bỏ đoạn này) |
| N1 | Màu "Đang kết nối…" bị `.pos-tools .conn` (xanh) đè trên thanh quầy | `pos.css`: màu trắng mờ cho `.pos-tools .conn.connecting` |
| N2 | Cờ `leaving` thừa, có thể nuốt lỗi mạng thật nếu sau này mở lại kết nối | Bỏ; chỉ còn `closedOnHide` dùng cho `pageshow` |
| N3 | Mô tả nguyên nhân DEF-012 chưa chính xác | Sửa chú thích `pos-shift.js` + defect-log: lượt tải bắt đầu khi ca còn mở (sau sự kiện hoàn tiền) về sau màn "Đã đóng ca" |
| N4 | `waitForTimeout(500)` thừa | Bỏ. Trạng thái "Đang kết nối…" lúc mở trang không tự động hóa (quá ngắn để bắt ổn định) — kiểm bằng mắt khi UAT |

Giới hạn: Playwright Chromium tắt bfcache nên bước "Back" được giả lập bằng sự kiện `pagehide` / `pageshow`; hành vi trên trình duyệt thật kiểm ở UAT-17 / MAN-03.
