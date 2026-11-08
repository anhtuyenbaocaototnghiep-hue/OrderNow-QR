---
name: phan-quyen-quan-ly-cua-hang
description: Phân quyền rõ ràng đợt 1 cho cafe-qr-app (FEATURE-077, ADR-035, TASK-094) — vai Quản lý cửa hàng (STORE_MGR) giữa Trưởng ca và Chủ quán (ADMIN hiển thị "Chủ quán"), danh sách cho phép STORE_MGR_AREAS + requireAdminArea cho /api/admin (ngoài danh sách 403 OWNER_ONLY), duyệt chi ≤ 3 × ngưỡng trưởng ca, cài đặt vận hành STORE_MGR_SETTINGS, cảnh báo PRICE_CHANGE khi đổi giá, OWNER_ONLY_ALERTS + SELF_ALERT, js/roles.js (tên vai, STORE_MGR_PAGES, menu theo vai). Dùng khi task giao F-077 / ADR-035 / TASK-094 / AC-077-xx, khi thêm route /api/admin mới hoặc trang Quản lý mới (phải xếp vào bảng), hoặc nhắc "quản lý cửa hàng", "STORE_MGR", "chủ quán", "phân quyền", "OWNER_ONLY", "vai trò", "ai được làm gì", "thêm vị trí / cấp nhân viên" (đợt 2 — TASK-095).
---

# Mục đích

Ghi lại **vai Quản lý cửa hàng** (07/11/2026, TASK-094) để agent sau thêm chức năng quản lý mà không mở nhầm quyền hay làm trang của quản lý cửa hàng báo lỗi 403.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-035-phan-quyen-quan-ly-cua-hang.md` (D-156…D-161) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-077.md` (AC-077-01…08) |
| Bảng quyền 4 vai | `tài-liệu/nghiệp-vụ/roles-permissions.md` §4.6 · `kiến-trúc/security-model.md` §3.5 · BR-115 |
| Task / kế hoạch | `TASK-094.md`, `TASK-094-plan.md` |

# Khi dùng

- **Thêm route dưới `/api/admin`:** mặc định chỉ Chủ quán (an toàn). Nếu quản lý cửa hàng cần dùng → thêm khóa vào `STORE_MGR_AREAS` (`src/auth/permissions.js`): `full` (mọi method), `read` (GET), `only` ("METHOD /mẫu"), `deny` (chặn trong nhóm đã mở). Khóa = đoạn đầu đường dẫn; `reports/…`, `jobs/…` = hai đoạn đầu.
- **Thêm trang Quản lý:** khóa trang vào `STORE_MGR_PAGES` (`js/roles.js`) nếu quản lý cửa hàng được mở; trang đó không được gọi API chỉ chủ quán (hoặc ẩn phần đó bằng `isOwner(me)`).
- **Thêm cài đặt vận hành** quản lý cửa hàng được đổi → `STORE_MGR_SETTINGS`. **Thêm loại cảnh báo** chỉ chủ quán xem → `OWNER_ONLY_ALERTS`.
- **Đợt 2 (TASK-095):** vị trí Thu ngân / Pha chế / Phục vụ + cấp Thử việc / Chính thức — xây trên `ROLES` hiện có, không đổi nghĩa vai.
- **Mác vai cạnh tên** ở thanh trên máy quầy (`pos-shell.js`) và trang Tài khoản dùng chung `ROLE_BADGE` / `ROLE_LABEL` (`js/roles.js`) — mọi vai đứng quầy đều có mác (Nhân viên trung tính, Trưởng ca xanh lá, Quản lý cửa hàng xanh dương; thử việc thêm "Thử việc"). Thêm vai mới → thêm vào hai bảng này, đừng viết điều kiện riêng từng vai (08/11/2026: máy quầy từng chỉ hiện mác cho Trưởng ca / Quản lý cửa hàng, nhân viên không có).

# Quy tắc (BR-115)

- STAFF < MANAGER (Trưởng ca) < STORE_MGR (Quản lý cửa hàng) < ADMIN (Chủ quán). Chỉ chủ quán tạo / đổi vai. Quản lý cửa hàng chấm công, có bảng lương, cần PIN.
- Quầy: mọi quyền MANAGER; `discountLimits` → null; hoàn tiền mọi ca; `resolveApproval(..., { allowStoreManager })` mặc định có — chi quỹ chỉ khi ≤ `storeManagerCashMax` (3 × `managerCashApproveMax`); sửa chấm công mọi ngày (không của mình); `dashboardService.today` `full`.
- Trang Quản lý: `requireAdminArea` — ADMIN qua hết; STORE_MGR theo bảng, ngoài bảng `403 OWNER_ONLY`; vai khác 403 như `requireAdmin` cũ (vẫn giữ để dùng nơi khác).
- Đổi giá / thêm món bởi STORE_MGR → `alertService.onPriceChange` (`PRICE_CHANGE`). STORE_MGR không thấy `AUTH_LOCK` / `PRICE_CHANGE`, không xử lý cảnh báo có `UserId` = mình (`SELF_ALERT`); realtime phòng `store`.
- Giao diện: `canOpenAdminPage(user, page)` trong `requireStaffPage({ admin: true, page })`; menu lọc theo vai; máy quầy STORE_MGR có "Quản lý" → `/admin/today`.

# Chỗ dễ sai

- Đừng dùng `user.role === 'ADMIN'` để nói "quản lý" ở chỗ mới — hỏi: chủ quán thôi, hay cả quản lý cửa hàng / trưởng ca? Dùng `isLead`, `isOwner` (`js/roles.js`) hoặc liệt kê đủ vai.
- `resolveApproval` mặc định cho STORE_MGR duyệt — chỗ nào chỉ chủ quán được duyệt thì truyền `allowStoreManager: false`.
- Thêm route `/api/admin` mà trang của quản lý cửa hàng gọi tới nhưng quên xếp bảng → trang báo đỏ 403. Test `store-manager.test.js` AC-077-02 bắt khóa gõ sai; `api-docs.test.js` gọi thử mọi dòng chỉ chủ quán bằng STORE_MGR.
- Nhãn: "Chủ quán" chỉ đổi ở nhãn vai; câu chữ chung "quản lý duyệt…" giữ nguyên.

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0053). Số liệu: `TASK-094.md`.
