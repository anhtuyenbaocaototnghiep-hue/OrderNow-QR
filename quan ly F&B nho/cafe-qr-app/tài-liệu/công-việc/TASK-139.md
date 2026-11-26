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

- **Kết quả 26/11/2026:**
  - `npm run lint`, `npm run format:check`: sạch.
  - E2E "thẻ QR bàn nhắc vào Wi-Fi quán…" (AC-010-11) cùng các bài thẻ QR khác (F-059, ADR-070, TASK-134): PASS cả 3 lần chạy.
  - Kiểm 20 thẻ thật bằng jsQR: 20/20 đúng bàn, đúng mạng Wi-Fi.
- **Chạy toàn bộ E2E: CHƯA ĐẠT TRỌN.** 3 lần chạy, mỗi lần hỏng đúng 1 bài khác nhau, không thuộc phạm vi task này. Bài hỏng chặn chuỗi `flow` chạy nối tiếp nên `npm run trace -- --check` còn NOT_RUN.
  - Lần 1: vòng quay may mắn — trang kẹt "Đang tải…" > 5 giây.
  - Lần 2: quà sinh nhật — có 5 dòng SQL ETIMEOUT trong log máy chủ test.
  - Lần 3: ra món khi bạn tới — phiếu "Chờ bạn tới" chưa tới quầy trong 5 giây.
  - Lần 2 và 3 cùng kiểu lỗi DEF-025: trang tải xong mới nối realtime nên lỡ sự kiện.
  - Lần chạy đủ gần nhất: TASK-138 — 120/120, truy vết 597/597.
- **Đề xuất:** sửa DEF-025 (8 trang realtime — cần chủ dự án duyệt) và tìm nguyên nhân SQL chậm lúc chạy E2E — hai việc này gây phần lớn lần hỏng ngẫu nhiên gần đây.
