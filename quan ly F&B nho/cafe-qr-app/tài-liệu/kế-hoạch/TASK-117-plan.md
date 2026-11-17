# TASK-117 — Kế hoạch: thêm tài khoản chủ quán (F-096, ADR-058)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| Xác nhận | `services/userService.js` | `create` / `update`: vai đích ADMIN mà tài khoản chưa là ADMIN → so `confirmPassword` với mật khẩu người thao tác (bcrypt); khóa tạm theo bộ đếm APPROVAL của `authGuardService` (F-071) |
| Cảnh báo | `services/alertService.js` | `onOwnerAdded` → cảnh báo ACCESS_GRANT (chỉ chủ quán) + email tức thì; lỗi gửi không chặn việc tạo tài khoản |
| API | `routes/admin.js` | `confirmPassword` (chuỗi, không bắt buộc ở lược đồ — dịch vụ đòi khi cần) ở POST / PUT `/users` |
| Giao diện | `js/pages/admin-users.js`, `js/roles.js` | nút "+ Thêm tài khoản"; chọn Chủ quán → khung cảnh báo + ô "Mật khẩu của bạn" (hiện / ẩn theo ô Vai trò); lỗi dưới ô |
| Test | `tests/owner-accounts.test.js`, `flow.spec.js` | tài khoản thử riêng; dọn ở cuối |

Rủi ro: (1) đổi phân quyền → ADR-058 ghi rõ chỉ thêm bước xác nhận + cảnh báo, không mở quyền mới. (2) bài cũ tạo tài khoản ADMIN qua API (finance.test "luôn còn một Quản lý") → cập nhật gửi `confirmPassword`. (3) nút đổi tên "+ Thêm tài khoản" → E2E cũ tìm theo tên nút phải sửa theo.
