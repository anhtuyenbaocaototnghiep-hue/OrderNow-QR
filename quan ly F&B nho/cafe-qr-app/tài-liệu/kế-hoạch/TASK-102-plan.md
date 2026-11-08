# TASK-102 — Kế hoạch: Tài khoản Chủ quán chỉ dùng trang Quản lý (F-084, ADR-043)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Đăng nhập | `POST /api/auth/login` (`routes/public.js`) → `userService.login`; `area` mặc định `'pos'` (F-080: `'admin'` không chấm công) | Mọi vai đăng nhập quầy được |
| Màn đăng nhập quầy | `js/pages/pos-login.js` (không gửi `area`) | — |
| Trang quầy | `js/auth.js requireStaffPage` (dùng `getToken()` theo khu) | Không kiểm vai chủ quán |
| Lối sang quầy ở trang Quản lý | `admin-shell.js` "Mở màn hình quầy"; `admin-shifts.js` "Mở trang ca ở quầy →"; `admin-today.js` việc cần làm → `/pos/shift`, `/pos/stock` | — |
| In lại hóa đơn | `admin-reports.js printUrl('/pos/…/receipt')` → `pos-receipt.js` → `staffApi` (token máy quầy) | Chủ quán đăng nhập riêng trang Quản lý không có token máy quầy |
| Duyệt ở quầy | `resolveApproval` (`billingService`, `cashService`, `refundService`) — tài khoản người duyệt trong body | Không qua đăng nhập — giữ |
| Đóng ca | `shiftService.close` — ai có quyền thu tiền cũng đóng được | Ca chủ quán mở cũ do nhân viên đóng |
| Test | E2E: `P` đăng nhập quầy bằng chủ quán (42 lần vào `/pos…`, 59 lần `/admin/…`); bài F-080 dùng chủ quán ở quầy; a11y đăng nhập quản lý qua `/pos/login`; integration gọi API không gửi `area` | — |

## Thiết kế
- **Chặn ở cửa vào, không chặn từng API.**
  - Máy chủ từ chối `area = 'pos'` cho ADMIN, sau khi đúng mật khẩu.
  - Màn quầy tự chuyển sang trang Quản lý.
  - Trang quầy đổi phiên cũ của chủ quán.
  - API không gửi `area` giữ như cũ (công cụ, test, hộp duyệt không bị ảnh hưởng).
- **Trang Quản lý:** ẩn lối sang quầy cho chủ quán; việc cần làm → Sổ quỹ / Đặt hàng / Nguyên liệu; in lại `?area=admin`.
- **E2E:** `P` giữ hai phiên — trang Quản lý là chủ quán (`/admin/login`), máy quầy là quản lý cửa hàng `quay-ql` (tạo trong bài ngay sau Báo cáo).

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Quán chỉ có tài khoản chủ quán → không ai đứng quầy | Ghi ở ADR-043 + báo chủ dự án: tạo tài khoản nhân viên ở Hệ thống → Tài khoản |
| Chủ quán đang giữ ca mở | Nhân viên đóng ca ở quầy (đóng ca không cần người mở) |
| Bài E2E cũ dựa vào quyền chủ quán ở quầy | `P` đứng quầy bằng quản lý cửa hàng (gần quyền chủ quán nhất); sửa từng bài nếu lệch |
| Trang in mở từ trang Quản lý | `?area=admin` → dùng phiên Quản lý; E2E mở trang in bằng phiên Quản lý |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration; khởi động lại máy chủ thử nghiệm.
