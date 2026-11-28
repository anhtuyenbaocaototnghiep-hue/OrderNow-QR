# TASK-141 — Bắt đổi mật khẩu mặc định / dễ đoán, tự đổi mật khẩu (F-102)

- **Status:** READY_FOR_REVIEW (28/11/2026)
- **Tài liệu:**
  - [FEATURE-102](../chức-năng/FEATURE-102.md) (AC-102-01…06), [ADR-073](../quyết-định/ADR-073-doi-mat-khau-mac-dinh.md) D-266…D-271, BR-132, US-102-1, US-102-2.
  - Kế hoạch: [TASK-141-plan](../kế-hoạch/TASK-141-plan.md).
- **Màn hình:** SCR-59 hộp Đổi mật khẩu (mới); SCR-09, SCR-56, SCR-52, SCR-33, SCR-20, khung trang Quản lý.
- **Nguồn:**
  - Chủ dự án 28/11/2026 duyệt đề xuất A2 ("OK TIẾN HÀNH LÀM ĐI").
  - Kiểm (chỉ đọc) CSDL thật cùng ngày: tài khoản chủ quán và một tài khoản nhân viên còn dùng mật khẩu mẫu ghi trong hướng dẫn.
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-141-doi-mat-khau-mac-dinh`, chồng lên `task/TASK-140-va-bao-mat-nhanh`

## Phạm vi

1. **Máy chủ:**
   - Mới: `domain/password.js` (`weakPasswordReason`), `services/passwordPolicy.js`.
   - `middleware/auth.js`: dấu `pwc` trong token; `userFromToken` chặn mặc định; `requireStaffAllowPasswordChange`.
   - `userService`: `login` trả `mustChangePassword`; `changeOwnPassword`; `create` / `resetPassword` chặn mật khẩu dễ đoán; `resolveApproval`, `confirmOwnerGrant` không nhận mật khẩu dễ đoán.
   - `pinService`: đặt PIN không nhận mật khẩu dễ đoán.
   - Route `POST /api/auth/change-password`. `/auth/me` và `/auth/logout` nhận token "phải đổi".
   - Cài đặt `blockWeakPasswords` (chỉ chủ quán). Luật nhật ký `auth.change-password`. Trang Tra cứu API nhận middleware mới là "nhân viên".
2. **Giao diện:**
   - Mới: `js/change-password.js`.
   - `requireStaffPage` hiện hộp bắt buộc. Trang đăng nhập quầy / Quản lý hiện hộp ngay sau đăng nhập, gồm cả lối chủ quán gõ ở màn quầy.
   - Nút "Đổi mật khẩu" ở Giờ công của tôi và khung trang Quản lý.
   - Thẻ "Bảo mật đăng nhập" ở Cài đặt. Biểu tượng `lock`.
3. **Test / công cụ:**
   - `testDb.js`, `kịch-bản/e2e-server.js`, `kịch-bản/load-concurrency.js` đặt `security.block_weak_passwords = 'false'`, vì test cũ đăng nhập bằng mật khẩu mẫu.
   - `kịch-bản/setup.js` nhắc lần đầu đăng nhập sẽ được hỏi đổi.

## Test

- **`tests/password-policy.test.js`** — 6 test:
  - D-266: kiểm hàm nhận biết mật khẩu dễ đoán.
  - AC-102-01…05, chạy trên CSDL thật.
- **E2E `flow.spec.js`** "mật khẩu mặc định / dễ đoán…" (AC-102-06):
  - Đăng nhập quầy → hộp bắt buộc, không đóng được.
  - Tải lại trang → hộp hỏi thêm mật khẩu đang dùng.
  - Báo lỗi dưới ô: mật khẩu dễ đoán, nhập lại khác nhau.
  - Đổi xong vào màn quầy.
  - Giờ công của tôi → Đổi mật khẩu (sai mật khẩu đang dùng báo dưới ô).
  - Đăng nhập Quản lý → "Đăng xuất" ở hộp → ở lại trang đăng nhập; đăng nhập lại, đổi → vào trang Quản lý; nút ở khung trang; tải lại không hỏi nữa.
  - Cài đặt có ô và lưu được.
- **a11y `a11y.spec.js`** "đổi mật khẩu (F-102)…": hộp bắt buộc (vừa đăng nhập / tải lại, 320 / 390 px) và hộp tự mở.

## Lệnh kiểm chứng

- **Kết quả 28/11/2026:**
  - `npm run lint`, `npm run format:check`: sạch.
  - `password-policy.test.js`: 6/6 PASS ngay lần đầu.
  - E2E bài F-102: PASS (24 giây). a11y bài F-102: PASS (15 giây), không vi phạm.
  - Ảnh chuẩn: `kiểm-thử/kết-quả/ảnh/doi-mat-khau-bat-buoc.jpg`, `doi-mat-khau-bat-buoc-tai-lai.jpg`, `doi-mat-khau-tu-mo.jpg`.
- `npm test` toàn bộ, E2E toàn bộ, `npm run trace -- --check`: xem "Kết quả chạy đủ".

## Việc của chủ quán sau khi cập nhật

- Khởi động lại máy chủ bằng nút một chạm.
- Tài khoản `admin` và `staff1` của quán đang dùng mật khẩu mẫu, nên lần đăng nhập tới sẽ được hỏi đổi. Đổi trước giờ mở cửa.
- Tới khi đổi, tài khoản `admin` **không duyệt được** ở quầy (giảm giá vượt ngưỡng, hoàn tiền…).
- Nên xóa / khóa `staff1` nếu không dùng (deployment-checklist §A).

## Kết quả chạy đủ

- `npm test` (28/11/2026): **527/527 PASS** (521 của TASK-140 + 6 test F-102), 0 hỏng.
- `npm run test:e2e` + `npm run trace -- --check`: chạy một lần trên đỉnh chồng nhánh sau TASK-142 (E2E và `npm test` dùng chung CSDL `CafeQrTest`). Kết quả ghi ở [TASK-142](TASK-142.md).
