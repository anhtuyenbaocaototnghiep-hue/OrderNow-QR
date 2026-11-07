---
name: vi-tri-va-cap-nhan-vien
description: Vị trí và cấp của nhân viên cho cafe-qr-app (FEATURE-078, ADR-036, TASK-095) — Users.Positions (CASHIER Thu ngân / BARISTA Pha chế / SERVER Phục vụ, NULL = mọi vị trí) + Users.StaffLevel (PROBATION Thử việc / OFFICIAL), requirePosition (403 POSITION_REQUIRED) gắn ở việc quầy, hasPosition / canOpenPosPage ở js/roles.js (menu + nút máy quầy theo vị trí), thử việc qua discountRole (giảm tay ngưỡng 0), ngưỡng chi 0, xóa món luôn cần duyệt. Dùng khi task giao F-078 / ADR-036 / TASK-095 / AC-078-xx, khi thêm việc mới ở máy quầy (phải chọn vị trí), hoặc nhắc "vị trí", "thu ngân", "pha chế", "phục vụ", "thử việc", "chính thức", "POSITION_REQUIRED", "nhân viên chia cấp", "ai làm việc gì ở quầy".
---

# Mục đích

Ghi lại **vị trí + cấp nhân viên** (07/11/2026, TASK-095) để agent sau thêm việc ở quầy mà không mở nhầm cho sai người, và không làm khó quán nhỏ một người làm hết.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-036-vi-tri-va-cap-nhan-vien.md` (D-162…D-166) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-078.md` (AC-078-01…06) |
| Bảng việc theo vị trí / cấp | `tài-liệu/nghiệp-vụ/roles-permissions.md` §4.7 · `kiến-trúc/security-model.md` §3.6 · BR-116 |
| Đợt 1 (vai Quản lý cửa hàng) | skill `phan-quyen-quan-ly-cua-hang` |

# Khi dùng

- **Thêm endpoint quầy làm đổi tiền / đơn / kho:** chọn vị trí — gắn `requirePosition('CASHIER' | 'BARISTA' | 'SERVER')` sau `requireStaff` (trong `staff.js` dùng hằng `cashier`, `barista`, `server`). Việc chung (xem, ghi chú, chấm công…) thì không gắn.
- **Thêm trang máy quầy:** khóa trang vào `POS_PAGE_POSITIONS` (`js/roles.js`) nếu chỉ một vị trí dùng; nút trong trang ẩn bằng `hasPosition(shell.user, …)`.
- **Thêm luật cho người thử việc:** dùng `isProbation(user)` (server, `auth/permissions.js`) / `isProbation` (`js/roles.js`).

# Quy tắc (BR-116)

- Chỉ vai STAFF; `positions` NULL / rỗng = mọi vị trí; vai khác luôn lưu NULL / OFFICIAL (`usersRepo.positionsCsv`, `levelOf`). Chỉ chủ quán đặt (`/api/admin/users`, vắng khi sửa = giữ).
- Thu ngân: bán mang đi, thu tiền bàn / chia bill, mở / đóng ca, hoàn tiền, ghi thu chi, bán ly treo. Pha chế: tiếp nhận / hoàn tất (cả "Xong" 1 chạm), sơ chế, hủy hàng, hủy lô, nhận hàng. Phục vụ: mở bàn, gọi món tại bàn, chuyển bàn. Gửi bù đơn mất mạng: không chặn.
- Thử việc: `discountRole(user)` → `'PROBATION'` → `discountLimits` 0/0; `cashService.create` ngưỡng 0 (mọi khoản chi PENDING); `voidService.approverFor` luôn cần người duyệt.
- Máy quầy: `mountPosShell` chuyển về `/pos?denied=position` nếu trang không thuộc vị trí; `pos-dashboard.js` có `canMake`, `canPay`, `canServe`.

# Chỗ dễ sai

- Đặt `requirePosition` **trước** `requireStaff` ở router không có `requireStaff` chung → vẫn chạy (tự đọc token) nhưng giữ thứ tự cho rõ.
- Gọi `discountLimits(user.role, …)` trực tiếp ở chỗ mới → bỏ sót thử việc; dùng `discountRole(user)`.
- Test chặn theo vị trí: gửi body rỗng vẫn biết bị chặn (middleware chạy trước kiểm dữ liệu) — `blocked()` trong `staff-positions.test.js`.
- E2E dùng chung CafeQrTest: tài khoản test cũ không có vị trí → không ảnh hưởng.

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0054). Số liệu: `TASK-095.md`.
