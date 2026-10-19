# TASK-054 — Dashboard chủ quán ("Hôm nay")
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-043 (AC-043-01…04)
Nguồn: skill `advanced-features` §4 F-043 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 D-32, quyền `dashboard.view` (D-24) · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Một màn "Hôm nay" mở nhanh trên điện thoại: doanh thu hôm qua so với cùng thứ tuần trước, lệch két ca gần nhất, kho cần chú ý, top 3 món, hội viên mới, và danh sách việc cần làm có link tới màn xử lý. Trưởng ca xem bản rút gọn (không có giá vốn / lãi); nhân viên không xem được.

## Phạm vi
- Migration `0032_tong_hop_ngay.sql` (`DailySummaries(SummaryDate PK, …)`).
- Backend:
  - `dashboardService` / `dashboardRepo` (doanh thu thuần, giá vốn cùng công thức lãi / lỗ F-034; ảnh chụp kho lúc tính; "Việc cần làm" đếm trực tiếp);
  - route `GET /api/dashboard/today`, `POST /api/dashboard/recompute` (quyền `dashboard.view`); với trưởng ca server bỏ `cogs`, `grossProfit`, tổng tiền chi chờ duyệt khỏi phản hồi.
- Job `daily-summary` 00:30 tính **hôm qua**, MERGE theo ngày (chạy lại không nhân đôi); chạy thủ công `POST /api/admin/jobs/daily-summary/run`.
- UI: trang mới `/admin/today` — mục đầu menu quản lý, mục "Hôm nay" trên thanh quầy của trưởng ca; nút "Tính lại hôm nay"; 5 thẻ + "Việc cần làm"; responsive ≤ 400 px, không cuộn ngang.

## Phụ thuộc
TASK-037 (bộ lập lịch), TASK-045 (quyền `dashboard.view`), TASK-048 (công thức lãi / lỗ), TASK-046 (chi quỹ chờ duyệt), TASK-042, TASK-043 (lô hết hạn, PO đến hạn).

## Validation
`analytics.test.js` → "dashboard: job 00:30 tạo dòng tổng hợp hôm qua…" (số khớp báo cáo, trưởng ca không thấy lãi, nhân viên → 403); `finance.test.js` → ma trận quyền gồm `dashboard.view`; E2E "phân tích + dashboard…" (trưởng ca mở trên điện thoại không cuộn ngang); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-043, ADR-006); hướng dẫn `chức-năng-mới/24-màn-hôm-nay.md`.
