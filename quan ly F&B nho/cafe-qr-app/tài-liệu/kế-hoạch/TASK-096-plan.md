# TASK-096 — Kế hoạch: quyền riêng từng tài khoản + xin quyền / duyệt (F-079, ADR-037)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Kiểm quyền quầy | `requirePermission` → `can()` theo `PERMISSIONS[role]` | Chỉ theo vai |
| Kiểm vị trí | `requirePosition` → `hasPosition()` theo `Users.Positions` (F-078) | Chỉ theo vị trí |
| Trang Quản lý | `requireAdminArea` → `storeManagerMay()` theo bảng `STORE_MGR_AREAS` cố định (F-077) | Chỉ chủ quán / quản lý cửa hàng |
| Nạp người dùng | `middleware/auth.js userFromToken` (mỗi request đọc lại `Users`) | — |
| Giao diện | `roles.js` (`canOpenAdminPage`, `hasPosition`, `canOpenPosPage`), `pos-shell`, `admin-shell`, `admin-today`, `admin-users` | Theo vai / vị trí |
| Lỗi 403 ở giao diện | `api.js send()` ném `ApiError`; trang `toast(errorMessage(err))` | Không có lối xin quyền |

## Thiết kế
- Một danh mục `CAPABILITIES` (17 quyền, mặc định `byRole` giữ đúng quyền hiện có); `hasCap` = chủ quán → có; quyền riêng còn hạn → theo đó; không thì `byRole`. Ba cửa kiểm (`can`, `hasPosition`, `adminMay`) đều qua `hasCap`; `STORE_MGR_AREAS` tổng hợp lại từ quyền mặc định của quản lý cửa hàng (test cũ giữ nguyên).
- `UserGrants` nạp trong `userFromToken` (một truy vấn nhỏ) → thu hồi có hiệu lực ngay. `/auth/me` trả `caps` cho giao diện.
- 403 ở việc cấp được kèm `details.capability`; `api.js` gọi `accessNotifier` → thanh Xin quyền (`js/access.js`). Trang bị chuyển về kèm `?cap=`.
- `AccessRequests` + duyệt (tạo `UserGrants` ALLOW có hạn) / từ chối; hỏi lại kết quả mỗi 15 giây ở máy người xin.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Đổi cách kiểm quyền làm lệch quyền đang có | `byRole` giữ đúng bảng cũ; chạy lại test quyền cũ (`finance`, `store-manager`, `staff-positions`, `api-docs`) trước khi làm giao diện |
| Người được cấp tự nâng quyền | Tài khoản, cài đặt chung, duyệt xin quyền không thuộc quyền nào → chỉ chủ quán |
| Thêm truy vấn mỗi request | Một SELECT theo khóa `(UserId)` trên bảng nhỏ; chủ quán bỏ qua |
| Xóa tài khoản vướng khóa ngoại | `sp_DeleteUser` xóa quyền riêng khi xóa hẳn; xin quyền / người cấp = lịch sử → xóa mềm |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
