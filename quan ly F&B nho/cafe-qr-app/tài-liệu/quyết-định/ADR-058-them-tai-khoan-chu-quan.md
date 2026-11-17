# ADR-058 — Thêm tài khoản chủ quán (nhiều tài khoản toàn quyền)

- **Trạng thái:** ACCEPTED (16/11/2026). Chủ dự án: "làm thêm có thể tạo thêm tài khoản admin nữa nha" (16/11/2026). Đổi phân quyền → ghi ADR (quy tắc dự án).
- **Bối cảnh:** máy chủ đã cho nhiều tài khoản vai `ADMIN` ("Chủ quán") và có chốt an toàn: luôn còn ít nhất một chủ quán đang hoạt động (`409 LAST_ADMIN`, khóa dòng trong SQL — F-036), không tự đổi vai trò / khóa / xóa chính mình, chủ quán không đăng nhập máy quầy (F-084), chỉ chủ quán gọi được tạo / sửa / xóa tài khoản (người được cấp quyền khác chỉ xem danh sách). Nhưng trang Tài khoản chỉ có nút "+ Thêm nhân viên", vai "Chủ quán" nằm lẫn trong ô Vai trò — chủ quán không thấy, và tạo / nâng một tài khoản toàn quyền không có bước xác nhận hay báo cho các chủ quán khác.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-236 | **Tạo / nâng tài khoản Chủ quán rõ ràng và có xác nhận:** trang Tài khoản đổi nút thành **"+ Thêm tài khoản"**; ô Vai trò ghi "Chủ quán (toàn quyền)". Chọn Chủ quán (tạo mới hoặc đổi vai trò) → khung cảnh báo "Chủ quán có toàn quyền như bạn: tài khoản & phân quyền, cài đặt, lương, thu chi, nhật ký thao tác — chỉ dùng trang Quản lý, không đăng nhập máy quầy" + ô **"Mật khẩu của bạn"**. Máy chủ: tạo tài khoản vai `ADMIN` hoặc đổi vai trò thành `ADMIN` cần `confirmPassword` = mật khẩu của **chính người thao tác**: thiếu → `400 VALIDATION_ERROR`; sai → `403 OWNER_CONFIRM_INVALID`; sai 5 lần / 15 phút → `429` khóa tạm + cảnh báo AUTH_LOCK (dùng lại bộ đếm "tài khoản duyệt" F-071). Mật khẩu xác nhận không ghi vào nhật ký (khóa "password" bị bỏ). |
| D-237 | **Báo cho các chủ quán:** có chủ quán mới (tạo mới / nâng vai trò) → cảnh báo `ACCESS_GRANT` (chỉ chủ quán xem) + email theo cài đặt cảnh báo tức thì: "<A> tạo tài khoản Chủ quán cho <B>" / "<A> đổi <B> thành Chủ quán". Giữ nguyên các chốt sẵn có (LAST_ADMIN, không tự đổi / khóa / xóa mình, F-084). Không thêm vai mới, không đổi quyền của vai khác. |

## Phương án đã cân nhắc

- **Để như cũ (đã tạo được qua ô Vai trò):** chủ dự án không tìm thấy; tạo tài khoản toàn quyền không có bước nào dừng lại → dễ chọn nhầm.
- **Vai mới "Đồng chủ quán" ít quyền hơn:** thêm vai = thêm luật quyền khắp nơi; ai cần ít quyền hơn đã có Quản lý cửa hàng + Quyền nâng cao (F-090, F-091).
- **Bắt xác nhận qua email:** quán nhỏ có thể chưa cấu hình email (F-060) → dùng mật khẩu của người thao tác (như xác nhận lại tài khoản duyệt ở quầy).
- **Cảnh báo loại mới `OWNER_ADDED`:** cần migration đổi ràng buộc loại cảnh báo; `ACCESS_GRANT` đã đúng nghĩa (cấp quyền) và đã chỉ chủ quán xem.

## Hệ quả

- **Mã nguồn:** `services/userService.js` (xác nhận mật khẩu khi tạo / nâng thành chủ quán, cảnh báo), `services/alertService.js` (`onOwnerAdded` dùng loại ACCESS_GRANT), `routes/admin.js` (`confirmPassword` ở POST / PUT `/users`), `js/pages/admin-users.js`, `js/roles.js`. Không migration.
- **Test:** `owner-accounts.test.js` (AC-096-01); E2E thêm chủ quán (AC-096-02).
- **Tài liệu:** FEATURE-096, api-contract, roles-permissions, screens-flows, user-stories, use-cases, tc-map.
