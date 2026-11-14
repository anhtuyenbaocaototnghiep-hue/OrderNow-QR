# ADR-053 — Trang riêng "Quyền nâng cao" và số điện thoại tài khoản

- **Trạng thái:** ACCEPTED (14/11/2026). Chủ dự án: "bạn tạo thêm một trang riêng về quyền nâng cao bên tài khoản để thêm mục số điện thoại".
- **Bối cảnh:** sau [ADR-051](ADR-051-phan-quyen-don-gian.md) D-224, công tắc "Quyền nâng cao" nằm trong hộp Thêm / Sửa tài khoản — hộp dài (họ tên, vai trò, vị trí, cấp, tóm tắt quyền, 17 công tắc), khó thêm ô mới. Khung "Xin quyền chờ duyệt" (F-079) ở trang Tài khoản. Tài khoản nhân viên chưa có số điện thoại để chủ quán liên lạc.
- **Cách hiểu yêu cầu (đề xuất, chủ dự án xem lại):** (1) tách phần bật / tắt từng quyền ra một trang riêng thuộc khu Tài khoản; (2) thêm ô "Số điện thoại" cho tài khoản (hộp Thêm / Sửa gọn hơn nên còn chỗ). Số điện thoại để liên lạc, không dùng để đăng nhập.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-226 | **Trang riêng "Quyền nâng cao"** `/admin/permissions` (SCR-58, chỉ chủ quán) — mục thanh bên ngay sau "Tài khoản" (nhóm Hệ thống). Gồm: khung **Xin quyền chờ duyệt** (chuyển từ trang Tài khoản; Hôm nay → `/admin/permissions#xin-quyen`; duyệt xong trang chọn sẵn người đó); **danh sách người** (trừ chủ quán: tên, vai, vị trí, "N quyền nâng cao", "Đã khóa"); **công tắc Cho phép / Không cho phép** của người đang chọn (giữ D-222: khác vai trò → quyền riêng không hạn; quyền tạm giữ hạn nếu không chạm), dòng "Cấp thêm … · Bỏ bớt …", **Về như vai trò**, **Lưu quyền**. Đổi người khi còn thay đổi chưa lưu → hỏi "Bỏ thay đổi chưa lưu?". `?user={id}` chọn sẵn người. Hộp Thêm / Sửa tài khoản chỉ còn tóm tắt "Vai trò này được làm N / 17 việc" (D-223) + liên kết "Quyền nâng cao" (khi sửa: tới đúng người, ghi "Người này có N quyền nâng cao"); lưu tài khoản không đụng quyền riêng. Nhãn "Có quyền nâng cao" ở dòng tài khoản là liên kết `/admin/permissions?user={id}`; trang Tài khoản còn dòng nhắc "N yêu cầu xin quyền chờ duyệt — mở Quyền nâng cao". **Thay ADR-051 D-224.** API quyền không đổi. |
| D-227 | **Số điện thoại tài khoản:** ô "Số điện thoại (không bắt buộc)" trong hộp Thêm / Sửa; chuẩn hóa như SĐT hội viên (BR-024: `0xxxxxxxxx` / `+84…` / `84…`, bỏ dấu cách / chấm / gạch) → lưu `+84` + 9 chữ số (`Users.Phone`, migration 0059, CHECK định dạng); sai định dạng → `400 VALIDATION_ERROR` ô `phone`; không bắt trùng; sửa không gửi `phone` = giữ, `''` / `null` = xóa. **Chỉ chủ quán thấy:** cột "Số điện thoại" ở trang Tài khoản (liên kết `tel:` để gọi), `GET /api/admin/users` chỉ trả `phone` cho chủ quán (người khác đọc danh sách — quyền Nhân sự / Lương — không nhận số). Nhật ký thao tác che số (`***678`). |

## Phương án đã cân nhắc

- **Ma trận người × quyền trên một bảng:** nhìn được hết nhưng 17 cột × nhiều người khó dùng trên điện thoại / máy nhỏ; chọn người rồi bật / tắt dễ hơn.
- **Giữ công tắc trong hộp tài khoản + thêm ô SĐT:** hộp quá dài (lý do chủ dự án muốn tách).
- **SĐT bắt buộc / duy nhất / dùng đăng nhập:** chưa có nhu cầu; bắt buộc làm khó tạo tài khoản nhanh; dùng đăng nhập cần đổi luồng đăng nhập (ngoài phạm vi).
- **Quản lý cửa hàng cũng thấy SĐT nhân viên (để gọi khi xếp lịch):** để mặc định riêng tư — chỉ chủ quán; mở thêm sau nếu chủ quán muốn.

## Hệ quả

- **Dữ liệu:** migration `0059_so_dien_thoai_tai_khoan.sql` (`Users.Phone VARCHAR(15) NULL` + `CK_Users_Phone`), chỉ thêm cột.
- **Mã nguồn:** `repositories/usersRepo.js` (`Phone` ở danh sách / tạo / sửa), `services/userService.js` (`list({ withPhone })`), `routes/admin.js` (ô `phone` — `normalizePhone`), `routes/pages.js` (`/admin/permissions`), `admin/permissions.html` + `js/pages/admin-permissions.js` (mới), `js/perm-editor.js` (`roleSummary` cho hộp tài khoản, `permissionSwitches` cho trang), `js/pages/admin-users.js` (ô + cột SĐT, bỏ khung Xin quyền), `js/admin-shell.js` (mục thanh bên), `js/pages/admin-today.js` (liên kết), `css/admin.css`.
- **Test:** `staff-phone.test.js` (AC-091-01); E2E AC-091-02, AC-091-03, AC-079-07 / AC-090-02 / AC-090-03 (công tắc ở trang mới); a11y hộp Thêm nhân viên + trang Quyền nâng cao (AC-091-04, AC-090-04).
- **Tài liệu:** FEATURE-091, FEATURE-090 (AC-090-02…04, màn hình), FEATURE-079 (chỗ duyệt), ADR-051 (D-224 bị thay), roles-permissions 4.10 / 4.11, api-contract, data-model, screens-flows, sitemap (SCR-58), user-stories, use-cases, tc-map, hướng dẫn `chức-năng-mới/17`.
