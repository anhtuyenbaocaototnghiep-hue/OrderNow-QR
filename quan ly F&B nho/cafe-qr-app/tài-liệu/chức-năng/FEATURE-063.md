# FEATURE-063 — Cảnh báo QR bàn sai địa chỉ

> **Nguồn:** chủ dự án 29/10/2026. Sự cố thật 27/10: QR in ra trỏ `localhost`, sau đó laptop đổi Wi-Fi (`10.50.2.11` → `172.168.238.72`). Quyết định: [ADR-021](../quyết-định/ADR-021-che-do-co-ban-chinh-sach-qr.md) D-82.

- **Status:** CONFIRMED (ADR-021) · Triển khai: [TASK-077](../công-việc/TASK-077.md)
- **Actor:** **ACT-ADMIN** (in QR, thấy cảnh báo, in lại), **ACT-STAFF / ACT-LEAD** (thấy cảnh báo ở màn quầy để báo quản lý).
- **Màn hình:** **In mã QR** (SCR-22 trang in) — lưu địa chỉ khi bấm In / Ctrl+P; trang này và **Bàn & mã QR** (SCR-22) cảnh báo đỏ nếu địa chỉ là `localhost`; **mọi trang quản lý** và **màn quầy** — dải đỏ khi lệch.
- **Dữ liệu:** khóa cài đặt `qr.printed_base_url`, `qr.printed_at`.

## User Story

- **US-063-1:** Là chủ quán, tôi muốn app báo ngay khi mã QR đang dán trên bàn trỏ tới địa chỉ cũ (laptop đổi mạng / đổi IP) hoặc trỏ `localhost`, để in lại trước khi khách quét không được.

## Quy tắc (BR-099)

- Bấm **In** trên trang In mã QR (hoặc Ctrl+P — sự kiện `beforeprint`) → `POST /api/admin/qr-printed` lưu `PUBLIC_BASE_URL` hiện tại + giờ.
- `mismatch` = đã từng in **và** địa chỉ lúc in ≠ địa chỉ đang chạy. Chưa in lần nào → không báo lệch.
- `localhost` = địa chỉ đang chạy có host `localhost`, `127.x.x.x` hoặc `::1` — điện thoại không bao giờ quét được.
- `unreachable` (review G3) = `PUBLIC_BASE_URL` là một **IPv4 viết số** mà máy chủ **không còn giữ** (so với IP các card mạng hiện tại). Trường hợp thường gặp nhất ở quán thật: `.env` ghi cứng IP, laptop đổi Wi-Fi / router cấp IP khác → địa chỉ lúc in = địa chỉ đang chạy (không "lệch") nhưng điện thoại không vào được. Tên miền / tên máy thì không phán. Dải đỏ ghi IP hiện tại của máy, hướng dẫn sửa `.env` (tốt nhất IP cố định trong router) rồi in lại.
- Bấm In / Ctrl+P được tính là **đã in** — trình duyệt không cho biết người dùng in thật hay bấm Hủy ở hộp in; xem trước rồi Hủy cũng làm dải lệch biến mất.
- Hiển thị: lệch → dải đỏ ở mọi trang quản lý ("QR đang dán trên bàn trỏ tới A nhưng app đang chạy ở B — khách quét sẽ lỗi. In lại QR (hoặc đặt IP cố định cho máy chủ trong router)", link tới trang in) và ở màn quầy ("… báo quản lý in lại QR"). `localhost` → dải đỏ ở trang In mã QR và Bàn & mã QR (không hiện ở các trang khác — chạy thử trên máy là bình thường). In lại ở địa chỉ mới → hết cảnh báo.
- Máy chủ khi khởi động in thêm dòng cảnh báo tương ứng.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/qr-check` | Nhân viên | `{ baseUrl, printedBaseUrl, printedAt, mismatch, localhost, unreachable, machineIps }` |
| `POST /api/admin/qr-printed` | ADMIN | Lưu địa chỉ đang chạy là địa chỉ đã in → kết quả như `qr-check` |

## Acceptance Criteria

- AC-063-01: Chưa in: `qr-check` → `printedBaseUrl: null`, `mismatch: false`; `POST /api/admin/qr-printed` → lưu đúng địa chỉ đang chạy + giờ, `mismatch: false`.
- AC-063-02: Địa chỉ đang chạy đổi so với lúc in → `mismatch: true`, trả cả hai địa chỉ; in lại → `false`. IP trong `PUBLIC_BASE_URL` không có trên máy → `unreachable: true` (localhost, tên máy, IP thật của máy → `false`). Địa chỉ `localhost` / `127.0.0.1` → `localhost: true`.
- AC-063-03: Quyền: `qr-check` khách → `401`, nhân viên → `200`; `qr-printed` nhân viên / trưởng ca → `403`.
- AC-063-04: Trên trình duyệt: bấm In ở trang In mã QR → lưu địa chỉ; khi lệch, trang quản lý và màn quầy hiện dải đỏ ghi cả hai địa chỉ; khi máy chủ đã đổi IP, dải đỏ ghi IP hiện tại; địa chỉ `localhost` → trang In mã QR hiện cảnh báo, trang quản lý khác không.

## Bằng chứng

`tests/basic-mode.test.js` (AC-063-01…03) · E2E "cảnh báo QR sai địa chỉ…".
