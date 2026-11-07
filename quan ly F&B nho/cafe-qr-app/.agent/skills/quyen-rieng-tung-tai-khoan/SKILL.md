---
name: quyen-rieng-tung-tai-khoan
description: Quyền riêng từng tài khoản + Xin quyền / Duyệt cho cafe-qr-app (FEATURE-079, ADR-037, TASK-096) — 17 quyền CAPABILITIES trong src/auth/permissions.js (máy quầy + trang Quản lý, mặc định byRole), hasCap là cửa kiểm chung của can / hasPosition / adminMay, bảng UserGrants (ALLOW / DENY, hạn) nạp mỗi request trong userFromToken, AccessRequests (xin → chủ quán duyệt TODAY / WEEK / ALWAYS hoặc từ chối), 403 kèm details.capability → thanh "Xin quyền" (js/access.js, api.js setAccessNotifier), hộp "Quyền" ở trang Tài khoản, cảnh báo ACCESS_GRANT khi cấp quyền dính tiền. Dùng khi task giao F-079 / ADR-037 / TASK-096 / AC-079-xx, khi thêm route /api/admin hoặc trang Quản lý / quầy mới (phải gắn vào một quyền hoặc để chỉ chủ quán), hoặc nhắc "cấp quyền", "thu quyền", "xin quyền", "duyệt quyền", "quyền riêng", "UserGrants", "capability", "hasCap", "OWNER_ONLY".
---

# Mục đích

Ghi lại **quyền riêng từng tài khoản + xin quyền** (07/11/2026, TASK-096) để agent sau thêm chức năng mà không phá cách cấp / thu quyền, và không mở nhầm thứ chỉ chủ quán được làm.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-037-quyen-rieng-tung-tai-khoan.md` (D-167…D-172) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-079.md` (AC-079-01…07) |
| Bảng quyền | `tài-liệu/nghiệp-vụ/roles-permissions.md` §4.8 · `kiến-trúc/security-model.md` §3.7 · BR-117 |
| Nền | skill `phan-quyen-quan-ly-cua-hang` (F-077), `vi-tri-va-cap-nhan-vien` (F-078) |

# Khi dùng

- **Thêm route dưới `/api/admin`:** mặc định chỉ chủ quán. Muốn người khác dùng → thêm khóa vào `full` / `read` / `only` của **một** quyền trong `CAPABILITIES` (khóa = đoạn đầu đường dẫn; `reports/…`, `jobs/…` = hai đoạn). Test `store-manager.test.js` AC-077-02 bắt khóa gõ sai; `api-docs.test.js` gọi thử mọi dòng chỉ chủ quán.
- **Thêm trang Quản lý:** thêm `pages` ở quyền (server) và `PAGE_CAP` + `ADMIN_PAGE_HREF` (`js/roles.js`).
- **Thêm quyền mới:** một mục `CAPABILITIES` (`key` ≤ 30 ký tự, `group`, `label` dễ hiểu, `money` nếu dính tiền, `byRole` = mặc định giữ đúng quyền hiện có). Không thêm quyền cho tài khoản / cài đặt chung / duyệt xin quyền.
- **Kiểm quyền ở chỗ mới:** dùng `hasCap(user, key)` (server) / `hasCap(user, key)` (`js/roles.js`, đọc `user.caps`), không so `user.role` trực tiếp nếu việc đó cấp riêng được.

# Quy tắc (BR-117)

- `hasCap`: chủ quán luôn có; quyền riêng còn hạn (`user.grants`) thắng `byRole`. `can()` (kiểm kê, chấm công, Hôm nay), `hasPosition()` (`pos.cashier` / `pos.barista` / `pos.server`), `adminMay()` (trang Quản lý) đều qua đây.
- `requireAdminArea`: không có quyền trang Quản lý nào → `403 FORBIDDEN`; có nhưng thiếu → `403 OWNER_ONLY`; thuộc quyền cấp được → `details.capability`, `capabilityLabel`. Ai có quyền trang Quản lý thì xem cài đặt và đổi `STORE_MGR_SETTINGS`.
- Đặt riêng: `PUT /api/admin/users/{id}/grants` thay toàn bộ (chỉ chủ quán, không đặt cho chủ quán, hạn phải ở tương lai). Duyệt: `POST /api/admin/access-requests/{id}/approve` (`TODAY` = 0 giờ hôm sau giờ VN, `WEEK` = 0 giờ ngày thứ 7, `ALWAYS` = không hạn). Mỗi người một yêu cầu chờ / quyền, tối đa 5.
- Cho phép quyền `money` → `alertService.onAccessGrant` (`ACCESS_GRANT`, trong `OWNER_ONLY_ALERTS`).
- Giao diện: `registerAccessPrompter()` ở `mountPosShell` / `mountAdminShell`; trang bị chuyển về kèm `&cap=`; máy người xin hỏi `/api/access-requests/mine` mỗi 15 giây tới khi có kết quả.

# Chỗ dễ sai

- Quyền riêng nạp trong `userFromToken`; code đọc người dùng bằng `usersRepo.findById` (không qua token) sẽ **không** có `grants` → chỉ mặc định. Cần quyền thật của người đang gọi thì dùng `req.user`.
- Duyệt tiền (giảm giá vượt ngưỡng, hoàn tiền, duyệt chi) theo vai + ngưỡng (`resolveApproval`) — không cấp riêng; đừng nối vào `hasCap` khi chưa có ADR.
- E2E chạy một bài bằng `-g` ghi đè kết quả → chạy lại đủ bộ trước `npm run trace -- --check`.

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0055). Số liệu: `TASK-096.md`.
