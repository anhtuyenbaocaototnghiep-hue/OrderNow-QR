# FEATURE-042 — Giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn

> **Nguồn:** skill `advanced-features` §4 F-042. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) (dự báo dùng cách D-22).

- **Status:** CONFIRMED · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:** ADMIN.
- **Màn hình:** **Quản lý → Phân tích & menu engineering**, 4 tab:
  - **Giờ cao điểm:** bảng HTML 7 × 24 tô màu theo mức (không thư viện), ô đậm nhất viền nổi; chọn số đơn / doanh thu.
  - **Dự báo doanh thu:** đường doanh thu thuần 28 ngày qua + đường dự báo 7 ngày (nét đứt), dải ± 1 độ lệch chuẩn (SVG tự vẽ — ADR-006, không Chart.js); bảng từng ngày.
  - **So sánh kỳ:** tuần / tháng, kỳ này hoặc N kỳ trước.
    Thẻ: doanh thu thuần, số đơn, bill trung bình, hội viên mới, giá vốn / doanh thu; ▲▼ % thay đổi.
  - **Theo bàn:** số lượt, doanh thu, thời gian ngồi trung bình, doanh thu / giờ ngồi; cờ đỏ "Ngồi lâu – doanh thu thấp".
- **Dữ liệu:** không thêm bảng.

## Quy tắc

1. **Heatmap** (giờ quán UTC+7):
   - số đơn = đơn tạo (không tính đơn hủy) theo `CreatedAt`;
   - doanh thu = `Payments.AmountDue` theo giờ thu;
   - hàng 0 = Thứ Hai.
2. **Dự báo:**
   - mỗi ngày tới = trung bình có trọng số 4 cùng thứ gần nhất (0,4 · 0,3 · 0,2 · 0,1) trên doanh thu thuần (thu − hoàn);
   - ngày trước lần thu đầu tiên của quán không tính; ngày không bán = 0;
   - khoảng = ± 1 độ lệch chuẩn của các mẫu.
3. **So sánh kỳ:**
   - tuần bắt đầu Thứ Hai;
   - kỳ đang diễn ra tính tới hôm nay và so với **cùng số ngày đầu** của kỳ trước (`partial: true`);
   - % thay đổi = (kỳ này − kỳ trước) / kỳ trước, kỳ trước = 0 → không tính;
   - giá vốn / doanh thu so bằng chênh điểm %.
4. **Theo bàn:**
   - phiên đã đóng có thu tiền trong kỳ (theo `ClosedAt`); thời gian ngồi = `ClosedAt − OpenedAt`; doanh thu thuần của phiên;
   - cờ khi doanh thu / giờ ngồi **dưới** trung vị VÀ thời gian ngồi trung bình **từ** trung vị trở lên ("ngồi lâu").

## API (ADMIN)

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/admin/reports/heatmap?from&to&metric=orders\|revenue` | `{ matrix[7][24], max }` (mặc định 30 ngày) |
| `GET /api/admin/reports/revenue-forecast?days=7` | `{ today, history[{ date, revenue }], forecast[{ date, forecast, low, high, samples }] }` (1–14 ngày) |
| `GET /api/admin/reports/compare?period=week\|month&offset=0` | `{ current, previous, change, partial }` |
| `GET /api/admin/reports/tables?from&to` | `{ tables[{ code, name, sessions, revenue, avgMinutes, revenuePerHour, flag }], medianRevenuePerHour, medianMinutes }` |

## Acceptance Criteria

- AC-042-01: Seed đơn 10–11 h Thứ Bảy dày → ô (T7, 10 h) đậm nhất.
- AC-042-02: So sánh tuần trước (`offset = 1`): doanh thu thuần kỳ này và kỳ trước bằng đúng Σ số phải thu (trừ hoàn tiền) của các lượt thu trong từng tuần; % thay đổi = (kỳ này − kỳ trước) ÷ kỳ trước × 100 (kỳ trước = 0 → không tính); tuần đã qua → `partial = false`; so sánh tháng hiện tại → kỳ này tính tới hôm nay. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-042-03: Dự báo hôm nay = WMA 4 cùng thứ (100k, 200k, 300k, 400k → 200k).
- AC-042-04: Bàn 3 ngồi 3 giờ doanh thu 60.000đ → bị gắn cờ.
- AC-042-05: Xem giờ cao điểm với `from > to` → 400. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/analytics.test.js`: unit heatmap / WMA / cờ bàn + integration 4 test.
- E2E "phân tích + dashboard…".
