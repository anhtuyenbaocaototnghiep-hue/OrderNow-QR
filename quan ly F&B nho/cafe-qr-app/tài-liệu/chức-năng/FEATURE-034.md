# FEATURE-034 — Lãi / lỗ đơn giản & điểm hòa vốn

> **Nguồn:** skill `advanced-features` §4 F-034. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-31.

- **Status:** CONFIRMED (ADR-006 D-31) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN (MANAGER → 403).
- **Màn hình:** **Quản lý → Lãi / lỗ** (trình bày lại cho dễ hiểu — [TASK-080](../công-việc/TASK-080.md), 02/11/2026)
  - Nút chọn nhanh: Hôm nay, Tuần này, Tháng này (mặc định), Tháng trước, Năm nay; "Chọn ngày khác" mở ô từ ngày / đến ngày. Khoảng ≤ 62 ngày xem theo ngày, dài hơn theo tháng.
  - Câu trả lời: "Quán đang lãi / lỗ X" + một câu giải thích + so với khoảng trước cùng độ dài.
  - **Tiền đi đâu:** Tiền bán được (doanh thu thuần) − Nguyên liệu (giá vốn) − Chi phí khác (chi quỹ) − Chi phí cố định = Lãi / Lỗ (lợi nhuận hoạt động); mỗi dòng có câu giải thích và thanh ngang.
  - **Mỗi ngày cần bán bao nhiêu để không lỗ?** (hòa vốn) + thanh hôm nay + số ngày đạt trong khoảng.
  - **Cần để ý:** lưu ý tự phát hiện (xem TASK-080).
  - Thẻ **Chi phí cố định hằng tháng** (thêm nhanh: Tiền mặt bằng, Lương nhân viên, Internet; thêm / sửa / xóa).
  - "Xem chi tiết": biểu đồ tự vẽ (SVG) kèm đường mức cần bán khi xem theo ngày, bảng theo kỳ, chi quỹ theo danh mục.
  - Dòng cuối: số liệu là ước tính.
- **Dữ liệu:** migration `0028_lai_lo.sql`: `FixedCosts(Name, MonthlyAmount ≥ 0, EffectiveFrom DATE, EffectiveTo NULL)`.

## Công thức (ADR-006 D-31 — luôn là ước tính)

| Chỉ tiêu | Cách tính (theo ngày giờ VN) |
| --- | --- |
| Doanh thu gộp | Σ `Payments.SubtotalAmount` (lượt thu cũ chưa có thì lấy `AmountDue`) theo ngày thu |
| Giảm giá | Doanh thu gộp − Σ `AmountDue` (khuyến mãi + hội viên + giảm tay + làm tròn) |
| Hoàn tiền | Σ `Refunds.Amount` theo ngày hoàn |
| Doanh thu thuần | Σ `AmountDue` − hoàn tiền |
| Giá vốn (COGS) | Đơn `COMPLETED` theo ngày hoàn tất: Σ `OrderItems.CogsAmount` (F-031) |
| Lãi gộp | Doanh thu thuần − COGS; biên % = lãi gộp ÷ doanh thu thuần |
| Chi quỹ | Σ khoản chi `APPROVED` thuộc danh mục `IsExpense` (F-033) — "Nộp tiền về két tổng" không tính |
| Cố định phân bổ | Mỗi ngày: Σ (số tiền tháng ÷ số ngày của tháng đó) các khoản đang hiệu lực |
| Lợi nhuận hoạt động | Lãi gộp − chi quỹ − cố định phân bổ |
| Hòa vốn / ngày | Cố định bình quân / ngày × doanh thu thuần ÷ lãi gộp (= cố định / ngày ÷ biên %); lãi gộp ≤ 0 → không tính |
| Hàng mất (`lossValue`, TASK-080) | Σ (−Delta × giá) các dòng `InventoryTransactions.Type = 'ADJUST'` trong kỳ (điều chỉnh tay, hao hụt, lệch kiểm kê; thừa bù trừ), ≥ 0 — **chỉ để nhắc, không trừ vào lợi nhuận** |

Ghi chú về giá vốn:

- Đơn chưa có giá vốn chốt (trước F-031, hoặc chưa biết giá lúc hoàn tất) → ước tính Σ định lượng đã giữ (`OrderIngredients`) × giá vốn bình quân **hiện tại**.
- Số dòng món ước tính trả trong `estimatedCogsRows`; giao diện hiện cảnh báo.
- Đơn hoàn tiền kèm hủy (`VOIDED`) không tính giá vốn.

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/admin/reports/pnl?from&to&groupBy=day\|month` | `{ revenueGross, discounts, refunds, revenueNet, cogs, grossMargin, grossMarginPct, cashExpenses, fixedCostsAllocated, fixedCostsPerDay, operatingProfit, breakEvenPerDay, estimatedCogsRows, expensesByCategory[], series[], note: "ước tính" }`. Tối đa ~13 tháng. Sai khoảng → 400 |
| `GET/POST /api/admin/fixed-costs` · `PUT/DELETE …/{id}` | `{ name, monthlyAmount, effectiveFrom, effectiveTo? }`; ngày kết thúc trước ngày bắt đầu → 400 |

## Acceptance Criteria

- AC-034-01: Seed 1 ngày với các số sau:
  - thu 2.000.000, hoàn 100.000, COGS 600.000, chi quỹ 150.000, cố định 30.000.000/tháng (tháng 30 ngày);
  - kết quả: thuần 1.900.000, lãi gộp 1.300.000 (68,42 %), cố định 1.000.000, lợi nhuận 150.000, hòa vốn 1.461.538/ngày.
- AC-034-02: Nhóm theo tháng phân bổ đủ 30.000.000 cho tháng 9; khoản hết hiệu lực giữa tháng chỉ tính tới ngày kết thúc.
- AC-034-03: Đơn chưa có giá vốn chốt → ước tính theo định lượng × giá vốn hiện tại, `estimatedCogsRows` > 0.
- AC-034-04: MANAGER gọi → 403.
- AC-034-05: Báo cáo lãi / lỗ với `from > to` → 400. _(bổ sung — TASK-057, 20/10/2026)_
- AC-034-06: Thêm chi phí cố định có ngày kết thúc trước ngày bắt đầu → 400. _(bổ sung — TASK-057, 20/10/2026)_
- AC-034-07: Báo cáo trả `lossValue` = hàng mất ròng trong kỳ (chỉ dòng điều chỉnh tồn; thừa bù trừ; hàng bán không tính), không làm đổi lợi nhuận hoạt động. _(TASK-080, 02/11/2026)_
- AC-034-08: Trang hiện câu "Quán đang lãi / lỗ X" kèm giải thích và so với khoảng trước; "Tiền đi đâu" với 4 dòng và dòng kết quả; mức cần bán mỗi ngày, hôm nay bán được bao nhiêu và còn thiếu bao nhiêu, số ngày đạt; biểu đồ và bảng nằm trong "Xem chi tiết" (thu gọn mặc định); màn 390 px không cuộn ngang. _(TASK-080)_
- AC-034-09: Thẻ "Cần để ý" hiện đúng khi: chưa khai chi phí cố định; lương có trong cả Sổ quỹ và chi phí cố định; có hàng hao hụt; khi đã khai chi phí cố định thì hiện mức cần bán, chưa khai thì hướng dẫn khai. Nút thêm nhanh điền sẵn tên khoản. _(TASK-080)_

## Bằng chứng

- `tests/finance.test.js` → "Lãi / lỗ ước tính (F-034)": 4 test.
- `tests/finance-unit.test.js` → phân bổ cố định, công thức chỉ tiêu.
- E2E "trưởng ca + sổ quỹ…" (trang Lãi / lỗ: dòng ước tính, biểu đồ trong "Xem chi tiết").
- E2E "lãi / lỗ dễ hiểu…" (AC-034-08, AC-034-09) — số liệu giả lập qua route để kiểm từng câu chữ.
