# FEATURE-010 — Quản lý menu, danh mục, bàn và QR (ADMIN)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED (chi tiết trường: PROPOSED)
- **Source:** Actor 1.3, REQ-016
- **Menu item:** `name` (bắt buộc, ≤ 100), `categoryId`, `price` (≥ 0, VND nguyên), `imageUrl` (tùy chọn — bản đầu là URL/ảnh tĩnh trong `public/`), `isAvailable` (bật/tắt "hết món" nhanh), `isActive` (ẩn khỏi menu). Đổi `isAvailable` → phát `menu.availability_changed`.
- **Danh mục:** `name`, `sortOrder`.
- **Bàn:** `code` (duy nhất, ví dụ "05"), `name`, `isActive`; hệ thống sinh `qrToken` (ngẫu nhiên 32 ký tự) và ảnh QR cho URL `https://<domain>/t/{qrToken}`; nút "Tạo lại QR" (vô hiệu QR cũ); nút "In QR" (trang in lưới QR).
- **Acceptance Criteria**
  - AC-010-01: Tạo món, giá 35000 → xuất hiện trên menu khách trong lần tải kế tiếp.
  - AC-010-02: Tắt `isAvailable` → trong ≤ 2 s (NFR-001) khách đang mở menu thấy món chuyển "Hết món", không tải lại trang. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
  - AC-010-03: Tạo bàn "07" → có ảnh QR tải được; quét → vào `/t/{qrToken}` đúng bàn 07.
  - AC-010-04: Tạo lại QR bàn 07 → QR cũ trả 404.
  - AC-010-05: STAFF gọi API admin → 403.
  - AC-010-06: Xóa món đã bán (ADR-004) → xóa mềm: món ẩn khỏi menu và danh sách quản lý, khách đặt món đó → 409 `ITEM_UNAVAILABLE`, báo cáo cũ vẫn giữ tên món, sửa món → 404. _(bổ sung — TASK-057, 20/10/2026)_
  - AC-010-07: Xóa danh mục còn món → 409 `HAS_ITEMS`; danh mục chỉ còn món đã xóa mềm → xóa mềm; danh mục trống → xóa hẳn. _(bổ sung — TASK-057, 20/10/2026)_
  - AC-010-08: Xóa bàn đang có khách (phiên chưa đóng) → 409 `TABLE_BUSY`; bàn đã có phiên → xóa mềm, QR cũ → 404; bàn chưa dùng → xóa hẳn; mã bàn đã xóa dùng lại được khi tạo bàn mới. _(bổ sung — TASK-057, 20/10/2026)_
- **Liên kết:** Data `Categories, MenuItems, Tables` · API [api-contract](../kiến-trúc/api-contract.md) (phần Quản trị) · UI S-21, S-22.
- **Cập nhật ADR-004 (14/10/2026):** có nút Xóa món, danh mục, bàn. Món đã bán / bàn đã có phiên → xóa mềm (ẩn khỏi menu, QR cũ hết hiệu lực); bàn đang có khách → chặn; danh mục còn món → chặn.
