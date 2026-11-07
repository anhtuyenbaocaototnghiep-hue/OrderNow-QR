# TASK-097 — Kế hoạch: trang Quản lý riêng (F-080, ADR-038)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Đăng nhập | `/pos/login` (`pos-login.js`) → `POST /api/auth/login` → `userService.login` → `onLogin` chấm công vào | Một cửa cho mọi người, vào `/pos` |
| Phiên trên máy | `auth-store.js` (`cf_staff_token`, `cf_staff_user`) dùng chung cho `/pos` và `/admin` | Đăng xuất trang Quản lý = đăng xuất máy quầy |
| Vào trang Quản lý | `requireStaffPage` (`auth.js`) — chưa có token → `/pos/login`; không có quyền → `/pos?denied=admin`; `GET /admin` → `/admin/reports` | — |
| Đăng xuất | `auth.logout` → `POST /api/auth/logout` (chấm công ra, chặn khi đang giữ ca — F-054) | Dùng ở cả thanh bên Quản lý |
| Hết phiên | `api.js send()` 401 → `/pos/login?reason=expired` | — |

## Thiết kế
- Trang `/admin/login` (SCR-56) + `admin-login.js`; `GET /admin` → `/admin/today`.
- `auth-store.js`: `isAdminArea()`; phiên Quản lý `cf_admin_session` `{ token, user, adopted }`; `getToken()` theo khu; đi theo máy quầy khi chưa đăng nhập riêng (bỏ khi token máy quầy đổi); `cf_admin_skip` sau khi đăng xuất trang Quản lý.
- `requireStaffPage`: chưa có phiên → trang đăng nhập đúng khu; `?from=pos` → đi theo máy quầy; không được mở trang mà còn trang Quản lý khác → trang đầu tiên + `?cap=`.
- Máy chủ: `area` ở đăng nhập (`admin` bỏ chấm công vào). Đăng xuất trang Quản lý không gọi máy chủ.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| E2E cũ mở `/admin/*` sau khi đăng nhập ở máy quầy | Phiên Quản lý tự đi theo máy quầy khi chưa đăng nhập riêng → không phải sửa các bài đó |
| Phiên Quản lý của chủ quán còn lại trên máy quầy dùng chung | Đăng xuất trang Quản lý là một nút; ghi trong security-model / skill |
| Người không có quyền vào trang đăng nhập Quản lý | Báo + xin quyền, không lưu phiên |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.
