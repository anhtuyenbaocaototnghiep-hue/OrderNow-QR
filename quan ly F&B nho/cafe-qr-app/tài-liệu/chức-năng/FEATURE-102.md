# FEATURE-102 — Bắt đổi mật khẩu mặc định / dễ đoán, tự đổi mật khẩu

> **Nguồn:** chủ dự án 28/11/2026 duyệt đề xuất A2 ("OK TIẾN HÀNH LÀM ĐI") sau khi hỏi "app tôi còn thiếu gì… còn điểm gì bất hợp lý không". Kiểm CSDL thật: tài khoản chủ quán và một tài khoản nhân viên còn dùng mật khẩu mẫu ghi trong hướng dẫn. Quyết định: [ADR-073](../quyết-định/ADR-073-doi-mat-khau-mac-dinh.md) D-266…D-271.

- **Status:** CONFIRMED (chủ dự án duyệt đề xuất) · Triển khai: [TASK-141](../công-việc/TASK-141.md)
- **Actor:** ACT-ADMIN (bật / tắt, đổi mật khẩu của mình, đặt mật khẩu cho người khác), ACT-STORE, ACT-LEAD, ACT-STAFF (đổi mật khẩu của mình, bị bắt đổi khi còn mật khẩu dễ đoán).
- **Màn hình:**
  - Có sẵn: SCR-09 Đăng nhập quầy, SCR-56 Đăng nhập Quản lý, SCR-52 Giờ công của tôi, khung trang Quản lý, SCR-33 Cài đặt (thẻ "Bảo mật đăng nhập").
  - Mới: SCR-59 hộp **Đổi mật khẩu**.
- **Dữ liệu:** khóa cài đặt `security.block_weak_passwords` (`'false'` = tắt; chưa có = bật). Không migration — dấu "phải đổi mật khẩu" nằm trong token.

## User Story

- **US-102-1:** Là chủ quán, tôi muốn tài khoản nào còn dùng mật khẩu mẫu / dễ đoán phải đổi ngay khi đăng nhập và không dùng được để duyệt ở quầy. Như vậy người ngoài (khách bắt cùng Wi-Fi, người đọc hướng dẫn) không vào được trang Quản lý hay tự duyệt hoàn tiền / giảm giá.
- **US-102-2:** Là nhân viên / trưởng ca / quản lý cửa hàng / chủ quán, tôi muốn tự đổi mật khẩu của mình, để không phải nhờ chủ quán và chỉ mình tôi biết mật khẩu.

## Quy tắc (BR-132)

1. **Dễ đoán là gì** (D-266). So không phân biệt hoa / thường:
   - Mật khẩu mẫu trong tài liệu (`Admin@123`, `Staff@123`, `Pass@123`).
   - Khoảng 50 mật khẩu phổ biến nhất.
   - Trùng tên đăng nhập, hoặc tên đăng nhập + chỉ số / ký hiệu.
   - Một ký tự lặp lại.
   - Dãy số liền nhau tăng / giảm.

   Mật khẩu vẫn 6–100 ký tự như cũ.
2. **Cài đặt bật** (mặc định, chỉ chủ quán đổi):
   - **Đăng nhập** đúng mật khẩu dễ đoán → vào được, nhưng chỉ được đổi mật khẩu hoặc đăng xuất. Mọi API khác → `403 PASSWORD_CHANGE_REQUIRED`.
   - **Tạo tài khoản / đặt lại mật khẩu** bằng mật khẩu dễ đoán → `400 WEAK_PASSWORD`.
   - **Duyệt ở quầy, đặt PIN, xác nhận tạo chủ quán** bằng mật khẩu đúng mà dễ đoán → `403 WEAK_PASSWORD_IN_USE`.
3. **Tự đổi mật khẩu** (luôn có, kể cả khi tắt cài đặt):
   - Phải nhập đúng mật khẩu đang dùng. Sai → `403 CURRENT_PASSWORD_INVALID`, tính là lần đăng nhập sai (F-071).
   - Mật khẩu mới khác mật khẩu cũ và không dễ đoán.
   - Đổi xong nhận token mới; nhật ký thao tác ghi `auth.change-password` (không ghi mật khẩu).
4. **Cài đặt tắt:** đăng nhập, tạo / đặt lại mật khẩu, duyệt, đặt PIN như trước F-102. Tự đổi vẫn chặn mật khẩu dễ đoán.

## API

- `POST /api/auth/login`: thêm `mustChangePassword` (boolean) ở phản hồi và trong `user`.
- `GET /api/auth/me`: dùng được với token "phải đổi"; `user.mustChangePassword = true`.
- **Mới** `POST /api/auth/change-password` `{ currentPassword, newPassword }` → `{ accessToken, user }`.
  - Lỗi: `403 CURRENT_PASSWORD_INVALID`, `400 PASSWORD_SAME`, `400 WEAK_PASSWORD`, `400 VALIDATION_ERROR`, `429 LOGIN_LOCKED`.
- `POST /api/auth/logout`: dùng được với token "phải đổi".
- Mọi API nhân viên khác + realtime: token "phải đổi" → `403 PASSWORD_CHANGE_REQUIRED`.
- `POST /api/admin/users`, `POST /api/admin/users/{id}/reset-password`: `400 WEAK_PASSWORD` (ô `password`) khi cài đặt bật.
- Ô duyệt ở quầy (`adminUsername` / `adminPassword`), `POST /api/auth/pin`, `POST /api/auth/pin/kiosk`, xác nhận tạo chủ quán: `403 WEAK_PASSWORD_IN_USE` khi cài đặt bật.
- `GET/PUT /api/admin/settings`: `blockWeakPasswords` (boolean; chỉ chủ quán đổi).

## Acceptance Criteria

- **AC-102-01:** Cài đặt bật, đăng nhập đúng mật khẩu dễ đoán:
  - Phản hồi 200 `mustChangePassword = true`.
  - Token đó: `/api/auth/me` → 200 (`user.mustChangePassword = true`). API quầy và trang Quản lý → `403 PASSWORD_CHANGE_REQUIRED`. Kết nối realtime nhân viên bị từ chối. Đăng xuất được.
  - Mật khẩu không dễ đoán → không có dấu. Cài đặt tắt → mật khẩu dễ đoán cũng không có dấu.
- **AC-102-02:** Tự đổi mật khẩu:
  - Sai mật khẩu đang dùng → `403 CURRENT_PASSWORD_INVALID`, đếm vào khóa tạm đăng nhập.
  - Mới trùng cũ → `400 PASSWORD_SAME`. Mới dễ đoán → `400 WEAK_PASSWORD` (cả khi tắt cài đặt). Dưới 6 ký tự → `400`.
  - Đúng → token mới gọi được API như thường. Mật khẩu cũ không đăng nhập được nữa; mật khẩu mới đăng nhập không có dấu.
  - Nhật ký thao tác có `auth.change-password`, không chứa mật khẩu.
- **AC-102-03:** Cài đặt bật: chủ quán tạo tài khoản / đặt lại mật khẩu bằng mật khẩu dễ đoán → `400 WEAK_PASSWORD` (ô `password`), không tạo / không đổi; mật khẩu tốt → được. Cài đặt tắt → như trước.
- **AC-102-04:** Cài đặt bật, mật khẩu đúng nhưng dễ đoán dùng ở ô duyệt (giảm giá tay vượt ngưỡng), đặt PIN của mình, đặt PIN ở màn chấm công chung → `403 WEAK_PASSWORD_IN_USE`, không có gì thay đổi. Sai mật khẩu → lỗi cũ (`ADMIN_APPROVAL_INVALID` / `PASSWORD_INVALID`) và vẫn đếm lần sai.
- **AC-102-05:** `blockWeakPasswords` mặc định `true`; chủ quán tắt / bật được; quản lý cửa hàng, trưởng ca, nhân viên đổi → `403`.
- **AC-102-06:** Trên trình duyệt:
  - **Đăng nhập quầy** bằng mật khẩu dễ đoán → hộp "Đổi mật khẩu trước khi dùng tiếp" (không có nút đóng, Esc không đóng). Nhập mật khẩu mới hai lần → vào màn quầy.
  - **Đăng nhập Quản lý** tương tự → vào trang Quản lý.
  - **Tải lại trang** khi chưa đổi → hộp hiện lại, lần này hỏi cả mật khẩu đang dùng.
  - **Nút "Đổi mật khẩu"** ở Giờ công của tôi và ở khung trang Quản lý đổi được mật khẩu; mật khẩu mới đăng nhập được.
