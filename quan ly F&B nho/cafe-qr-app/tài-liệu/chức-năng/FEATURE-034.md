# FEATURE-034 — Lãi / lỗ đơn giản & điểm hòa vốn

> **Nguồn:** skill `advanced-features` §4 F-034. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-31.

- **Status:** CONFIRMED (ADR-006 D-31) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN (MANAGER → 403).
- **Màn hình:** **Quản lý → Lãi / lỗ**
  - Bộ lọc: khoảng ngày, nhóm theo ngày / tháng, nút nhanh (tháng này, 30 ngày, năm nay).
  - Nhãn **"Ước tính"** cố định.
  - Các ô số: doanh thu thuần, giá vốn, lãi gộp (+ biên %), chi quỹ, cố định phân bổ, lợi nhuận hoạt động, hòa vốn mỗi ngày.
  - Biểu đồ cột tự vẽ (SVG) doanh thu thuần – giá vốn – chi phí, kèm đường hòa vốn khi nhóm theo ngày.
  - Bảng theo kỳ, chi quỹ theo danh mục.
  - Thẻ **Chi phí cố định / tháng** (thêm / sửa / xóa).
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

## Bằng chứng

- `tests/finance.test.js` → "Lãi / lỗ ước tính (F-034)": 4 test.
- `tests/finance-unit.test.js` → phân bổ cố định, công thức chỉ tiêu.
- E2E "trưởng ca + sổ quỹ…" (trang Lãi / lỗ: nhãn Ước tính, biểu đồ).
