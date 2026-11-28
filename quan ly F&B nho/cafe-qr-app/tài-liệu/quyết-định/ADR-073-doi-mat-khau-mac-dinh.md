# ADR-073 — Bắt đổi mật khẩu mặc định / dễ đoán, tự đổi mật khẩu

- **Trạng thái:** ACCEPTED (28/11/2026).
- **Chủ dự án yêu cầu (28/11/2026):** hỏi "app tôi còn thiếu gì… còn điểm gì bất hợp lý không". Agent đề xuất A1–A4, trong đó A2 là "đổi mật khẩu mặc định — bắt đổi khi còn dùng mật khẩu mẫu". Chủ dự án trả lời "OK TIẾN HÀNH LÀM ĐI".
- **Liên quan:** [FEATURE-102](../chức-năng/FEATURE-102.md); [security-model](../kiến-trúc/security-model.md) G-04 (độ dài mật khẩu — vẫn chờ chốt), G-10 (`staff1` mật khẩu cố định); F-009 (đăng nhập), F-071 (khóa tạm khi sai mật khẩu), F-072 (PIN), F-096 (xác nhận tạo chủ quán).

## Bối cảnh

- Kiểm (chỉ đọc) CSDL thật của quán ngày 28/11/2026: tài khoản **chủ quán** và một tài khoản **nhân viên** vẫn dùng mật khẩu mẫu.
  - Hai mật khẩu này có sẵn trong mã nguồn, README, hướng dẫn và kết quả chạy `npm run setup`.
  - Mã nguồn đã đưa lên GitHub.
- Máy chủ chạy trong Wi-Fi của quán, khách và máy quầy dùng chung mạng (security-model G-05).
  - Ai biết mật khẩu mẫu có thể mở trang Quản lý: xem doanh thu, sửa giá, xóa dữ liệu.
  - Cũng có thể gõ tài khoản chủ quán vào ô duyệt ở quầy để tự duyệt hoàn tiền / giảm giá.
- Trước ADR này không ai tự đổi được mật khẩu của mình. Chỉ chủ quán đặt lại hộ ở trang Tài khoản.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-266 | **Mật khẩu dễ đoán** (`domain/password.js`, so không phân biệt hoa / thường), gồm 5 loại:<ul><li>Mật khẩu mẫu có trong mã nguồn / tài liệu của app: `Admin@123`, `Staff@123`, `Pass@123`.</li><li>Khoảng 50 mật khẩu phổ biến nhất: `123456`, `password`, `admin123`, `matkhau`…</li><li>Trùng tên đăng nhập, hoặc tên đăng nhập + chỉ số / ký hiệu (`nhanvien1` + `123`).</li><li>Một ký tự lặp lại (`aaaaaa`).</li><li>Dãy số liền nhau tăng / giảm (`345678`, `987654`).</li></ul>Độ dài tối thiểu giữ **6 ký tự** như cũ (G-04 vẫn chờ chủ dự án chốt). |
| D-267 | **Đăng nhập bằng mật khẩu dễ đoán** (đúng mật khẩu, cài đặt D-271 bật):<ul><li>Vẫn đăng nhập được, không khóa người dùng ra ngoài. Đăng nhập quầy vẫn chấm công vào như cũ.</li><li>Token mang dấu "phải đổi mật khẩu" (`pwc`), phản hồi có `mustChangePassword: true`.</li><li>Token này chỉ gọi được `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/logout`. Mọi API khác (kể cả realtime) → `403 PASSWORD_CHANGE_REQUIRED`.</li><li>Giao diện (trang đăng nhập quầy, trang đăng nhập Quản lý, mọi trang quầy / Quản lý qua `requireStaffPage`) hiện hộp **"Đổi mật khẩu trước khi dùng tiếp"**. Hộp không đóng được, chỉ có "Đăng xuất".</li><li>Đổi xong → token mới không có dấu, làm việc bình thường.</li></ul> |
| D-268 | **Tự đổi mật khẩu** `POST /api/auth/change-password { currentPassword, newPassword }`:<ul><li>Mọi tài khoản đang đăng nhập đều dùng được.</li><li>Sai mật khẩu đang dùng → `403 CURRENT_PASSWORD_INVALID`, tính là một lần đăng nhập sai (F-071: 10 lần / 15 phút cùng tên + cùng máy → khóa tạm).</li><li>Mật khẩu mới 6–100 ký tự, khác mật khẩu đang dùng (`400 PASSWORD_SAME`), không dễ đoán (`400 WEAK_PASSWORD` — **luôn chặn**, kể cả khi tắt D-271).</li><li>Thành công → `{ accessToken, user }` mới. Nhật ký thao tác `auth.change-password` (không ghi mật khẩu).</li><li>Token cũ vẫn dùng được tới khi hết hạn (G-01 chưa làm).</li><li>Nút **"Đổi mật khẩu"** ở trang Giờ công của tôi (quầy) và ở khung trang Quản lý (cạnh Đăng xuất).</li></ul> |
| D-269 | **Đặt mật khẩu cho người khác** (cài đặt D-271 bật): chủ quán tạo tài khoản hoặc đặt lại mật khẩu bằng mật khẩu dễ đoán → `400 WEAK_PASSWORD` ở ô mật khẩu. |
| D-270 | **Mật khẩu dễ đoán không dùng để xác nhận việc gì** (cài đặt D-271 bật). Mật khẩu đúng nhưng dễ đoán → `403 WEAK_PASSWORD_IN_USE`, báo người có tài khoản đó đăng nhập để đổi mật khẩu trước. Áp cho:<ul><li>Tài khoản duyệt ở quầy (giảm giá tay vượt ngưỡng, hoàn tiền, chi quỹ, sửa / xóa món đã pha, hủy bàn).</li><li>Đặt PIN bằng mật khẩu (Giờ công của tôi, màn chấm công chung).</li><li>Xác nhận tạo / nâng tài khoản Chủ quán (F-096).</li></ul>Sai mật khẩu vẫn báo và đếm như trước; chỉ khi mật khẩu đúng mới kiểm dễ đoán, nên không lộ thêm gì cho người dò. |
| D-271 | **Cài đặt "Chặn mật khẩu mặc định / dễ đoán"** (`security.block_weak_passwords`):<ul><li>Mặc định **bật** (chưa có khóa = bật). Chỉ chủ quán đổi, ở thẻ "Bảo mật đăng nhập" của trang Cài đặt.</li><li>Tắt → D-267, D-269, D-270 không áp; D-268 vẫn chặn mật khẩu dễ đoán khi tự đổi.</li><li>CSDL test / E2E đặt sẵn `'false'` (test cũ đăng nhập bằng mật khẩu mẫu). Test của F-102 tự bật.</li></ul> |

## Phương án đã cân nhắc

- **Từ chối đăng nhập bằng mật khẩu dễ đoán:** chủ quán quên đổi thì bị khóa ngoài, phải nhờ người khác đặt lại; nếu chủ quán là người duy nhất thì không ai vào được. Bỏ. Chọn cho vào nhưng chỉ được đổi mật khẩu.
- **Cột `MustChangePassword` trong `Users`:** phải có migration, và vẫn phải so mật khẩu lúc đăng nhập mới biết là dễ đoán. Dấu trong token đủ dùng, không cần đổi CSDL. Bỏ.
- **Bắt đổi mật khẩu ở lần đăng nhập đầu cho mọi tài khoản mới:** chủ quán đặt mật khẩu cho nhân viên rồi đưa họ dùng ngay — bắt đổi mọi lần là quá tay với quán nhỏ. Chỉ bắt khi mật khẩu dễ đoán. Bỏ.
- **Chỉ ẩn giao diện:** token "phải đổi" vẫn gọi được API thì không chặn được gì. Bỏ — máy chủ chặn.
- **Nâng độ dài tối thiểu lên 8:** là G-04, chờ chủ dự án chốt. Không đổi ở đây.

## Hệ quả

- **Mã nguồn máy chủ:**
  - Mới: `domain/password.js` (`weakPasswordReason`).
  - `middleware/auth.js`: `signToken(user, { mustChangePassword })`; `userFromToken(token, { allowPasswordChange })`; `requireStaffAllowPasswordChange`.
  - `services/userService.js`: `login`, `changeOwnPassword`, `create` / `resetPassword` (D-269), `resolveApproval` + `confirmOwnerGrant` (D-270).
  - `services/pinService.js` (D-270); `services/settingsService.js` (`blockWeakPasswords`).
  - `routes/public.js`: `/auth/change-password`; `/auth/me` cho token "phải đổi".
  - `routes/finance.js`: `/auth/logout` cho token "phải đổi".
  - `routes/operations.js`: trường cài đặt, chỉ chủ quán.
  - `middleware/audit.js`: luật `auth.change-password`.
- **Giao diện:**
  - Mới: `js/change-password.js` (hộp đổi mật khẩu bắt buộc / tự chọn).
  - `js/auth.js` (`requireStaffPage`); `pages/pos-login.js`, `pages/admin-login.js`.
  - `pages/pos-me.js` và `js/admin-shell.js`: nút "Đổi mật khẩu".
  - `pages/admin-settings.js`: thẻ "Bảo mật đăng nhập".
- **Dữ liệu:** khóa cài đặt `security.block_weak_passwords` (không migration). Test / E2E đặt `'false'` trong `testDb.js`, `kịch-bản/e2e-server.js`.
- **Vận hành:**
  - Sau khi khởi động lại máy chủ, chủ quán và nhân viên còn dùng mật khẩu mẫu sẽ được hỏi đổi ở lần đăng nhập tới.
  - Tài khoản duyệt ở quầy còn mật khẩu mẫu không duyệt được tới khi đổi.
  - `npm run setup` mới cài vẫn gợi ý `Admin@123`; lần đăng nhập đầu sẽ được hỏi đổi.
- **Tài liệu:** FEATURE-102 (AC-102-01…06), BR-132, US-102-1, US-102-2, api-contract, screens-flows, security-model (G-10 giảm thiểu), tc-map, hướng dẫn.
