# TASK-131-plan — Chỉ chấm vào trong ca đã sắp (F-072, ADR-067)

## Mục tiêu

Người không được sắp ca không thấy mình ở màn Chấm công và không chấm vào được. Chủ quán / quản lý sắp ca ở Lịch làm tuần thì người đó mới hiện và chấm vào được.

## Điểm chạm

| Tầng | Tệp | Thay đổi |
| --- | --- | --- |
| Domain | `src/domain/payroll.js` | `CLOCK_IN_EARLY_MINUTES = 60`, `clockInOpen(roster, now)` — dùng `rosterWindow` (ca qua đêm) |
| Service | `src/services/attendanceService.js` | `clockInWindows(now)` đọc lịch hôm qua / hôm nay / ngày mai; `board` lọc người (có khung hoặc đang trong ca); `punch` chặn `IN` ngoài khung → `409 NOT_SCHEDULED` **trước** `verifyPin` |
| Route | `src/routes/payroll.js` | không đổi (`board`, `punch` giữ đường dẫn và dạng trả về) |
| Giao diện | `js/staff-pin.js`, `css/base.css` | dòng nhắc, giờ ca trên ô người, ô trống khi chưa ai có ca |
| CSDL | — | không migration (bảng `Rosters` có sẵn) |
| Realtime | — | không đổi |

## Rủi ro

- **Test cũ cho người chấm vào mà không có lịch:**
  - `attendance-kiosk` (AC-072-03);
  - `attendance-missed` (AC-072-08 thử khóa PIN bằng `IN`);
  - `payroll-guard` (quản lý chấm vào);
  - E2E "chấm công nhiều người + lương".

  Cách xử lý: thêm bước sắp ca quanh giờ hiện tại. AC-072-08 xóa lịch tạm ở cuối bài để không lẫn vào bài nhắc (AC-072-09).
- **Dữ liệu thật:** sau khi cập nhật, chưa sắp ca thì không ai vào ca được → báo chủ quán sắp ca trước khi khởi động lại.
- **Giờ quán:** test dựng lịch theo giờ hiện tại có thể qua 0 giờ → lịch qua đêm (giờ kết thúc ≤ bắt đầu) được `rosterWindow` hiểu đúng; khung đọc thêm lịch ngày mai.

## Kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- Khởi động lại máy chủ của quán (đổi máy chủ).
