# TASK-141 — Kế hoạch: bắt đổi mật khẩu mặc định / dễ đoán, tự đổi mật khẩu (F-102, ADR-073)

- **Vì sao cần plan:** chạm xác thực (token, mọi middleware đọc token, realtime) và hợp đồng API.
  - API mới: `POST /api/auth/change-password`.
  - Mã lỗi mới: `PASSWORD_CHANGE_REQUIRED`, `WEAK_PASSWORD`, `WEAK_PASSWORD_IN_USE`, `CURRENT_PASSWORD_INVALID`, `PASSWORD_SAME`.
  - Trường mới: `mustChangePassword`, `blockWeakPasswords`.
  - Chạm ≥ 2 module: đăng nhập, tài khoản, duyệt ở quầy, PIN, cài đặt, giao diện quầy + Quản lý.
- **Không đổi:**
  - CSDL: khóa Settings mới, không migration.
  - Quyền của vai nào.
  - Độ dài tối thiểu mật khẩu (G-04).
  - Thời hạn token, cách thu hồi token (G-01).

## Các bước

1. **`domain/password.js`:** `weakPasswordReason(password, username)` → lý do (chuỗi) hoặc `null`.
2. **Token:**
   - `middleware/auth.js`: `signToken(user, { mustChangePassword })` thêm `pwc: 1`.
   - `userFromToken(token, { allowPasswordChange })`: không cho phép mà token có `pwc` → `403 PASSWORD_CHANGE_REQUIRED`; cho phép → `user.mustChangePassword = true`.
   - `requireStaffAllowPasswordChange` cho `/auth/me`, `/auth/change-password`, `/auth/logout`.
   - Các chỗ khác (permissions, realtime) giữ mặc định nên tự chặn.
3. **`userService`:**
   - `login` trả `mustChangePassword`.
   - `changeOwnPassword`: khóa tạm F-071 `LOGIN`, sai → đếm.
   - `create` / `resetPassword` (D-269).
   - `resolveApproval`, `confirmOwnerGrant` (D-270).
4. **`pinService.setPinWithPassword`:** D-270.
5. **Cài đặt:**
   - `settingsService`: `blockWeakPasswords` ← `security.block_weak_passwords`.
   - `routes/operations.js`: trường chỉ chủ quán.
   - `testDb.js`, `kịch-bản/e2e-server.js`: đặt `'false'`.
6. **Route:**
   - `routes/public.js`: `/auth/change-password`; `/auth/me` dùng middleware mới.
   - `routes/finance.js`: `/auth/logout` dùng middleware mới.
   - `middleware/audit.js`: luật `auth.change-password`.
7. **Giao diện:**
   - `js/change-password.js`: hộp bắt buộc / tự chọn.
   - `js/auth.js` `requireStaffPage`: `mustChangePassword` → hộp bắt buộc. Đổi xong thay token trong phiên quầy / Quản lý đang giữ token cũ.
   - `pages/pos-login.js`, `pages/admin-login.js`: hộp ngay sau đăng nhập, biết sẵn mật khẩu đang dùng.
   - `pages/pos-me.js`, `js/admin-shell.js`: nút "Đổi mật khẩu".
   - `pages/admin-settings.js`: thẻ "Bảo mật đăng nhập".
8. **Test:**
   - `tests/password-policy.test.js` (AC-102-01…05 + đơn vị `weakPasswordReason`).
   - E2E AC-102-06 (bật cài đặt qua API, dùng tài khoản riêng, tắt lại).
   - a11y hộp mới.
9. **Tài liệu:** ADR-073, FEATURE-102, BR-132, US-102-1/2, api-contract, screens-flows (SCR-59), security-model (G-10), tc-map, hướng dẫn (lần đầu đăng nhập sẽ được hỏi đổi mật khẩu), README chỉ mục.

## Rủi ro

- **Test cũ** đăng nhập bằng mật khẩu mẫu ở khắp nơi → CSDL test / E2E đặt cài đặt `'false'`. Test F-102 tự bật rồi trả lại.
- **Quán đang chạy thật:** chủ quán + `staff1` còn mật khẩu mẫu.
  - Lần đăng nhập tới sẽ bị hỏi đổi.
  - Tài khoản duyệt `admin` không duyệt được ở quầy tới khi đổi.
  - Báo chủ quán đổi trước giờ mở cửa.
- **Máy quầy một màn hình (F-088) có trang nhúng:** khung chính dừng ở hộp bắt buộc trước khi dựng trang nhúng, nên trang nhúng không tự hiện hộp thứ hai.
