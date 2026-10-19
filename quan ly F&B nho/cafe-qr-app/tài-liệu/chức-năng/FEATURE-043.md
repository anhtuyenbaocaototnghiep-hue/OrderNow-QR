# FEATURE-043 — Dashboard chủ quán ("Hôm nay")

> **Nguồn:** skill `advanced-features` §4 F-043. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-32; quyền `dashboard.view` (D-24).

- **Status:** CONFIRMED (ADR-006 D-32) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:**
  - ADMIN: đủ;
  - MANAGER: bản rút gọn, không có giá vốn / lãi;
  - STAFF: không được (403 / chuyển về quầy).
- **Màn hình:** `/admin/today` — mục đầu menu quản lý; nút "Hôm nay" trên thanh quầy của trưởng ca.
  - Nút "Tính lại hôm nay"; hiện giờ tính.
  - 5 thẻ lớn:
    - doanh thu hôm qua (so với cùng thứ tuần trước, số đơn, bill TB; quản lý thêm lãi gộp ước tính);
    - lệch két ca gần nhất;
    - kho cần chú ý (sắp hết / sắp hết hạn);
    - top 3 món;
    - hội viên mới + voucher đã dùng.
  - **Việc cần làm** (link tới màn xử lý): chi quỹ chờ duyệt, đơn đặt hàng đến hạn nhận, lô hết hạn còn hàng, kiểm kê quá 7 ngày.
  - Responsive ≤ 400 px, không cuộn ngang.
- **Dữ liệu:** migration `0032_tong_hop_ngay.sql`:
  - `DailySummaries(SummaryDate PK, RevenueNet, PaymentCount, OrderCount, AvgBill, Cogs, GrossProfit, CashVariance, ShiftCount, NewMembers, VouchersUsed, TopItemsJson, LowStockJson, ExpiringJson, PendingApprovals, ComputedAt)`.
- **Job:** `daily-summary` 00:30 (giờ quán) tính **hôm qua**. `MERGE` theo ngày → chạy lại không nhân đôi.

## Quy tắc

1. **Số liệu một ngày (giờ VN):**
   - doanh thu thuần, giá vốn: cùng công thức báo cáo lãi/lỗ (F-034);
   - số đơn đã thu; bill TB = Σ phải thu / số lượt thu;
   - lệch két = Σ chênh lệch các ca đóng trong ngày;
   - hội viên mới; voucher đã dùng; top 3 món theo số lượng;
   - ảnh chụp kho (sắp hết, lô ≤ 2 ngày) lúc tính.
2. **Đọc nhanh:**
   - `/api/dashboard/today` đọc dòng tổng hợp hôm qua và cùng thứ tuần trước; thiếu thì tính một lần rồi lưu.
   - "Việc cần làm" là vài phép đếm nhẹ, tính trực tiếp.
3. **Trưởng ca:** server bỏ `cogs`, `grossProfit`, tổng tiền chi quỹ chờ duyệt khỏi phản hồi (không chỉ ẩn ở giao diện).

## API

| Method & path | Quyền / ghi chú |
| --- | --- |
| `GET /api/dashboard/today` | `dashboard.view` → `{ date, full, yesterday, sameDayLastWeek, revenueChange, today, lastShift, todos{ pendingCash, posDue, expiredLots, stocktakeAgeDays, stocktakeOverdue } }` |
| `POST /api/dashboard/recompute` | `dashboard.view` — tính lại hôm nay (+ hôm qua nếu chưa có) |
| `POST /api/admin/jobs/daily-summary/run` | ADMIN — chạy job thủ công |

## Acceptance Criteria

- AC-043-01: Job chạy → có dòng tổng hợp hôm qua; số khớp báo cáo chi tiết (doanh thu thuần, lãi gộp = báo cáo lãi/lỗ cùng ngày).
- AC-043-02: Trưởng ca không thấy giá vốn / lãi; nhân viên → 403.
- AC-043-03: Trang mở trên điện thoại (390 px) không cuộn ngang.
- AC-043-04: Chạy job lại không nhân đôi dòng.

## Bằng chứng

- `tests/analytics.test.js` → "dashboard: …".
- `tests/finance.test.js`: ma trận quyền đủ mọi quyền, gồm `dashboard.view`.
- E2E "phân tích + dashboard…" (trưởng ca mở trên điện thoại).
