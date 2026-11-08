---
name: trang-quan-ly-rieng
description: Trang Quản lý riêng cho cafe-qr-app (FEATURE-080, ADR-038, TASK-097) — địa chỉ /admin → /admin/today, trang Đăng nhập Quản lý /admin/login (SCR-56, admin-login.js), phiên trang Quản lý tách khỏi máy quầy trong auth-store.js (cf_admin_session { token, user }, isAdminArea, getToken theo khu) và CHỈ có được bằng đăng nhập (ADR-044 08/11/2026: bỏ "Vào bằng tài khoản này", ?from=pos, tự dùng phiên máy quầy — vì bảo mật); chiều ngược lại "Mở màn hình quầy" /pos?from=admin vào thẳng máy quầy bằng phiên Quản lý (ADR-045: POST /api/auth/pos-session chấm công vào, dùng lại token, giữ người khác đang đứng quầy), POST /api/auth/login area = admin không chấm công, adminLogout chỉ xóa phiên Quản lý. Dùng khi task giao F-080 / ADR-038 / TASK-097 / AC-080-xx, khi sửa đăng nhập / đăng xuất / hết phiên / chuyển trang giữa máy quầy và trang Quản lý, hoặc nhắc "trang quản lý riêng", "đăng nhập quản lý", "admin login", "phiên riêng", "văng máy quầy", "không tính vào ca".
---

# Mục đích

Ghi lại **trang Quản lý riêng** (07/11/2026, TASK-097) để agent sau sửa đăng nhập / chuyển trang mà không làm văng máy quầy hay chấm công nhầm.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-038-trang-quan-ly-rieng.md` (D-173…D-177) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-080.md` (AC-080-01…03) |
| Bảo mật | `tài-liệu/kiến-trúc/security-model.md` §3.8 · BR-118 · SCR-56 (`giao-diện/sitemap.md`) |

# Khi dùng

- Thêm trang dưới `/admin/…` → tự dùng phiên Quản lý (`isAdminArea()` theo đường dẫn); gọi `mountAdminShell` / `requireStaffPage({ admin: true, page })` như cũ.
- Thêm nút đi từ máy quầy sang trang Quản lý → chỉ cần link `/admin/…`; chưa đăng nhập trang Quản lý thì tự sang `/admin/login?next=…`. **Không** thêm lối dùng phiên máy quầy (ADR-044: chủ dự án coi là lỗ hổng bảo mật).
- Nút từ trang Quản lý sang máy quầy → `/pos?from=admin` (ADR-045): `auth.js openPosFromAdmin` dùng phiên Quản lý khi máy quầy trống / phiên quầy hết hạn / đứng tên chủ quán, giữ nguyên nếu người khác đang đứng quầy. Nguyên tắc: vào trang Quản lý phải gõ mật khẩu; từ trang Quản lý sang quầy thì không hỏi lại.
- Sửa đăng nhập: máy quầy gửi `area` mặc định (`pos` — chấm công vào); trang Quản lý gửi `area: 'admin'` (không chấm công).

# Quy tắc (BR-118)

- `getAdminSession()`: chỉ phiên đăng nhập ở trang Quản lý (hoặc chủ quán gõ ở màn quầy — F-084), giữ tới khi Đăng xuất / hết hạn; phiên `adopted` cũ bị bỏ khi đọc; `cf_admin_skip` cũ được dọn (ADR-044).
- `requireStaffPage`: chưa có phiên → `/admin/login?next=…` (khu Quản lý) hoặc `/pos/login?next=…`; trang không được mở → trang Quản lý đầu tiên được mở `?cap=…` nếu có (`hasAdminPages`), không thì `/pos?denied=admin&cap=…` (máy có phiên quầy) hoặc `/admin/login?reason=noaccess`.
- `adminLogout()` (thanh bên Quản lý, bản gọn Hôm nay): xóa phiên Quản lý, không gọi `/api/auth/logout` → không chấm công ra, không bắt đóng ca. Máy quầy dùng `logout()` như cũ.
- `api.js`: 401 / tài khoản khóa ở khu Quản lý → `/admin/login?reason=…`.

# Chỗ dễ sai

- Đừng đọc `localStorage cf_staff_token` trực tiếp ở trang Quản lý — dùng `getToken()` (theo khu).
- E2E: máy đã đăng nhập quầy mở `/admin/*` → `/admin/login?next=…` (ADR-044) — đăng nhập ở đó trước khi thao tác trang Quản lý. Trang dùng chung `P` có phiên Quản lý riêng (chủ quán) từ bài Báo cáo.
- Phiên Quản lý đăng nhập riêng trên máy quầy dùng chung không tự hết khi máy quầy đổi người — nhắc chủ quán Đăng xuất trang Quản lý.

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Số liệu: `TASK-097.md`.
