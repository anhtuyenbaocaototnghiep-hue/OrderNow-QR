# TASK-037 — Thời gian chờ ước tính + bộ lập lịch job nền
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-025 (AC-025-01…05)
Nguồn: skill `advanced-features` §4 F-025 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-18 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Khách thấy món dự kiến xong sau bao lâu (giỏ, theo dõi đơn); quầy thấy độ dài hàng chờ. Task này cũng dựng **bộ lập lịch job nền dùng chung** cho mọi job của giai đoạn 4–8 (một bộ lập lịch, khóa trong DB, ghi `JobRuns`).

## Phạm vi
- Migration `0017_thoi_gian_cho.sql` (`MenuItems.PrepSeconds`, `ItemPrepStats`, `JobRuns`; Settings `kitchen.base_seconds`, `kitchen.parallelism`, `eta.spread_percent`, `eta.default_item_seconds`).
- Backend:
  - hàm thuần `src/domain/eta.js` (thời gian chuẩn: quản lý nhập > trung vị ≥ 3 mẫu > 180 giây; ETA ±25 %);
  - `etaService` / `etaRepo` (cache hàng chờ 10 giây, xóa khi đơn được gửi / tiếp nhận / hoàn tất / hủy);
  - route `GET /api/queue/eta`, `GET /api/sessions/:id/eta`, `GET /api/admin/prep-stats`, `GET /api/admin/jobs`, `POST /api/admin/jobs/:name/run`; cài đặt bếp qua `PUT /api/admin/settings`.
- Job:
  - `src/jobs/scheduler.js`: một `setInterval`, khóa `Settings job.<name>.running` (hết hạn 30 phút), ghi `JobRuns` (`SKIPPED` khi đang có lần khác chạy), idempotent; `JOBS_ENABLED=false` trong test / E2E, test gọi `runJob(name)`;
  - danh sách job ở `src/jobs/index.js`; job của task này: `prep-stats` 02:00 (MERGE trung vị 30 ngày).
- UI:
  - giỏ + theo dõi đơn: dòng "⏱ …";
  - cột **Mới** ở quầy: "Hàng chờ: …";
  - Thực đơn → Sửa món: ô "Thời gian pha chuẩn (giây)";
  - Lịch thực đơn & thời gian pha → tab "Thời gian pha & hàng chờ", nút **Tính lại thống kê**.

## Phụ thuộc
TASK-012, TASK-013 (tiếp nhận / hoàn tất), TASK-036 (trang Lịch thực đơn & thời gian pha).

## Validation
`phase4-unit.test.js` → "Thời gian chờ (F-025)" (3 test), `phase4.test.js` → "Thời gian chờ ước tính (F-025)" (2 test, gồm job chạy lại không nhân đôi và hai lần cùng lúc → một `SKIPPED`), E2E "gọi lại đơn lần trước + thời gian chờ…"; chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-025, ADR-006); hướng dẫn `chức-năng-mới/14-gọi-lại-đơn-lịch-thực-đơn-thời-gian-chờ.md`.
