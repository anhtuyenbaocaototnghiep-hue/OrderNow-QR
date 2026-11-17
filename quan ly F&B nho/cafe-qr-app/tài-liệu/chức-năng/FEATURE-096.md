# FEATURE-096 — Thêm tài khoản chủ quán

> **Nguồn:** chủ dự án — "làm thêm có thể tạo thêm tài khoản admin nữa nha" (16/11/2026). Quyết định: [ADR-058](../quyết-định/ADR-058-them-tai-khoan-chu-quan.md) D-236, D-237. Nền: [F-009](FEATURE-009.md) tài khoản, [F-036](FEATURE-036.md) luôn còn một quản lý, [F-071](FEATURE-071.md) khóa tạm khi sai mật khẩu, [F-079](FEATURE-079.md) cảnh báo cấp quyền, [F-084](FEATURE-084.md) chủ quán chỉ dùng trang Quản lý.

- **Status:** CONFIRMED (ADR-058) · Triển khai: [TASK-117](../công-việc/TASK-117.md)
- **Actor:** **ACT-ADMIN** (tạo / nâng chủ quán, nhận cảnh báo).
- **Màn hình:** **SCR-20** Tài khoản (hộp Thêm / Sửa tài khoản), **SCR-47** Cảnh báo.
- **Dữ liệu:** không đổi bảng; vai `ADMIN` có sẵn.

## User Story

- **US-096-1:** Là chủ quán, tôi muốn tạo thêm tài khoản chủ quán (toàn quyền) cho người cùng làm chủ, có bước xác nhận bằng mật khẩu của tôi và báo cho các chủ quán khác, để chia việc quản lý mà vẫn an toàn.

## Quy tắc

1. Chỉ chủ quán tạo / sửa / xóa tài khoản (như cũ). Tạo tài khoản vai Chủ quán hoặc đổi vai trò thành Chủ quán phải nhập đúng mật khẩu của chính mình; sai 5 lần / 15 phút → khóa tạm 15 phút.
2. Có chủ quán mới → cảnh báo cho mọi chủ quán (trang Cảnh báo + email nếu đã cấu hình).
3. Luôn còn ít nhất một chủ quán đang hoạt động; không tự đổi vai trò / khóa / xóa chính mình; chủ quán không đăng nhập máy quầy.

## API

- `POST /api/admin/users`, `PUT /api/admin/users/{id}`: thêm `confirmPassword` (bắt buộc khi `role = "ADMIN"` và tài khoản chưa là chủ quán) → sai `403 OWNER_CONFIRM_INVALID`, sai nhiều lần `429 APPROVAL_LOCKED`.

## Acceptance Criteria

- AC-096-01: Chủ quán tạo tài khoản vai ADMIN kèm mật khẩu của mình đúng → 201; tài khoản mới đăng nhập trang Quản lý, gọi được `GET /api/admin/users`, không đăng nhập máy quầy (403 `OWNER_ADMIN_ONLY`); thiếu `confirmPassword` → 400; sai → 403 `OWNER_CONFIRM_INVALID`; tạo nhân viên không cần xác nhận; đổi vai trò nhân viên thành ADMIN cũng cần xác nhận; sai 5 lần → 429; có cảnh báo ACCESS_GRANT "… tạo tài khoản Chủ quán cho …" (quản lý cửa hàng không thấy); quản lý cửa hàng gọi `POST /api/admin/users` → 403; hai chủ quán khóa / hạ nhau còn một → 409 `LAST_ADMIN`.
- AC-096-02: (E2E máy tính) Tài khoản → "+ Thêm tài khoản" → chọn vai trò Chủ quán → hiện cảnh báo toàn quyền + ô "Mật khẩu của bạn"; nhập sai → lỗi dưới ô, hộp còn mở; đúng → tạo xong, danh sách có nhãn Chủ quán; đăng nhập trang Quản lý bằng tài khoản mới → vào Hôm nay, mở được Tài khoản; trang Cảnh báo có tin tạo tài khoản Chủ quán.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/owner-accounts.test.js` (AC-096-01).
- E2E: `kiểm-thử/e2e/flow.spec.js` bài "thêm tài khoản chủ quán…" (AC-096-02).
