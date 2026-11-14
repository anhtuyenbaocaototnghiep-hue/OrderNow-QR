# TASK-112 — Kế hoạch: trang Quyền nâng cao + SĐT tài khoản (F-091, ADR-053)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| CSDL | `cơ-sở-dữ-liệu/chuyển-đổi/0059_so_dien_thoai_tai_khoan.sql` | `Users.Phone VARCHAR(15) NULL` + `CK_Users_Phone` ('+84' + 9 số); chỉ thêm |
| API | `routes/admin.js` (`staffFields.phone`: `normalizePhone` của hội viên, vắng = giữ), `services/userService.js` (`list({ withPhone })`), `repositories/usersRepo.js` | Không thêm `Phone` vào `COLS` chung (phiên đăng nhập / `/auth/me` không mang SĐT) — chỉ danh sách / tạo / sửa |
| Trang mới | `admin/permissions.html`, `js/pages/admin-permissions.js`, `routes/pages.js`, `js/admin-shell.js` | Khung Xin quyền (chuyển từ admin-users.js), danh sách người, `permissionSwitches(view)`, hỏi khi bỏ thay đổi, `?user=` |
| Hộp tài khoản | `js/perm-editor.js` (`roleSummary(form, user)`), `js/pages/admin-users.js` | Ô + cột SĐT (`tel:`), tóm tắt quyền + liên kết; lưu tài khoản không gửi quyền |
| Liên kết | `js/pages/admin-today.js` | Việc cần làm "xin quyền" → `/admin/permissions#xin-quyen` |
| Test | `tests/staff-phone.test.js` (mới), `flow.spec.js`, `a11y.spec.js` | AC-091-01…04; sửa AC-079-07, AC-090-02…04 |

Rủi ro:
- `ui.modules` / quyền: trang mới không thuộc quyền cấp được → chỉ chủ quán (như Tài khoản), không cần đổi `permissions.js`.
- Không dùng `beforeunload` (hộp hỏi của trình duyệt chặn chuyển trang trong test tự động) — chỉ hỏi khi đổi người trong trang.
- Dev DB (CafeQrDev) cần chạy migration 0059 trước khi khởi động lại máy chủ.
