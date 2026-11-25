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
- Chạy toàn bộ E2E + a11y (trang quầy) sau khi sửa — xem phần Bàn giao.
