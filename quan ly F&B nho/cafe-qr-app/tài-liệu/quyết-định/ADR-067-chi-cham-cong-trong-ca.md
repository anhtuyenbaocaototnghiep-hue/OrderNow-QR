# ADR-067 — Chỉ người đã được sắp ca mới chấm vào được

- **Trạng thái:** ACCEPTED (23/11/2026).
- **Chủ dự án duyệt:** "cái chấm công bạn coi lại người ko có sắp ca làm thì sẽ không thấy chỗ chấm và mã pin để nhập admin hoặc quản lý nhập ca thì mới xuất hiện và chấm công".
- **Bổ sung:** [ADR-030](ADR-030-cham-cong-tinh-luong.md) D-124 (màn chấm công chung bằng PIN), [ADR-031](ADR-031-nhac-va-bao-quen-cham-cong.md) (nhắc / báo quên chấm công). Chế độ chấm theo đăng nhập (`LOGIN`) không đổi.
- **Bối cảnh:**
  - Màn Chấm công ở máy quầy liệt kê **mọi** nhân viên đang hoạt động; ai cũng chạm tên mình, nhập PIN và vào ca được, kể cả hôm không có ca.
  - Giờ làm ngoài lịch (`OFF_SCHEDULE`) sau đó phải chờ quản lý xử lý ở trang Lương.
  - Chủ quán muốn chỉ người được chủ quán / quản lý sắp ca mới chấm vào được.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-259 | **Chỉ chấm VÀO được trong ca đã sắp ở Lịch làm tuần** (Quản lý → Nhân sự & chấm công → Lịch làm tuần; chủ quán / quản lý sắp ca như trước).<ul><li>**Khung được chấm vào:** từ **60 phút trước** giờ bắt đầu ca tới giờ kết thúc ca (không gồm giờ kết thúc). Ca qua đêm (giờ kết thúc ≤ giờ bắt đầu) tính sang ngày sau. Hàm `clockInOpen` trong `domain/payroll.js`.</li><li>**Màn Chấm công** (`GET /api/attendance/board`) chỉ có:<ul><li>người đang có khung được chấm vào (kèm giờ ca, ví dụ "Ca 08:00–14:00 · Chưa vào ca");</li><li>người **đang trong ca** (để ra ca), kể cả khi lịch đã bị xóa.</li></ul>Người không có ca lúc này không có tên, nên không thấy ô nhập PIN. Chưa ai có ca → "Chưa có ai có ca lúc này. Quản lý sắp ca ở …".</li><li>**Máy chủ chặn:** `POST /api/attendance/punch` với `IN` ngoài khung → `409 NOT_SCHEDULED`. Kiểm **trước** PIN: không thử PIN, không tính lần sai, không khóa PIN, không tạo chấm công.</li><li>**Chấm RA không cần lịch:** người đang làm luôn ra ca được.</li><li>**Không đổi:**<ul><li>quản lý thêm / sửa chấm công tay (có lý do);</li><li>nhân viên "Báo quên chấm công" (chờ quản lý duyệt);</li><li>chấm ra hộ khi đóng ca;</li><li>chế độ `LOGIN`;</li><li>luật tính giờ, lương.</li></ul></li></ul> |

## Phương án đã cân nhắc

- **Có ca bất kỳ trong ngày là được chấm vào cả ngày:** người có ca 18:00 chấm vào lúc 8:00 sáng được, trái ý "có sắp ca mới chấm". Bỏ: theo khung giờ của ca.
- **Cho chấm sớm 30 phút / 2 giờ:** 30 phút dễ làm người đến sớm chuẩn bị quầy phải đứng chờ; 2 giờ gần như không chặn gì. Chọn **60 phút**. Giờ được trả lương vẫn tính từ giờ bắt đầu ca (luật cũ, ADR-030), nên chấm sớm không làm tăng lương.
- **Kiểm PIN trước rồi mới kiểm ca:** người không có ca vẫn thử PIN được và có thể bị khóa PIN. Bỏ: kiểm ca trước.
- **Thêm công tắc ở Cài đặt "chỉ người có ca mới chấm công":** chủ quán muốn đây là cách làm của quán, thêm công tắc là thêm việc. Bỏ.

## Hệ quả

- **Mã nguồn:**
  - `domain/payroll.js`: `CLOCK_IN_EARLY_MINUTES`, `clockInOpen`;
  - `services/attendanceService.js`: `clockInWindows`, lọc người ở `board`, chặn `IN` ở `punch` (`409 NOT_SCHEDULED`);
  - `js/staff-pin.js`: dòng "Chỉ người có ca lúc này mới có tên…", giờ ca trên ô người, ô trống khi chưa ai có ca;
  - `css/base.css`: `.kiosk-note`, `.kiosk-empty`.
- **Dữ liệu:** không đổi (dùng bảng `Rosters` có sẵn).
- **Vận hành:**
  - **Phải khởi động lại máy chủ.**
  - Chủ quán / quản lý cần **sắp ca** cho nhân viên ở Lịch làm tuần. Chưa sắp ca thì màn Chấm công trống, không ai vào ca được.
- **Tài liệu:** BR-130, FEATURE-072 (quy tắc 10, AC-072-13, AC-072-14), US-072-1, api-contract, screens-flows, tc-map, skill `cham-cong-tinh-luong`.
- **Test:**
  - `attendance-kiosk.test.js` AC-072-13 (hàm `clockInOpen` + API);
  - E2E "chấm công nhiều người + lương" (AC-072-14);
  - các bài chấm vào cũ thêm bước sắp ca.
