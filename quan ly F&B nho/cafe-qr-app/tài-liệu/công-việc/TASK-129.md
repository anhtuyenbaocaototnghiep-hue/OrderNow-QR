# TASK-129 — Hộp Thu tiền gọn: một việc chính, việc phụ sau "Việc khác" (F-088, ADR-066)

- **Status:** READY_FOR_REVIEW (22/11/2026)
- **Tài liệu:**
  - [FEATURE-088](../chức-năng/FEATURE-088.md) (AC-088-11);
  - ADR [ADR-066](../quyết-định/ADR-066-hop-thu-tien-gon.md) (D-257, D-258; thay một phần ADR-049 D-220);
  - US-088-1.
- **Màn hình:** SCR-14 (hộp Thu tiền bàn), SCR-10 (thẻ bàn của màn một màn hình)
- **Nguồn:** chủ dự án 22/11/2026: ảnh hộp "Thu tiền bàn" kèm câu "bạn thiết kế cái này nhìn cho nó đơn giản dễ sử dụng và thao tác dc không".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-129-hop-thu-tien-gon`, chồng lên `task/TASK-128-the-di-chung-di-rieng`
- **Kế hoạch:** không cần — chỉ giao diện máy quầy (một màn hình), không chạm API, CSDL, quyền, realtime.

## Phạm vi

- **Dưới tên bàn:** dòng "Mở lúc … · n đơn" + nút **"Việc khác ▾"**. Khung hai cột: Gọi thêm món, Ghi chú bàn, Chuyển bàn, Tách hóa đơn, Thu chung với bàn khác, Hủy bàn.
  - Bấm một việc → khung gập.
  - Chạm tên bàn / chỗ trống thẻ bàn → mở sẵn; nút "Thu tiền" → gập.
- **Thẻ đơn:** "Xóa đơn" chữ nhỏ trên đầu thẻ; dòng món tên trái · tiền phải · ✎.
- **Phần thu tiền:**
  - bỏ dòng "Không ghi nợ / trả thiếu…";
  - nút tiền nhanh dạng lưới nút lớn ("Đủ tiền" rộng gấp đôi);
  - dòng tiền thừa / còn thiếu có nền màu.

**Ngoài phạm vi:** máy chủ, API, cách tính tiền, quyền; hộp Bán mang đi (S-13) giữ nguyên.

## Test

- **E2E "hộp Thu tiền gọn: …" (AC-088-11), 1366 × 768:**
  - "Việc khác" gập khi mở bằng "Thu tiền";
  - không còn dòng "Không ghi nợ";
  - "Xóa đơn" nằm trên đầu thẻ;
  - nút "Đủ tiền" + nút thu nằm trọn trong màn hình;
  - "Việc khác" đủ 6 việc, bấm một việc thì gập;
  - chạm tên bàn → mở sẵn.
- **Ba bài cũ bấm "Việc khác" trước:** sửa / xóa món + hủy bàn, thu chung nhiều bàn, tách hóa đơn theo món.
- **a11y:**
  - "quầy (máy tính)…" quét thêm hộp có "Việc khác" mở (`quay-drawer-thu-tien-viec-khac`);
  - "quầy một màn hình (F-088)…" quét hộp Thu tiền trong vùng Quầy (`quay-mot-man-hinh-thu-tien`).

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** chỉ giao diện, không cần khởi động lại, không migration.
