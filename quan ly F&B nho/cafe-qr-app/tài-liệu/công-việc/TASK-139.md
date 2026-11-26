# TASK-139 — Thẻ QR bàn nhắc "vào Wi-Fi của quán rồi mới quét — 4G / mạng khác không gọi món được" (F-010)

- **Status:** READY_FOR_REVIEW (26/11/2026)
- **Tài liệu:** [FEATURE-010](../chức-năng/FEATURE-010.md) (AC-010-11), US-010-2
- **Màn hình:** SCR-22 Bàn & mã QR → In (`/admin/tables/print`)
- **Nguồn:** chủ dự án 26/11/2026: "bạn làm thêm cái lưu ý trong ảnh quét wifi để order ko sử dụng mạng bên ngoài" — trước đó khách bắt Wi-Fi Xanh_2Go (2.4 GHz, router cô lập thiết bị) hoặc 4G thì quét không vào được trang gọi món.
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-139-luu-y-wifi-tren-the`, chồng lên `task/TASK-138-goi-nhan-vien-5-lan`
- **Kế hoạch / ADR:** không cần — chỉ chữ in trên thẻ (một trang in), không đổi quy tắc, API, CSDL.

## Phạm vi

- `table-card.js`: hằng `LAN_NOTE_WIFI`, `LAN_NOTE`; tham số `lanNote`.
  - Có mã Wi-Fi → khung viền cam dưới tên / mật khẩu Wi-Fi, ba bước tự dịch xuống nếu khung cao hơn mã ②.
  - Không có mã Wi-Fi → một dòng cam dưới mã gọi món.
- `admin-qr-print.js`: `lanNote` khi mã QR trỏ tới `localhost` hoặc địa chỉ IP (app chạy trên máy trong quán); dùng tên miền (app trên mạng) thì không in — 4G vẫn gọi được. Bản văn bản ẩn `.qr-lan`.
- **Thẻ của quán:** xuất lại 20 thẻ vào `the-qr-xanh-2-go/` bằng máy chủ tạm (cổng 3200, `PUBLIC_BASE_URL=http://172.168.238.72:3000`, `JOBS_ENABLED=false`, thư mục ảnh của quán) vì laptop đang ở mạng khác — mã gọi món vẫn trỏ đúng địa chỉ quán; kiểm bằng jsQR 20/20 (đúng bàn, đúng mạng Wi-Fi).

## Test

- E2E mới "thẻ QR bàn nhắc vào Wi-Fi quán…" (AC-010-11): mọi thẻ có `.qr-lan`; đo điểm ảnh vùng khung trên ảnh thẻ có màu cam.

## Lệnh kiểm chứng

Xem phần Bàn giao (cập nhật sau khi chạy).
