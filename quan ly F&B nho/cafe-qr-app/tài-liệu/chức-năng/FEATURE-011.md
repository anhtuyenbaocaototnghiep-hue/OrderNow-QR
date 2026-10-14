# FEATURE-011 — Nguyên liệu, BOM và kho (ADMIN)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED — điều chỉnh kho tay có lý do theo ADR-003 (Q-011). Đã triển khai 14/10/2026
- **Source:** US9 (bản 1), US7 (bản 2), Module 4.1, Actor 1.3
- **Nguyên liệu:** `name`, `unit` (ml/g/cái/…), `stockQty` (≥ 0, 3 số lẻ), `lowStockThreshold` (≥ 0).
- **BOM cho món:** danh sách `{ ingredientId, amount }`; lưu **thay thế toàn bộ** BOM của món trong một transaction; `amount > 0`; không trùng nguyên liệu trong một món.
- **Điều chỉnh kho:** `POST /api/admin/ingredients/{id}/adjust { newQty | delta, reason }` → ghi `InventoryTransactions(ADJUST)`; không cho kết quả âm.
- **Xem kho:** bảng nguyên liệu với `stockQty`, `reservedQty` (nếu A), `available`, cảnh báo sắp hết (BR-016), lịch sử giao dịch kho theo nguyên liệu.
- **Acceptance Criteria**
  - AC-011-01: Món "Cà phê đen" lưu BOM [25 ml cốt cà phê, 10 g đường] → bán 1 ly và hoàn tất → kho giảm đúng 25 ml và 10 g.
  - AC-011-02: Nhập `-10` hoặc để trống nguyên liệu → từ chối, highlight ô lỗi, "Định lượng không hợp lệ, phải lớn hơn 0"; BOM cũ giữ nguyên.
  - AC-011-03: Điều chỉnh kho tay tạo dòng `InventoryTransactions(ADJUST)` với lý do; điều chỉnh xuống dưới `ReservedQty` bị từ chối (nếu A).
  - AC-011-04: Nguyên liệu `available ≤ threshold` → hiển thị cảnh báo ở trang kho và báo cáo.
- **Liên kết:** Data `Ingredients, BomItems, InventoryTransactions` · API [api-contract](../kiến-trúc/api-contract.md) (phần Quản trị) · UI S-23, S-24 · Rule BR-003, BR-016.
- **Cập nhật ADR-004 (14/10/2026):** có nút Xóa nguyên liệu. Đang trong định lượng của món → chặn (báo tên món); đang giữ cho đơn → chặn; đã có lịch sử kho → xóa mềm.
