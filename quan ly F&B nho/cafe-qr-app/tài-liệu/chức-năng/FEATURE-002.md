# FEATURE-002 — Xem menu và giỏ hàng

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED
- **Source:** US2, Module 1.2, III.1 "Module Tự phục vụ"
- **Actor:** Khách (và Quầy khi tạo take-away dùng lại component)
- **Mục tiêu:** Khách xem món theo danh mục, thêm vào giỏ, chỉnh số lượng/ghi chú, trong ≤ 3 thao tác tới bước gửi.
- **Đầu vào:** không (GET). Giỏ hàng lưu **phía client** (state + localStorage theo `sessionId`); server không lưu giỏ chưa gửi (→ không cần "dọn giỏ rác" ở DB).
- **Luồng:** `GET /api/menu` trả danh mục → món (`id, name, price, imageUrl, isAvailable`). Món `isAvailable = false` hiển thị mờ "Hết món", không thêm được.
- **Trạng thái UI:** loading skeleton; rỗng ("Quán chưa có món"); lỗi mạng (nút thử lại); đã hết món.
- **Acceptance Criteria**
  - AC-002-01: Menu hiển thị đúng món active, nhóm theo danh mục, giá định dạng VND.
  - AC-002-02: Thêm món, tăng/giảm số lượng, nhập ghi chú "ít đường" → giỏ cập nhật tổng tạm tính = Σ qty×price.
  - AC-002-03: Món `isAvailable = false` không thêm được vào giỏ.
  - AC-002-04: Reload trang → giỏ vẫn còn (cùng `sessionId`).
  - AC-002-05: Khách đang mở menu; quản lý hoặc quầy tắt / bật lại "còn bán" của một món (sự kiện `menu.availability_changed`) → trong ≤ 2 s (NFR-001), không tải lại trang, thẻ món đổi sang "Hết món" (không thêm vào giỏ được) hoặc hiện lại nút thêm. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
  - AC-002-06: Thực đơn không có món nào → menu khách hiện "Quán chưa có món nào trên thực đơn."; tải menu lỗi mạng → hiện thông báo lỗi kèm nút "Thử lại", bấm khi đã có mạng → menu tải lại được. _(bổ sung — TASK-057, 20/10/2026)_
- **Liên kết:** API `GET /api/menu` · UI S-02 · NFR-003, NFR-004 · Hỏi: Q-012 (giỏ chung), Q-016 (định nghĩa thao tác).
