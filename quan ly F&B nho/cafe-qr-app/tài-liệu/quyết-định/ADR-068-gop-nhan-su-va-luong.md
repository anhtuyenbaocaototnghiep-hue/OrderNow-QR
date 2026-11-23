# ADR-068 — Gộp "Nhân sự & chấm công" và "Lương" thành một mục "Nhân sự & lương"

- **Trạng thái:** ACCEPTED (23/11/2026).
- **Chủ dự án duyệt:** ảnh thanh bên trang Quản lý (hai mục "Nhân sự & chấm công", "Lương") kèm câu "gộp 2 cái này lại".
- **Thay một phần:** cách bày thanh bên của nhóm "Quỹ & nhân sự" (TASK-108). Theo cách đã làm khi gộp "Nhà cung cấp & đặt hàng" vào "Nhập kho & kiểm kê" (TASK-109, F-089).
- **Bối cảnh:**
  - Chủ quán làm lịch, xem giờ công rồi tính lương — một việc liền mạch nhưng nằm ở hai mục cạnh nhau.
  - Chữ "Nhân sự & chấm công" dài, xuống hai dòng ở thanh bên.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-260 | **Một mục "Nhân sự & lương" ở thanh bên (nhóm Quỹ & nhân sự), một hàng thẻ chung cho hai trang.**<ul><li>**Thẻ:** Chấm công · Lịch làm tuần · Năng suất · Báo cáo tuần (trang `/admin/staff`) · **Lương** (trang `/admin/payroll`).<ul><li>Thẻ cùng trang đổi tại chỗ (ghi `?tab=`).</li><li>Thẻ trang kia chuyển trang tới đúng thẻ.</li><li>Mục ở thanh bên sáng ở cả hai trang.</li></ul></li><li>**Đường dẫn giữ nguyên:** `/admin/staff`, `/admin/payroll`. Link cũ, nút "Quản lý" ở máy quầy và cảnh báo trỏ tới trang Lương vẫn đúng.</li><li>**Tiêu đề hai trang:** "Nhân sự & lương".</li><li>**Quyền giữ nguyên theo từng trang:**<ul><li>"Nhân sự" cần `admin.staff`, "Lương" cần `admin.payroll`.</li><li>Thẻ của trang không có quyền thì không hiện, ví dụ quản lý cửa hàng chưa được giao quyền Lương không thấy thẻ Lương.</li><li>Mục ở thanh bên hiện khi mở được **một** trong hai trang và trỏ tới trang đầu tiên mở được. Người chỉ có quyền Lương vẫn vào được.</li><li>Ẩn nhóm menu (chế độ cơ bản) cũng xét theo từng trang.</li></ul></li><li>Máy chủ, API, quyền không đổi.</li></ul> |

## Phương án đã cân nhắc

- **Gộp hẳn hai trang thành một trang:** phải gộp hai tệp lớn (lịch làm kéo thả, bảng lương chốt / mở lại, VietQR trả lương) và quyền của hai trang vào một. Rủi ro cao, người dùng không thấy khác biệt. Bỏ: hai trang, một hàng thẻ chung.
- **Chỉ đổi tên hai mục cho ngắn:** vẫn hai mục, không đúng ý "gộp". Bỏ.

## Hệ quả

- **Mã nguồn:**
  - `js/staff-nav.js` (mới: `STAFF_TABS`, `staffTabs`, `initialStaffTab`);
  - `js/admin-shell.js` (một mục, `NAV_ALIAS.payroll = 'staff'`, `NAV_MERGED`, `navTarget`);
  - `pages/admin-staff.js`, `pages/admin-payroll.js` (hàng thẻ chung);
  - `admin/staff.html`, `admin/payroll.html` (tiêu đề).
- **Tài liệu:** FEATURE-073 (AC-073-10), US-073-1, screens-flows, tc-map.
- **Test:**
  - E2E "Nhân sự & lương gộp một mục: …";
  - bài "phân quyền: …" kiểm quản lý cửa hàng không có thẻ Lương.
