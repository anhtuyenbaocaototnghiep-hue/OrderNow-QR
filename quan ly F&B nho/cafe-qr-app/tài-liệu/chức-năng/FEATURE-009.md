# FEATURE-009 — Đăng nhập nhân viên và quản lý tài khoản

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED
- **Source:** Actor 1.2–1.3, US8 (bản 2), Module 5.2
- **Actor:** STAFF/ADMIN (đăng nhập); ADMIN (CRUD)
- **Đăng nhập:** `POST /api/auth/login { username, password }` → JWT (access 8 h — PROPOSED, đủ một ca) hoặc cookie HttpOnly; trả `{ user: { id, fullName, role } }`. Sai → 401 "Sai tên đăng nhập hoặc mật khẩu" (không phân biệt tài khoản tồn tại hay không). Tài khoản khóa → 403 "Tài khoản đã bị khóa".
- **CRUD tài khoản (ADMIN):** tạo (`username, password, fullName, role`), sửa tên/role, đặt lại mật khẩu, khóa/mở (`IsActive`). Không xóa cứng (giữ lịch sử `CompletedBy`).
- **Acceptance Criteria**
  - AC-009-01: Tạo nhân viên `staff2`/Staff → đăng nhập được ngay; vào dashboard quầy; gọi API admin → 403.
  - AC-009-02: Tạo trùng `staff2` (hoặc `STAFF2`) → 409 "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác".
  - AC-009-03: Khóa `staff2` → request kế tiếp với token cũ → 403; đăng nhập lại → 403.
  - AC-009-04: Mật khẩu trong DB là hash (bcrypt/argon2), không phải plaintext.
  - AC-009-05: ADMIN không tự khóa chính mình (PROPOSED).
- **Liên kết:** Data `Users` · API [api-contract](../kiến-trúc/api-contract.md) (phần Quầy: auth; phần Quản trị: users) · UI S-09, S-20 · Rule BR-004, BR-017.
- **Cập nhật ADR-004 (14/10/2026):** có nút Xóa tài khoản. Chưa có thao tác → xóa hẳn; đã có → xóa mềm (không đăng nhập được, token cũ 401; username dùng lại được). Không tự xóa mình.
