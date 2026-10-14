# FEATURE-010 — Quản lý menu, danh mục, bàn và QR (ADMIN)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED (chi tiết trường: PROPOSED)
- **Source:** Actor 1.3, REQ-016
- **Menu item:** `name` (bắt buộc, ≤ 100), `categoryId`, `price` (≥ 0, VND nguyên), `imageUrl` (tùy chọn — bản đầu là URL/ảnh tĩnh trong `public/`), `isAvailable` (bật/tắt "hết món" nhanh), `isActive` (ẩn khỏi menu). Đổi `isAvailable` → phát `menu.availability_changed`.
- **Danh mục:** `name`, `sortOrder`.
- **Bàn:** `code` (duy nhất, ví dụ "05"), `name`, `isActive`; hệ thống sinh `qrToken` (ngẫu nhiên 32 ký tự) và ảnh QR cho URL `https://<domain>/t/{qrToken}`; nút "Tạo lại QR" (vô hiệu QR cũ); nút "In QR" (trang in lưới QR).
- **Acceptance Criteria**
  - AC-010-01: Tạo món, giá 35000 → xuất hiện trên menu khách trong lần tải kế tiếp.
  - AC-010-02: Tắt `isAvailable` → khách đang mở menu thấy món chuyển "Hết món" không cần reload.
  - AC-010-03: Tạo bàn "07" → có ảnh QR tải được; quét → vào `/t/{qrToken}` đúng bàn 07.
  - AC-010-04: Tạo lại QR bàn 07 → QR cũ trả 404.
  - AC-010-05: STAFF gọi API admin → 403.
- **Liên kết:** Data `Categories, MenuItems, Tables` · API [api-contract](../kiến-trúc/api-contract.md) (phần Quản trị) · UI S-21, S-22.
- **Cập nhật ADR-004 (14/10/2026):** có nút Xóa món, danh mục, bàn. Món đã bán / bàn đã có phiên → xóa mềm (ẩn khỏi menu, QR cũ hết hiệu lực); bàn đang có khách → chặn; danh mục còn món → chặn.
