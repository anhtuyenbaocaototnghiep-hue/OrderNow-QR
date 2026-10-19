# TASK-036 — Thực đơn theo mùa / khung giờ tự động
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-040 (AC-040-01…05)
Nguồn: skill `advanced-features` §4 F-040 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Quản lý đặt lịch hiện / ẩn món hoặc cả danh mục theo khoảng ngày, thứ trong tuần, khung giờ. Menu khách tự đổi đúng giờ; quầy vẫn bán được món đang ẩn với khách. Khái quát giờ bán danh mục (F-020) thành lịch mà hành vi cũ không đổi.

## Phạm vi
- Migration `0016_lich_thuc_don.sql` (`MenuSchedules`, `MenuScheduleItems`; giờ bán danh mục có sẵn chuyển thành lịch SHOW "Giờ bán — <danh mục>", cột `SourceCategoryId`).
- Backend:
  - hàm thuần `src/domain/menuSchedule.js` (`scheduleInEffect`, `buildVisibility`, `nextChangeAt`; giờ quán UTC+7);
  - `scheduleService` / `scheduleRepo` (`syncCategorySchedule` khi quản lý sửa giờ bán danh mục);
  - áp lịch cho menu khách, mục Gợi ý, gửi đơn của khách (`409 ITEM_UNAVAILABLE`) và gọi lại đơn (F-045); menu có Bearer trả `hiddenBySchedule`;
  - route `GET`/`POST /api/admin/menu-schedules`, `PUT`/`DELETE …/:id`, `PATCH …/:id/active`, `GET …/preview?at=`; phát `menu.updated`.
- UI:
  - trang mới `/admin/menu-schedules` "Lịch thực đơn & thời gian pha" (S-34), tab Lịch thực đơn, nút **Xem trước menu lúc…**;
  - menu khách tự tải lại theo `nextChangeAt`;
  - quầy (Bán mang đi, Gọi món tại bàn): nhãn "Ngoài lịch".

## Phụ thuộc
TASK-031 (giờ bán theo danh mục — F-020), TASK-035 (gọi lại đơn áp lịch).

## Validation
`phase4-unit.test.js` → "Lịch thực đơn (F-040)" (5 test, đồng hồ giả lập), `phase4.test.js` → "Thực đơn theo lịch (F-040)" (3 test), `sales.test.js` (giờ bán F-020) PASS không sửa; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-040, ADR-006); hướng dẫn `chức-năng-mới/14-gọi-lại-đơn-lịch-thực-đơn-thời-gian-chờ.md`.
