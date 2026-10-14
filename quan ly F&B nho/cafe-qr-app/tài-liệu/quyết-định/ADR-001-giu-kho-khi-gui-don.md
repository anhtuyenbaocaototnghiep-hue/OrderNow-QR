# ADR-001 — Giữ kho khi gửi đơn, trừ thật khi hoàn tất (Q-001 = phương án A)

- **Trạng thái:** ACCEPTED (theo đề xuất của tài liệu nguồn; nhóm có thể đổi bằng ADR mới)
- **Ngày:** 14/10/2026. Chủ dự án yêu cầu triển khai hoàn chỉnh, nên áp dụng phương án đề xuất.
- **Câu hỏi đóng:** Q-001 (và BR-010 → CONFIRMED)

## Quyết định

- **Gửi đơn** (`sp_SubmitOrder`): trong một transaction, tăng `ReservedQty` bằng `UPDATE … WHERE StockQty - ReservedQty >= cần`. Nếu có nguyên liệu nào không đủ thì rollback cả đơn (`50002 OUT_OF_STOCK`).
- **Hoàn tất** (`sp_CompleteOrder`): giảm cả `StockQty` và `ReservedQty`, ghi `InventoryTransactions(DEDUCT)`.
- **Hủy** (`sp_CancelOrder`): trả lại `ReservedQty`.
- **Bổ sung khi triển khai:** lượng nguyên liệu của mỗi đơn được **chụp lại lúc gửi** vào bảng `OrderIngredients(OrderId, IngredientId, Qty)`, rồi hoàn tất/hủy dùng đúng con số đó. Lý do: bản SP trong tài liệu nguồn tính lại nhu cầu từ BOM *hiện tại* lúc hoàn tất/hủy. Nếu admin sửa BOM khi đơn đang chờ thì `ReservedQty` bị lệch, có thể âm và vi phạm CHECK.

## Hệ quả

- Khách bị từ chối ngay lúc gửi đơn chứ không phải chờ tới lúc hoàn tất; kho không bao giờ âm.
- Bất biến dùng trong test: `ReservedQty = Σ OrderIngredients.Qty` của các đơn `PENDING/PREPARING`.
- Điều chỉnh kho tay không được làm `StockQty` thấp hơn `ReservedQty`.
