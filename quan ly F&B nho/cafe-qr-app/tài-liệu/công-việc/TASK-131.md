# TASK-131 — Chỉ người đã được sắp ca mới chấm vào được (F-072, ADR-067)

- **Status:** READY_FOR_REVIEW (23/11/2026)
- **Tài liệu:**
  - [FEATURE-072](../chức-năng/FEATURE-072.md) (quy tắc 10, AC-072-13, AC-072-14);
  - ADR [ADR-067](../quyết-định/ADR-067-chi-cham-cong-trong-ca.md) (D-259);
  - BR-130;
  - US-072-1.
- **Màn hình:** máy quầy → hộp Chấm công (SCR-10); Quản lý → Nhân sự & chấm công → Lịch làm tuần (không đổi)
- **Nguồn:** chủ dự án 23/11/2026: "cái chấm công bạn coi lại người ko có sắp ca làm thì sẽ không thấy chỗ chấm và mã pin để nhập admin hoặc quản lý nhập ca thì mới xuất hiện và chấm công".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-131-cham-cong-theo-ca`, chồng lên `task/TASK-130-chon-ban-thu-chung`
- **Kế hoạch:** [TASK-131-plan.md](../kế-hoạch/TASK-131-plan.md)

## Phạm vi

- **Khung được chấm vào:** từ 60 phút trước giờ bắt đầu ca (Lịch làm tuần) tới giờ kết thúc. Ca qua đêm tính sang ngày sau.
- **Màn Chấm công** chỉ có người có khung lúc này (ô ghi giờ ca) và người đang trong ca (để ra ca).
  - Có dòng nhắc "Chỉ người có ca lúc này mới có tên…".
  - Chưa ai có ca → ô báo chỗ sắp ca.
- **Máy chủ:** `IN` ngoài khung → `409 NOT_SCHEDULED`, kiểm trước PIN. Chấm ra không cần lịch.

**Không đổi:**
- chấm công tay của quản lý;
- báo quên chấm công;
- chấm ra hộ khi đóng ca;
- chế độ `LOGIN`;
- luật tính giờ / lương.

## Test

- **`attendance-kiosk.test.js` AC-072-13:**
  - hàm `clockInOpen` (biên 60 phút, giờ kết thúc, ca qua đêm);
  - người không có ca / ca còn 2 giờ không có tên, `409 NOT_SCHEDULED` không tính lần sai PIN;
  - ca sau 45 phút có tên, chấm vào được;
  - xóa lịch khi đang làm vẫn ra ca được.
- **E2E "chấm công nhiều người + lương" (AC-072-14):**
  - dòng nhắc;
  - Bảo có ca → ô "Ca … · Chưa vào ca";
  - Hà (đứng máy, không có ca) không có ô.
- **Bài cũ thêm bước sắp ca:** AC-072-03, AC-072-08 (xóa lịch tạm ở cuối), payroll-guard.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** khởi động lại máy chủ; chủ quán sắp ca cho nhân viên ở Lịch làm tuần.
