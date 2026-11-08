# ADR-035 — Phân quyền rõ ràng, đợt 1: vai Quản lý cửa hàng, tên Chủ quán

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án: "với phân quyền tôi muốn bạn đề xuất phân quyền rõ ràng giữa khi vào admin thì chỉ thấy và làm cái gì, quản lý cũng vậy, và nhân viên chia ra từng cấp…". Agent đề xuất 5 vai + vị trí + cấp, chia hai đợt; chủ dự án: "tiến hành làm những cái tôi vừa nhắn".
- **Một phần thay bởi [ADR-043](ADR-043-chu-quan-chi-quan-ly.md) (08/11/2026):** Chủ quán không còn đứng quầy (bán, thu tiền, mở / đóng ca…) — chỉ trang Quản lý; vẫn duyệt hộ ở quầy bằng tài khoản.
- **Bối cảnh:** app có ba vai STAFF < MANAGER (Trưởng ca) < ADMIN. ADMIN hiển thị là "Quản lý" nhưng thực chất là chủ quán (toàn quyền: lương, lãi / lỗ, tài khoản). Quán muốn thuê người quản lý cửa hàng điều hành hằng ngày (thực đơn, kho, khuyến mãi, lịch làm, duyệt chi) mà không phải đưa mật khẩu chủ quán — hiện chỉ có hai lựa chọn: cho trưởng ca (thiếu quyền) hoặc cho ADMIN (thấy lương từng người, lãi / lỗ, đổi tài khoản).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-156 | Thêm vai **Quản lý cửa hàng** (`STORE_MGR`) giữa Trưởng ca và Chủ quán: STAFF < MANAGER < STORE_MGR < ADMIN. ADMIN hiển thị là **Chủ quán** (mã vai giữ nguyên). Tài khoản cũ giữ nguyên vai và quyền. Chỉ chủ quán tạo / đổi vai tài khoản. Quản lý cửa hàng là nhân viên: chấm công, có trong bảng lương, cần PIN cho thao tác tiền như mọi người. |
| D-157 | Phạm vi trang Quản lý của Quản lý cửa hàng là **danh sách cho phép ở server** (`STORE_MGR_AREAS` trong `auth/permissions.js`, middleware `requireAdminArea` thay `requireAdmin` cho `/api/admin`): **được làm** thực đơn & giá, tùy chọn, combo, lịch thực đơn, bàn & QR, kho / nhập / kiểm kê / nhà cung cấp / đặt hàng / lô, khuyến mãi, gợi ý, đánh giá, hội viên, tích điểm / voucher / chiến dịch / quà, xếp lịch làm; **chỉ xem** báo cáo bán hàng / marketing / giá vốn / hao hụt / nhà cung cấp / năng suất, ca & hoàn tiền, đơn & lượt thu, sổ quỹ, danh mục thu chi, giờ công tuần, cảnh báo, danh sách tài khoản, cài đặt; **chỉ chủ quán**: tài khoản (sửa), cài đặt chung, nhật ký thao tác, chi phí cố định, lãi / lỗ, phân tích, lương / hồ sơ lương / ngày lễ / duyệt giờ công, cách chấm công, email cảnh báo, ẩn danh hội viên, tra cứu API, chạy việc nền (trừ tính lại thời gian pha / dự báo nhập hàng). Ngoài danh sách → `403 OWNER_ONLY`. |
| D-158 | Quyền ở quầy: Quản lý cửa hàng có mọi quyền trưởng ca; **giảm giá tay không giới hạn**; duyệt hoàn tiền mọi ca; **duyệt chi quỹ tới 3 × ngưỡng trưởng ca** (`manager.cash_out_approve_max`), quá mức cần chủ quán; sửa chấm công **mọi ngày** (không sửa của chính mình); trang Hôm nay bản đủ (có giá vốn, lãi gộp — họ chịu trách nhiệm giá vốn). Không tự duyệt khoản chi / tạm ứng của mình (như trưởng ca). |
| D-159 | Quản lý cửa hàng **đổi giá hoặc thêm món** → cảnh báo mới `PRICE_CHANGE` cho chủ quán (trang Cảnh báo, email theo cài đặt cảnh báo tức thì). Không chặn việc đổi giá. |
| D-160 | Cảnh báo: Quản lý cửa hàng xem và xử lý cảnh báo, **trừ** loại chỉ chủ quán (`AUTH_LOCK`, `PRICE_CHANGE`) và **trừ cảnh báo về chính mình** (`403 SELF_ALERT`). Nhận cảnh báo tức thì qua phòng realtime `store`. |
| D-161 | Cài đặt: Quản lý cửa hàng xem được (không thấy email nhận cảnh báo), chỉ đổi phần vận hành — nhận đơn QR / lời nhắn tạm ngưng, cài đặt bếp (thời gian chờ), quy trình 1 chạm. Ô khác → `403 OWNER_ONLY` kèm tên ô, không lưu gì. |

## Phương án đã cân nhắc

- **Quyền từng chức năng bật / tắt cho mỗi tài khoản:** linh hoạt nhưng chủ quán nhỏ khó cấu hình, dễ mở nhầm; vai cố định dễ hiểu hơn.
- **Đổi tên MANAGER thành quản lý và thêm vai trưởng ca mới:** đổi nghĩa vai đang dùng (dữ liệu, test, tài liệu cũ) — rủi ro cao, không cần.
- **Cho quản lý cửa hàng xem lương từng người:** chủ quán thường giữ kín; đủ dùng với tổng tiền công mỗi ca so với doanh thu (Nhân sự → Báo cáo tuần).

## Hệ quả

- Migration `0053_quan_ly_cua_hang.sql`: `CK_Users_Role` thêm `STORE_MGR`; `CK_Alerts_Kind` thêm `PRICE_CHANGE`.
- Máy chủ: `permissions.js` (`ROLES`, `STORE_MGR_AREAS`, `storeManagerMay`, `requireAdminArea`, `STORE_MGR_SETTINGS`, `OWNER_ONLY_ALERTS`, `storeManagerCashMax`), `resolveApproval` thêm cờ `allowStoreManager` (mặc định có), Tra cứu API ghi vai `STORE_MGR`.
- Giao diện: `js/roles.js` (tên vai, trang được mở), menu Quản lý lọc theo vai, máy quầy có "Quản lý" → Hôm nay, Tài khoản có bảng "Mỗi vai trò làm được gì?".
- Đợt 2 (TASK-095, chưa làm): vị trí Thu ngân / Pha chế / Phục vụ, cấp Thử việc / Chính thức.
