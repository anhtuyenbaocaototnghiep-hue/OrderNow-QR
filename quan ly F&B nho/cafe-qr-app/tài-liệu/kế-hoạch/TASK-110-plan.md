# TASK-110 — Kế hoạch: phân quyền đơn giản (F-090, ADR-051)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| API | `services/accessService.js`, `routes/access.js` (dưới `/api/admin` — `requireAdminArea`; `role-permissions` không thuộc quyền cấp được → chỉ chủ quán) | `roleDefaults({ role, positions })` = `CAPABILITIES.map(byRole)` trên người giả (vị trí chỉ cho STAFF; ADMIN đủ cả); `GET /role-permissions` kiểm `role` ∈ ROLES, `positions` CSV ∈ POSITIONS (bỏ trùng) |
| Phần Quyền | `js/perm-editor.js` (mới), `css/admin.css` | Nghe `change` của ô `role` / `positions` trong form → gọi API (bỏ kết quả cũ); công tắc `input[type=checkbox][role=switch]` (tên = nhãn quyền, mô tả = nhãn Theo vai trò / Cấp thêm / Bỏ bớt); `grants()` chỉ gửi việc khác mặc định, giữ hạn quyền tạm chưa chạm; `changed()` so với quyền đang lưu |
| Trang Tài khoản | `js/pages/admin-users.js` | Thêm: tạo rồi `PUT …/grants` nếu có; Sửa: tải `GET …/grants` trước khi mở, `PUT …/grants` khi đổi; bỏ `grantsDialog`, `expiryFrom`; nhãn ô nhập có `for` |
| Test | `tests/role-permissions.test.js` (mới), `flow.spec.js`, `a11y.spec.js` | AC-090-01…04; AC-079-07 dùng hộp Sửa |

Rủi ro:
- Bấm Lưu ngay sau khi đổi vai trò (API mặc định chưa về) → `send()` đợi `ready()` trước khi tính quyền riêng.
- Hạn quyền lưu tới giây (CSDL) — so sánh hạn bằng thời điểm, test dùng thời gian tròn giây.
- Sửa chủ quán / đổi vai thành Chủ quán: không gọi lưu quyền (máy chủ trả `OWNER_ALWAYS`).
