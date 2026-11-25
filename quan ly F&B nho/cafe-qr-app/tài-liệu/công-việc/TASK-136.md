# TASK-136 — Nhóm món ở quầy tự xuống dòng (Bán mang đi, Gọi món tại bàn)

- **Status:** READY_FOR_REVIEW (25/11/2026)
- **Màn hình:** SCR-13 Bán mang đi (`/pos/takeaway`), SCR-16 Gọi món tại bàn (`/pos/table-order`)
- **Nguồn:** chủ dự án 25/11/2026 gửi ảnh màn Bán mang đi: thanh nhóm món có 7 nhóm (Combo … Thức uống khác), nhóm cuối bị che — "làm thêm thanh lướt hay j cho dễ kéo nào".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-136-nhom-mon-xuong-dong`, chồng lên `task/TASK-135-sdt-quan-va-chu-wifi`
- **Kế hoạch / ADR:** không cần — chỉ CSS một thanh ở hai trang quầy, không đổi quy tắc, API, CSDL.

## Phạm vi

- Hai trang quầy dùng chung thanh `.c-tabs` của màn khách: cuộn ngang và **ẩn thanh cuộn**. Ở máy quầy dùng chuột, bánh xe chỉ cuộn dọc, nên nhóm bị che rất khó kéo tới.
- **Cách làm:** `css/pos.css` — `body.pos .c-tabs { flex-wrap: wrap; overflow-x: visible }`.
  - Ở quầy, nút nhóm món tự xuống dòng nên luôn thấy đủ mọi nhóm, mỗi nhóm một lần bấm, không cần kéo.
  - Màn khách (`body.customer`, chỉ điện thoại — F-093) giữ cuộn ngang + vuốt như cũ.
- **Cân nhắc thanh cuộn hiện ra / nút mũi tên trái phải:** vẫn phải kéo hoặc bấm nhiều lần để thấy nhóm cuối. Bỏ: 7–10 nhóm xuống dòng vẫn gọn trong 2 hàng.

## Test

- E2E cũ bấm nhóm theo chữ (`#tabs .chip` có chữ …) vẫn đúng — không đổi chữ / thứ tự.
- **Kết quả 25/11/2026 (nhánh `task/TASK-136-nhom-mon-xuong-dong`, gồm TASK-135):**
  - `npm run lint`, `npm run format:check`: sạch.
  - `npm test`: 516/516 PASS.
  - `npm run test:e2e`: 118/118 PASS (lần chạy cuối, 9,1 phút).
  - `npm run trace -- --check`: 207 US, 593 AC — PASS 593, FAIL 0, NOT_RUN 0, GAP 0.
- **Các lần chạy trước (ghi đúng sự thật):**
  - Lần 1: 3 test cũ so nguyên danh sách khóa `/api/shop` và từng byte ảnh QR Wi-Fi mức M → cập nhật theo ADR-070 (37a138f).
  - Lần 2: lỗi thật — dòng số điện thoại ở màn chào dùng chung class `.h-addr`, E2E F-092 báo 2 phần tử → tách `.h-tel` (698a4f1).
  - Các lần còn lại hỏng ngẫu nhiên, không do thay đổi này:
    - AC-007-05 "mất kết nối quầy";
    - F-055 dải "Chưa mở ca" chưa kịp ẩn;
    - "Mất kết nối mạng" lúc laptop đổi băng Wi-Fi;
    - SQL ETIMEOUT 15 s ở CafeQrTest.
  - Chạy lại đều đạt.
