# ADR-066 — Hộp Thu tiền gọn: một việc chính, việc phụ của bàn sau "Việc khác"

- **Trạng thái:** ACCEPTED (22/11/2026).
- **Chủ dự án duyệt:** ảnh hộp "Thu tiền bàn" ở màn quầy kèm câu "bạn thiết kế cái này nhìn cho nó đơn giản dễ sử dụng và thao tác dc không".
- **Thay một phần:** [ADR-049](ADR-049-man-quay-mot-man-hinh.md) D-220 — cách bày việc phụ trong bill. D-220 vẫn giữ: thẻ bàn một nút chính, việc phụ nằm trong bill.
- **Bối cảnh:**
  - Hộp Thu tiền bàn (S-14) đặt sáu nút việc phụ thành hai hàng ngay dưới tên bàn: Gọi thêm món, Ghi chú bàn, Chuyển bàn, Hủy bàn, Tách hóa đơn, Thu chung với bàn khác.
  - Mỗi thẻ đơn có thêm một hàng nút đỏ "Xóa đơn". Cuối hộp còn một dòng hướng dẫn "Không ghi nợ / trả thiếu…".
  - Ở vùng Quầy của màn một màn hình (hẹp, màn laptop 768 px), các nút tiền nhanh và một phần ô tiền khách đưa bị đẩy xuống dưới, phải cuộn mới thấy. Thu tiền là việc làm nhiều nhất của hộp này.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-257 | **Hộp Thu tiền chỉ bày việc thu tiền; việc phụ của bàn gom sau nút "Việc khác".**<ul><li>**Dưới tên bàn:** dòng "Mở lúc … · n đơn" và nút **"Việc khác ▾"** (`aria-expanded`). Bấm → khung hai cột: Gọi thêm món, Ghi chú bàn, Chuyển bàn, Tách hóa đơn, Thu chung với bàn khác, Hủy bàn (đỏ, cuối). Điều kiện hiện từng nút như cũ (F-046, F-057, F-058).</li><li>**Bấm một việc → khung gập lại.** Xong việc, hộp quay về thu tiền.</li><li>**Thẻ đơn:** "Xóa đơn" là chữ nhỏ màu đỏ trên đầu thẻ, cạnh trạng thái; vẫn hỏi lại kèm lý do. Đơn chưa tiếp nhận giữ hai nút Tiếp nhận / Hủy (việc chính của đơn đó).</li><li>**Dòng món:** tên (+ tùy chọn, ghi chú) bên trái, tiền bên phải, nút ✎ cuối dòng.</li><li>**Bỏ dòng "Không ghi nợ / trả thiếu…":** nút thu tự khóa khi thiếu tiền; hộp Tách hóa đơn đã ghi cách thu từng phần bằng tiền mặt hoặc chuyển khoản.</li><li>**Nút tiền nhanh:** lưới nút lớn (cao 48 px); "Đủ tiền (…k)" rộng gấp đôi. Dòng "Tiền thừa trả khách / Còn thiếu" có nền màu.</li><li>Máy chủ, API, quyền, cách tính tiền không đổi.</li></ul> |
| D-258 | **Mở bill bằng chạm tên bàn (hoặc chỗ trống của thẻ bàn) → "Việc khác" mở sẵn; mở bằng nút "Thu tiền" → gập.**<ul><li>Theo D-220, chạm tên bàn là cách mở bill để làm việc phụ, nên việc phụ hiện ngay.</li><li>Bấm "Thu tiền" là để thu tiền, nên hộp chỉ còn phần thu tiền.</li></ul> |

## Phương án đã cân nhắc

- **Mở hộp thứ hai "⋯" (như trang Nguyên liệu, TASK-109):** chồng hai hộp trong vùng Quầy hẹp, thêm một lớp phải đóng. Bỏ: khung mở ngay trong hộp, đóng bằng chính nút đó.
- **Bỏ hẳn một số việc phụ khỏi hộp** (Ghi chú bàn, Chuyển bàn đã có ở chỗ khác): chế độ máy quầy cũ chỉ vào các việc này qua hộp Thu tiền. Bỏ: giữ đủ, chỉ gập lại.
- **Điền sẵn "Tiền khách đưa" = đủ tiền để bấm thu luôn:** dễ thu nhầm khi khách đưa tờ lớn mà quên sửa số, tiền thừa sai. Bỏ: giữ nút "Đủ tiền" một chạm.

## Hệ quả

- **Mã nguồn:**
  - `js/pages/pos-dashboard.js`: `openSettle(sessionId, { tasks })`, nút "Việc khác" + khung `#settle-tasks`, thẻ đơn `.mo-head` / `.mo-items`, `groupCardCompact` mở sẵn khi chạm tên bàn;
  - `css/pos.css`: `.settle-sub`, `.settle-tasks`, `.mo-*`, `.quick-cash` dạng lưới, `.change` có nền.
- **Tài liệu:** FEATURE-088 (AC-088-11), US-088-1, screens-flows (SCR-14), tc-map.
- **Test:**
  - E2E "hộp Thu tiền gọn: …" (AC-088-11);
  - ba bài cũ (hủy bàn, thu chung, tách hóa đơn) bấm "Việc khác" trước;
  - a11y quét hộp có "Việc khác" mở (`quay-drawer-thu-tien-viec-khac`) và hộp trong vùng Quầy (`quay-mot-man-hinh-thu-tien`).
