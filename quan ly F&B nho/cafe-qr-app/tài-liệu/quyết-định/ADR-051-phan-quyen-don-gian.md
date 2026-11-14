# ADR-051 — Phân quyền đơn giản: Cho phép / Không cho phép, quyền theo vai lúc tạo tài khoản, Quyền nâng cao

- **Trạng thái:** ACCEPTED (14/11/2026). Chủ dự án: "còn về phân quyền chỉ cho phép và không cho phép, khi tạo tài khoản thì quyền giao diện là nhân viên hay gì đó sẽ có quyền như vậy và có thêm giao diện cấp quyền nâng cao do chính admin cấp làm lại cho dễ sử dụng hơn".
- **Cập nhật 14/11/2026 ([ADR-053](ADR-053-trang-quyen-nang-cao-va-sdt-tai-khoan.md) D-226):** công tắc "Quyền nâng cao" chuyển từ hộp Thêm / Sửa tài khoản sang trang riêng `/admin/permissions` (thay D-224); D-222, D-223 giữ nguyên.
- **Bối cảnh:** F-079 ([ADR-037](ADR-037-quyen-rieng-tung-tai-khoan.md)) cho chủ quán đặt riêng từng quyền trong hộp "Quyền" (nút riêng trên dòng tài khoản): mỗi quyền một ô chọn ba trạng thái "Mặc định / Cho phép / Không cho" + ô Hạn (Giữ hạn cũ / Luôn luôn / Hết hôm nay / 7 ngày / Đến ngày…). Lúc tạo tài khoản không thấy vai trò vừa chọn được làm gì; muốn đổi quyền phải tạo xong rồi mở một hộp khác. Chủ dự án thấy khó dùng.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-222 | **Chỉ Cho phép / Không cho phép.** Mỗi quyền một công tắc hai trạng thái, bật sẵn theo quyền người đó đang có. Công tắc khác quyền mặc định của vai trò + vị trí → lưu quyền riêng (`ALLOW` / `DENY`, không hạn); giống mặc định → không lưu (theo vai trò). Bỏ lựa chọn "Mặc định" và ô Hạn khỏi chỗ đặt tay. Quyền tạm có hạn (chủ quán duyệt Xin quyền "Hết hôm nay" / "7 ngày") vẫn có: hiện "tạm đến …", giữ nguyên hạn nếu không chạm công tắc. Mô hình dữ liệu (`UserGrants`), `PUT /api/admin/users/{id}/grants`, cách máy chủ kiểm quyền, cảnh báo `ACCESS_GRANT` không đổi. |
| D-223 | **Quyền theo vai lúc tạo / sửa tài khoản.** Chọn vai trò (+ vị trí) → hộp hiện ngay "Vai trò này được làm N / 17 việc" kèm danh sách, đổi theo vai / vị trí; tài khoản nhận đúng các quyền đó. Máy chủ tính quyền mặc định (API mới, chỉ chủ quán: `GET /api/admin/role-permissions?role=&positions=`) — giao diện không chép luật. |
| D-224 | **Quyền nâng cao.** Phần thu gọn "Quyền nâng cao — cho phép / không cho phép từng việc" trong hộp Thêm / Sửa tài khoản (mở sẵn khi người đó đang có quyền riêng): công tắc theo nhóm Máy quầy / Trang Quản lý, nhãn "Theo vai trò" / "Cấp thêm" / "Bỏ bớt", nút "Về như vai trò". Tạo tài khoản kèm quyền nâng cao = tạo rồi lưu quyền (lưu quyền lỗi → báo, tài khoản vẫn tạo, đặt lại ở Sửa). Đổi vai trò: công tắc chưa chạm theo vai mới; quyền riêng trùng mặc định của vai mới tự bỏ khi lưu. Bỏ nút "Quyền" riêng trên dòng (gộp vào Sửa — một chỗ cho tài khoản + quyền); nhãn dòng "Có quyền nâng cao". Chỉ chủ quán (như F-079). Khung "Xin quyền chờ duyệt" giữ nguyên (Duyệt kèm thời hạn / Từ chối). |

## Phương án đã cân nhắc

- **Giữ ba trạng thái (Mặc định / Cho phép / Không cho):** chủ dự án muốn chỉ hai; "mặc định" nay là công tắc giống vai trò, hiện bằng nhãn "Theo vai trò".
- **Bỏ hẳn quyền tạm có hạn:** duyệt Xin quyền "hết hôm nay" vẫn cần khi làm thay ca; chỉ bỏ ô Hạn ở chỗ đặt tay.
- **Tính quyền mặc định ở giao diện** (chép luật vị trí / vai trò sang JS): dễ lệch với máy chủ → API trả đúng kết quả của hàm kiểm quyền.
- **Lưu quyền trong cùng lệnh tạo tài khoản** (`POST /users` nhận `grants`): thêm hợp đồng API; hai lệnh đủ dùng, lỗi hiếm và có báo.

## Hệ quả

- **Mã nguồn:** `services/accessService.js` (`roleDefaults`), `routes/access.js` (`GET /role-permissions`), `js/perm-editor.js` (mới), `js/pages/admin-users.js` (hộp Thêm / Sửa có phần Quyền; bỏ hộp "Quyền" riêng), `css/admin.css`. Không migration.
- **Test:** `role-permissions.test.js` (AC-090-01); E2E AC-090-02, AC-090-03, AC-079-07 (đặt lại quyền qua Sửa); a11y hộp Sửa (AC-090-04). `access-grants.test.js` (AC-079-01…06) không đổi.
- **Tài liệu:** FEATURE-090, FEATURE-079 (màn hình), roles-permissions 4.8 + 4.10, api-contract, screens-flows, user-stories, use-cases, tc-map, hướng dẫn `chức-năng-mới/17`, ADR-037 (ghi chú).
