# TASK-130 — Hộp "Thu chung với bàn khác" dễ thấy (F-057)

- **Status:** READY_FOR_REVIEW (22/11/2026)
- **Tài liệu:** [FEATURE-057](../chức-năng/FEATURE-057.md) (AC-057-05)
- **Màn hình:** SCR-14 (ngăn Thu tiền bàn → hộp chọn bàn thu chung)
- **Nguồn:** chủ dự án 22/11/2026: ảnh hộp "Thu chung với Bàn 02" kèm câu "hơi khó thấy ban làm sao dễ thấy hơn đi".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-130-chon-ban-thu-chung`, chồng lên `task/TASK-129-hop-thu-tien-gon`
- **Kế hoạch / ADR:** không cần — chỉ giao diện một hộp; máy chủ, API, cách tính tiền, quyền không đổi.

## Phạm vi

- **Mỗi bàn một thẻ lớn,** chạm cả thẻ để chọn:
  - ô tích 24 px;
  - tên bàn đậm, dòng nhỏ "n đơn · mở hh:mm";
  - tiền của bàn bên phải;
  - thẻ đã chọn có viền + nền màu chính;
  - bàn đang chia bill thì mờ, không chọn được.
- **Câu hướng dẫn ngắn, chữ thường:** "Chọn bàn trả chung với Bàn … — in một bill, đóng tất cả các bàn."
- **Dòng tổng cập nhật khi chọn:** "Bàn A + n bàn · tạm tính …"; chưa chọn → "Chưa chọn bàn nào — chạm vào bàn muốn thu chung".
- **Nút "Thu chung":** khóa khi chưa chọn bàn nào. Bỏ thu chung vẫn bằng nút "Bỏ thu chung" ở ngăn.

## Test

- **E2E "thu chung nhiều bàn: …" (AC-057-05) kiểm thêm:**
  - nút khóa khi chưa chọn;
  - thẻ Bàn GH2 sáng lên, ghi 10.000đ;
  - dòng tổng "Bàn GH1 + 1 bàn · tạm tính 35.000đ".
- **a11y "quầy (máy tính)…":**
  - mở nhóm + gửi món ở Bàn AM1, mở hộp Thu chung, chọn Bàn AM1, quét (`quay-thu-chung-chon-ban`);
  - dọn nhóm AM1 ngay sau.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** chỉ giao diện, không cần khởi động lại.
