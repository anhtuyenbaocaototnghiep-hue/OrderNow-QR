# ADR-003 — Áp dụng các phương án đề xuất cho những câu hỏi còn mở

- **Trạng thái:** ACCEPTED (theo đề xuất ghi sẵn trong `tài-liệu/open-questions.md`; nhóm có thể đổi từng mục bằng ADR mới)
- **Ngày:** 14/10/2026. Chủ dự án yêu cầu "triển khai hoàn chỉnh, không cần đúng tiến độ", nên agent áp dụng phương án **đề xuất** của tài liệu cho mọi câu hỏi còn mở, trừ những câu cần thông tin bên ngoài (Q-000, Q-008).

Gom vào một ADR để dễ rà soát. Số ADR-003/004/005 trong gợi ý cũ được gộp vào đây.

| Q | Quyết định áp dụng | Ghi chú triển khai |
| --- | --- | --- |
| Q-004b | **Có nút Tiếp nhận** (`PENDING → PREPARING`). POS có thêm nút "Tiếp nhận & Hoàn tất" (2 lệnh tuần tự) | Đơn mang đi vào thẳng `PREPARING` |
| Q-005 | **Từ chối cả đơn** khi có món thiếu nguyên liệu; server trả danh sách món; client tự bỏ món đó khỏi giỏ và báo | `409 OUT_OF_STOCK { items: [{ menuItemId, name }] }` |
| Q-006 | **Hoàn tất theo đơn** (một nút, một SP, một lần trừ kho) | Hoàn tất từng món: làm sau |
| Q-007 | Mở ngăn kéo tiền: **làm sau** | — |
| Q-010 | Chỉ **quầy** hủy được đơn `PENDING` (kèm lý do); khách không tự hủy | Thêm cột `CancelReason`, `CancelledBy` |
| Q-011 | **Điều chỉnh tồn kho thủ công** (nhập số mới hoặc ±, kèm lý do) ghi `InventoryTransactions(ADJUST)`; tồn ban đầu khi tạo nguyên liệu cũng ghi `ADJUST` | Phiếu nhập kho đầy đủ: làm sau |
| Q-012 | "Giỏ chung" = **chia sẻ các đơn đã gửi và tổng tạm tính** của phiên; giỏ chưa gửi là riêng từng điện thoại | Không thêm bảng giỏ |
| Q-013 | `sp_SubmitOrder` **khóa dòng `Sessions`** trong transaction và từ chối khi phiên `CLOSED`. **Cho gọi thêm** sau khi đã gọi thanh toán: phiên quay về `OPEN` và phát `session.payment_cancelled` | `sp_SettleSession`, `sp_RequestPayment`, `sp_CloseEmptySession` cũng khóa `Sessions` trước tiên |
| Q-014 | Có **tab "Lịch sử đơn"** trong trang báo cáo (lọc ngày/trạng thái, xem chi tiết, in lại). "Theo ca": làm sau | API `GET /api/admin/orders` |
| Q-015 | Phiếu dán ly cho đơn dine-in: **làm sau** | Bill mang đi in lúc tạo |
| Q-016 | NFR-003 = **≤ 3 chạm** tính từ lúc menu hiện ra đến khi gửi xong đơn 1 món, không tính hộp thoại Gộp/Cá nhân. Luồng chuẩn: "+" món → thanh nổi "Xem giỏ · Gửi đơn" → "Gửi đơn" (giỏ là bottom sheet nên vẫn xem lại được trước khi gửi) | Kiểm bằng E2E `gọi món trong 3 chạm` |
| Q-017 | **Một dashboard quầy**; KDS riêng làm sau | — |
| Q-018 | Phiên chỉ có đơn đã hủy (hoặc không có đơn) được **"Đóng bàn trống"** | `sp_CloseEmptySession` |
| FEATURE-012 | Doanh thu tính theo **ngày thanh toán** (`PaidAt`), quy đổi múi giờ Việt Nam (UTC+7) | — |
| Hết món | Menu khách tự hiển thị **"Hết món"** khi món bị tắt (`IsAvailable = 0`) **hoặc** không đủ nguyên liệu khả dụng cho 1 suất. Hệ thống không tự đổi cờ `IsAvailable` của admin | Đáp ứng US2 AC2 ("tự cập nhật trạng thái hết hàng trên menu"); phát `menu.availability_changed` khi trạng thái tính toán đổi |

**Vẫn còn mở:** Q-000 (ai ký chốt) và Q-008 (hosting online). Hiện hệ thống chạy local/LAN; deploy online cần tài khoản dịch vụ của nhóm.
