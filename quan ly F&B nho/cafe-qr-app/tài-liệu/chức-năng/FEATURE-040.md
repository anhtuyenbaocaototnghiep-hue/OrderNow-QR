# FEATURE-040 — Thực đơn theo mùa / khung giờ tự động

> **Nguồn:** skill `advanced-features` §4 F-040. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md).

- **Status:** CONFIRMED (ADR-006) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN cài lịch; khách thấy menu theo lịch; STAFF vẫn bán món đang ẩn.
- **Màn hình:**
  - **S-34 Quản lý → "Lịch thực đơn & thời gian pha"**, tab Lịch thực đơn:
    - danh sách lịch: khoảng ngày, thứ, giờ, món/danh mục kèm nhãn Hiện/Ẩn, công tắc Bật;
    - form thêm/sửa: mỗi món/danh mục chọn "— / Hiện / Ẩn";
    - nút **Xem trước menu lúc…** (chọn ngày giờ → món hiện ✓ / ẩn ✗).
  - **Menu khách:** món ngoài lịch không hiện. Trang tự tải lại menu đúng lúc lịch đổi (`nextChangeAt`).
  - **Quầy** (Bán mang đi, Gọi món tại bàn): món đang ẩn với khách có nhãn **"Ngoài lịch"**, vẫn bán được.
- **Dữ liệu:** migration `0016_lich_thuc_don.sql`:
  - `MenuSchedules(Name, StartDate, EndDate, DaysOfWeekMask, StartTime, EndTime, IsActive, SourceCategoryId)`;
  - `MenuScheduleItems(ScheduleId, MenuItemId | CategoryId, Mode SHOW|HIDE)`.
- **Khái quát F-020:**
  - Migration chuyển giờ bán danh mục có sẵn thành lịch SHOW "Giờ bán — <danh mục>" (`SourceCategoryId`).
  - Khi quản lý sửa giờ bán ở Thực đơn → Sửa danh mục, lịch tương ứng được đồng bộ (`scheduleRepo.syncCategorySchedule`); bỏ giờ thì xóa lịch.
  - Cột `Categories.SellFrom/SellTo` giữ nguyên.

## Quy tắc

1. **Khi nào món hiện:** khi (không thuộc lịch SHOW nào đang bật) **hoặc** (thuộc ≥ 1 lịch SHOW đang hiệu lực), **và** không thuộc lịch HIDE đang hiệu lực. Mục tiêu là cả danh mục thì áp cho mọi món trong danh mục.
2. **Lịch hiệu lực khi:**
   - đang bật;
   - trong khoảng ngày (trống = không giới hạn);
   - đúng thứ (bit0 = CN);
   - trong khung giờ `[bắt đầu, kết thúc)`; qua nửa đêm được; trống = cả ngày.

   Giờ theo giờ quán (UTC+7).
3. **Áp cho:** menu khách, mục Gợi ý, gửi đơn của khách (`409 ITEM_UNAVAILABLE` "… hiện ngoài giờ bán") và gọi lại đơn (F-045).
4. **Không áp cho quầy:** bán mang đi, gọi món tại bàn, menu có Bearer (`hiddenBySchedule: true`).
5. Lịch sinh từ danh mục chỉ sửa ở trang Thực đơn (trang Lịch thực đơn không cho sửa/xóa).

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/menu` | Thêm `nextChangeAt` (ISO, mốc lịch đổi gần nhất trong 8 ngày); món quầy có `hiddenBySchedule` |
| `GET` / `POST /api/admin/menu-schedules` | Body: `{ name, startDate?, endDate?, daysOfWeekMask, startTime?, endTime?, isActive, targets[{ menuItemId \| categoryId, mode }] }` |
| `PUT` / `DELETE /api/admin/menu-schedules/{id}` · `PATCH …/active` | Sửa / xóa / bật tắt → phát `menu.updated` |
| `GET /api/admin/menu-schedules/preview?at=YYYY-MM-DDTHH:MM` | Menu khách lúc đó (giờ quán) |

## Acceptance Criteria

- AC-040-01: Lịch sáng 05:30–10:00 cho Bánh mì: 06:00 thấy, 11:00 không.
- AC-040-02: Lịch theo mùa 01/12–31/12: ngoài khoảng ẩn.
- AC-040-03: Món vừa SHOW (lịch A) vừa HIDE (lịch B) đang hiệu lực → ẩn.
- AC-040-04: Khách gửi đơn có món ngoài lịch → 409; quầy bán mang đi món đó → 201.
- AC-040-05: Giờ bán danh mục (F-020) vẫn chạy như cũ (test F-020 cũ PASS không sửa).
- AC-040-06: Tạo lịch thực đơn không có món / danh mục mục tiêu, hoặc chỉ có giờ bắt đầu mà không có giờ kết thúc → 400. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/phase4-unit.test.js` → "Lịch thực đơn": 5 unit test, đồng hồ giả lập.
- `tests/phase4.test.js` → "Thực đơn theo lịch (F-040)": 3 test.
- `tests/sales.test.js` → giờ bán (F-020): PASS.
