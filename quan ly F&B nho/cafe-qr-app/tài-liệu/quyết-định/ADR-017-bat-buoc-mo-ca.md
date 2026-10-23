# ADR-017 — Chưa mở ca thì không nhận và không xử lý đơn

- **Trạng thái:** ACCEPTED (23/10/2026). Chủ dự án chọn phương án trong phiên làm việc ngày 23/10/2026, trả lời câu hỏi trước khi code.
- **Bối cảnh:**
  - Chủ dự án yêu cầu: "khi chưa mở ca thì không thể order, bắt buộc phải mở ca để hoạt động các chức năng".
  - Trước đây ca (F-018) chỉ bắt buộc khi **thu tiền** (thu tiền bàn, chia bill, mang đi, hoàn tiền, sổ quỹ — `409 NO_OPEN_SHIFT`). Khách vẫn gửi đơn qua QR, quầy vẫn gọi món tại bàn, tiếp nhận, hoàn tất (trừ kho) khi chưa có ca → đơn và kho phát sinh mà không gắn với ca nào, không ai chịu trách nhiệm.
  - Quán có **một ca dùng chung** tại một thời điểm; F-054 (ADR-014) bắt người mở ca đóng ca trước khi đăng xuất.
  - Câu hỏi đưa chủ dự án chọn: khách QR khi chưa mở ca (xem menu không gửi đơn / chặn cả menu); ở quầy khóa nhóm nào (tạo đơn mới / xử lý đơn / kho ở quầy / cả trang Quản lý).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-64 | **Khách QR khi chưa mở ca:** vẫn xem menu, chọn món, xem giỏ và giá; **không gửi được đơn**. Điện thoại hiện "Quán chưa mở ca nên chưa nhận đơn — vui lòng chờ nhân viên mở ca", nút Gửi đơn bị khóa. Server từ chối `POST /api/orders` → `409 NO_OPEN_SHIFT`. Ca mở / đóng thì điện thoại đang mở menu tự cập nhật, không cần tải lại. |
| D-65 | **Quầy khi chưa mở ca — khóa "xử lý đơn":** tiếp nhận, hoàn tất (trừ kho), hủy đơn, sửa / xóa món, xóa đơn, hủy lượt phục vụ bàn (F-046), chuyển bàn (F-049), chia bill (tạo phần, gán món, gộp lại — F-026), và **gọi món tại bàn** (F-024). Gọi món tại bàn xếp vào nhóm này vì đơn nhân viên nhập được tiếp nhận ngay (vào thẳng "Đang pha"), và đúng ý "chưa mở ca thì không thể order". Server trả `409 NO_OPEN_SHIFT` "Chưa mở ca — hãy mở ca trước khi xử lý đơn". Thu tiền / mang đi / hoàn tiền / sổ quỹ vẫn bắt buộc ca như trước. |
| D-66 | **Không khóa:** xem đơn, bàn, lịch sử, báo cáo; mở bàn và ghi chú bàn; đóng bàn trống; xử lý gọi nhân viên và đánh giá thấp; khách gọi thanh toán; **kho ở quầy** (sơ chế, phiếu hủy hàng, lô, nhận hàng theo PO, kiểm kê — thường làm trước giờ mở ca); **toàn bộ trang Quản lý**; mở / đóng ca. Đóng ca khi còn đơn chưa xong vẫn được như trước; các đơn đó xử lý tiếp khi có ca mới. |

Chủ dự án **không chọn**:
- chặn cả xem menu khi chưa mở ca;
- khóa kho ở quầy;
- khóa trang Quản lý.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| Chặn ở đâu | Tầng service: `requireOpenShift(việc)` ở đầu mỗi thao tác bị khóa (`orderService`, `voidService`, `sessionService.moveSession`, `splitService`) — mọi đường vào (API, giao diện) cùng bị chặn | Quy tắc nghiệp vụ không đặt ở route / giao diện (system-overview) |
| Mã lỗi | Dùng lại `409 NO_OPEN_SHIFT` (đã có ở F-018), lời nhắn theo việc: "… trước khi xử lý đơn"; khách: "Quán chưa mở ca nên chưa nhận đơn …" | Không thêm mã lỗi mới; giao diện quầy đã hiểu mã này |
| Khách biết ca đang mở hay không | Trạng thái quán (`store` trong menu, `GET /api/store`, sự kiện `store.status_changed`) thêm `shiftOpen`. Mở / đóng ca phát `store.status_changed` tới phòng `public` + `staff` | Công tắc "nhận đơn QR" (F-020, `acceptingOrders`) giữ nguyên nghĩa; ca là điều kiện thứ hai, tách riêng để quầy không thấy công tắc tự tắt |
| Kiểm ca rồi mới làm (không khóa chung) | Ca đóng đúng lúc một thao tác đang chạy thì thao tác đó vẫn xong | Hai việc gần như không trùng giờ ở quán nhỏ; thu tiền vẫn kiểm ca trong SP như trước |

## Hệ quả

- Không migration, không thêm dependency. API: thêm `409 NO_OPEN_SHIFT` ở các endpoint thuộc D-64, D-65; `store.shiftOpen`.
- Test: các test cũ tạo / xử lý đơn mà chưa mở ca phải mở ca trước (đúng nghiệp vụ mới).
- Feature: [FEATURE-055](../chức-năng/FEATURE-055.md) — [TASK-071](../công-việc/TASK-071.md). Business rule: BR-087.
