# TASK-094 — Kế hoạch: phân quyền rõ ràng, đợt 1 — vai Quản lý cửa hàng (F-077, ADR-035)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Vai | `Users.Role` + `CK_Users_Role` (`0025_truong_ca.sql`), `auth/permissions.js` (`ROLES`, `PERMISSIONS`, `discountLimits`) | STAFF / MANAGER / ADMIN |
| Cổng /api/admin | `adminRouter.use(requireAdmin)` (`routes/admin.js`), 200 route ở 8 router con | Chỉ ADMIN |
| Duyệt | `userService.resolveApproval({ allowManager })`; gọi từ `cashService` (review, voidTxn), `billingService.approvalFor`, `refundService`, `voidService` | ADMIN / MANAGER |
| Chỗ so vai ở server | `attendanceService` (sửa trong ngày), `dashboardService.today` (`full`), `offlineSaleService` (phiếu bán tay), `routes/expiry.js` (tiền), `realtime/io.js` (phòng admin), `apiDocs.accessOf` | 38 chỗ — chỉ đổi những chỗ vai mới cần khác |
| Giao diện | `auth.requireStaffPage({ admin })`, `admin-shell` (NAV, MODULE_OF), `pos-shell` (mục Quản lý), nhãn vai ở `attendance.js`, `admin-users.js`, `admin-api-docs.js`; `isLead` ở `pos-shift`, `pos-stock`, `pos-takeaway`, `cash-book` | Chỉ ADMIN vào trang Quản lý (trừ Hôm nay) |
| Trang được mở gọi API nào | `pages/admin-*.js` | Thực đơn gọi `settings` + `jobs`; Kho gọi `reports/cogs`, `costs`; Nhân sự gọi `users`, `attendance-settings`; Sổ quỹ sửa danh mục; Hội viên ẩn danh |

## Thiết kế
- Vai `STORE_MGR` (migration 0053, chỉ thêm). `PERMISSIONS`: thêm vào mọi quyền MANAGER.
- `STORE_MGR_AREAS` (full / read / only / deny) + `storeManagerMay(method, path)` + `requireAdminArea` (thay `requireAdmin` ở `/api/admin`); test bắt khóa gõ sai (mỗi khóa khớp route thật) và Tra cứu API so với server cho mọi endpoint.
- Duyệt: `resolveApproval` cờ `allowStoreManager` (mặc định có), chi quỹ ≤ 3 × ngưỡng trưởng ca.
- Cài đặt: STORE_MGR chỉ đổi ô vận hành; GET bỏ email nhận cảnh báo. Cảnh báo: lọc `OWNER_ONLY_ALERTS`, chặn tự xử lý, phòng realtime `store`, loại mới `PRICE_CHANGE` khi STORE_MGR đổi giá / thêm món.
- Giao diện: `js/roles.js` dùng chung (tên vai, `STORE_MGR_PAGES`, `canOpenAdminPage`); ẩn phần chỉ chủ quán trong trang được mở.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Thêm route quản lý mới mà quên xếp vào bảng → quản lý cửa hàng bị 403 (an toàn mặc định) | Skill ghi rõ; Tra cứu API hiện vai từng dòng |
| Trang được mở gọi API chỉ chủ quán → lỗi đỏ trên trang | Khảo sát từng trang; mở `read` / `only` đúng phần cần; E2E mở các trang chính |
| Đổi nhãn "Quản lý" → "Chủ quán" làm hỏng E2E cũ | Chỉ đổi nhãn vai; câu chữ "quản lý" chung giữ nguyên |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
