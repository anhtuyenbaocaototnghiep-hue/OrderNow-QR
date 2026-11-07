---
name: trang-quan-ly-rieng
description: Trang Quản lý riêng cho cafe-qr-app (FEATURE-080, ADR-038, TASK-097) — địa chỉ /admin → /admin/today, trang Đăng nhập Quản lý /admin/login (SCR-56, admin-login.js), phiên trang Quản lý tách khỏi máy quầy trong auth-store.js (cf_admin_session { token, user, adopted }, cf_admin_skip, isAdminArea, getToken theo khu), đi theo máy quầy khi đi từ nút "Quản lý" (?from=pos) hoặc chưa đăng nhập riêng, POST /api/auth/login area = admin không chấm công, adminLogout chỉ xóa phiên Quản lý. Dùng khi task giao F-080 / ADR-038 / TASK-097 / AC-080-xx, khi sửa đăng nhập / đăng xuất / hết phiên / chuyển trang giữa máy quầy và trang Quản lý, hoặc nhắc "trang quản lý riêng", "đăng nhập quản lý", "admin login", "phiên riêng", "văng máy quầy", "không tính vào ca".
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
- Thêm nút đi từ máy quầy sang trang Quản lý → thêm `?from=pos` để trang Quản lý dùng phiên người đang đứng máy.
- Sửa đăng nhập: máy quầy gửi `area` mặc định (`pos` — chấm công vào); trang Quản lý gửi `area: 'admin'` (không chấm công).

# Quy tắc (BR-118)

- `getAdminSession()`: phiên đăng nhập riêng (`adopted: false`) giữ tới khi Đăng xuất / hết hạn; phiên đi theo (`adopted: true`) chỉ còn khi token máy quầy chưa đổi; chưa có phiên → đi theo token máy quầy trừ khi token đó nằm trong `cf_admin_skip` (vừa đăng xuất trang Quản lý).
- `requireStaffPage`: chưa có phiên → `/admin/login?next=…` (khu Quản lý) hoặc `/pos/login?next=…`; trang không được mở → trang Quản lý đầu tiên được mở `?cap=…` nếu có (`hasAdminPages`), không thì `/pos?denied=admin&cap=…` (máy có phiên quầy) hoặc `/admin/login?reason=noaccess`.
- `adminLogout()` (thanh bên Quản lý, bản gọn Hôm nay): xóa phiên Quản lý, không gọi `/api/auth/logout` → không chấm công ra, không bắt đóng ca. Máy quầy dùng `logout()` như cũ.
- `api.js`: 401 / tài khoản khóa ở khu Quản lý → `/admin/login?reason=…`.

# Chỗ dễ sai

- Đừng đọc `localStorage cf_staff_token` trực tiếp ở trang Quản lý — dùng `getToken()` (theo khu).
- E2E mở `/admin/*` sau khi đăng nhập máy quầy chạy được nhờ "đi theo"; bài cần phiên Quản lý độc lập thì mở context mới và đăng nhập ở `/admin/login`.
- Phiên Quản lý đăng nhập riêng trên máy quầy dùng chung không tự hết khi máy quầy đổi người — nhắc chủ quán Đăng xuất trang Quản lý.

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Số liệu: `TASK-097.md`.
