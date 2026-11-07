# ADR-037 — Quyền riêng từng tài khoản và Xin quyền / Duyệt

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án: "tôi muốn admin có nhiều quyền hơn giống như có thể duyệt hoặc cấp quyền để truy cập ở mỗi tài khoản"; agent đề xuất "Quyền riêng từng tài khoản + Xin quyền / Duyệt"; chủ dự án: "ok".
- **Bối cảnh:** sau F-077 / F-078, quyền của mỗi người được suy ra từ vai trò + vị trí + cấp. Chủ quán không chỉnh được cho một người cụ thể (cho bạn phục vụ thu tiền hôm thu ngân nghỉ, không cho quản lý cửa hàng đổi giá, cho trưởng ca vào trang Lương…) và nhân viên bị chặn thì không có cách xin.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-167 | Danh mục **quyền cấp / thu được** (`CAPABILITIES` trong `auth/permissions.js`, 17 mục, đặt tên dễ hiểu): máy quầy (Thu tiền…, Nhận / làm đơn…, Mở bàn / gọi món…, Kiểm kê & điều chỉnh kho, Sửa chấm công người khác) và trang Quản lý (Hôm nay, Báo cáo bán hàng & ca, Thực đơn & giá, Kho hàng, Khách hàng & khuyến mãi, Bàn & QR, Nhân sự, Sổ quỹ, Cảnh báo, Lãi / lỗ & phân tích, Lương, Nhật ký). Mỗi quyền có mặc định theo vai trò / vị trí — giữ đúng quyền hiện có. |
| D-168 | Chủ quán đặt riêng cho từng người (trừ chủ quán): **Theo vai trò** (không lưu) / **Cho phép** / **Không cho**, kèm hạn tùy chọn (luôn / hết hôm nay / 7 ngày / đến ngày — tính hết ngày giờ Việt Nam). Đặt riêng thắng mặc định; hết hạn tự về theo vai trò. Bảng `UserGrants` (migration 0055). |
| D-169 | Máy chủ kiểm quyền ở ba cửa cũ, nay theo quyền: `requirePermission` (kiểm kê, chấm công, Hôm nay), `requirePosition` (Thu ngân / Pha chế / Phục vụ), `requireAdminArea` (trang Quản lý — luật đường dẫn từng quyền; ai có ít nhất một quyền trang Quản lý thì xem được cài đặt và đổi phần vận hành). Quyền riêng nạp lại mỗi request → đổi / thu hồi có hiệu lực ngay. Bị chặn ở việc cấp được → 403 kèm `details.capability`. |
| D-170 | **Không cấp được** (chỉ chủ quán): tài khoản & phân quyền, cài đặt chung (giảm giá, ngưỡng duyệt, cảnh báo, Wi-Fi, tên quán), cách chấm công, email cảnh báo, việc chạy nền khác, sửa danh mục thu chi, ẩn danh hội viên, Tra cứu API, duyệt xin quyền. Duyệt tiền (giảm giá vượt ngưỡng, hoàn tiền, duyệt chi) vẫn theo vai trò + ngưỡng — không cấp riêng. |
| D-171 | **Xin quyền**: bị chặn ở việc cấp được (hoặc bị chuyển về khi mở trang không được mở) → thanh "Bạn chưa có quyền: … [Xin quyền]" → hộp ghi lý do → yêu cầu (`AccessRequests`, mỗi người một yêu cầu chờ cho mỗi quyền, tối đa 5 yêu cầu chờ). Chủ quán thấy ở **Hôm nay** (việc cần làm) và **Tài khoản** (khung "Xin quyền chờ duyệt"), **Duyệt** (hết hôm nay mặc định / 7 ngày / luôn) hoặc **Từ chối**; máy người xin hỏi lại mỗi 15 giây và báo kết quả (duyệt → mời tải lại trang). |
| D-172 | Cho phép quyền dính tiền (Thu tiền, Báo cáo, Sổ quỹ, Lãi / lỗ, Lương) — đặt riêng hoặc duyệt — tạo cảnh báo **ACCESS_GRANT** (chỉ chủ quán xem) + email theo cài đặt; mọi thay đổi dưới `/api/admin` vẫn vào Nhật ký thao tác. |

## Phương án đã cân nhắc

- **Ma trận quyền tự do theo từng endpoint:** quá nhiều ô, chủ quán khó hiểu; gom thành 17 quyền theo việc / trang.
- **Cấp được cả quyền tài khoản / cài đặt:** người được cấp có thể tự nâng quyền cho mình hoặc người khác — loại.
- **Duyệt bằng mật khẩu chủ quán ngay tại máy nhân viên:** đã có cho việc tiền (F-036); xin quyền dùng cho truy cập lâu hơn một thao tác, chủ quán có thể không ở quán.

## Hệ quả

- Migration 0055 (`UserGrants`, `AccessRequests`, `Alerts.Kind` + `ACCESS_GRANT`); `sp_DeleteUser` xóa quyền riêng của tài khoản xóa hẳn, coi xin quyền / người đã cấp quyền là lịch sử (xóa mềm).
- `permissions.js`: `CAPABILITIES`, `hasCap`, `capsOf`, `adminMay`, `capabilityForAdmin`; `STORE_MGR_AREAS` nay tổng hợp từ quyền mặc định của quản lý cửa hàng. `userFromToken` nạp `user.grants`; `/auth/me` trả `user.caps`.
- Giao diện: `js/access.js` (thanh Xin quyền, hộp gửi, hỏi lại kết quả), `api.js` (`setAccessNotifier`), `roles.js` theo `caps`; trang Tài khoản (nút Quyền, nhãn "Có quyền riêng", khung chờ duyệt); Hôm nay (việc cần làm).
