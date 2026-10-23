# FEATURE-029 — Dự báo nhập hàng

> **Nguồn:** skill `advanced-features` §4 F-029. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-22.

- **Status:** CONFIRMED (ADR-006 D-22) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN xem đề xuất, tạo PO; job 02:00 tính dự báo; job 06:05 cảnh báo quầy.
- **Màn hình:** **Quản lý → Nhà cung cấp & đặt hàng → tab "Đề xuất nhập hàng"**:
  - bảng: khả dụng, đang về, nhu cầu đến ngày giao, an toàn, **đề xuất (gói)**, ngày dự kiến hết, nhà cung cấp;
  - dòng đỏ = sẽ hết trước ngày giao; "Không đủ dữ liệu" khi chưa có lịch sử;
  - lọc theo nhà cung cấp, ép ngày giao;
  - tick → **Tạo đơn đặt hàng từ dòng đã chọn** (mỗi nhà cung cấp một PO nháp);
  - bấm tên → **biểu đồ SVG** 4 tuần đã dùng + 14 ngày dự báo; nút **Tính lại dự báo**.
- **Dữ liệu:** migration `0024_du_bao_nhap.sql`:
  - `DemandForecasts(IngredientId, ForecastDate, ForecastQty, Samples, ComputedAt)`;
  - Settings `forecast.safety_percent = 20`.
- **Job:**
  - `demand-forecast` 02:00 (idempotent, MERGE);
  - `runout-alert` 06:05 → `inventory.runout` tới quầy.

## Quy tắc (D-22)

1. **Tiêu thụ** = Σ `DEDUCT` + `PREP_OUT` theo **ngày quán**. Ngày không có lượt thu nào = quán đóng cửa → bỏ, chuẩn hóa lại trọng số.
2. **Dự báo một ngày** = trung bình có trọng số cùng thứ trong 4 tuần gần nhất đã qua (0,4 / 0,3 / 0,2 / 0,1, gần nhất nặng nhất) × (1 + hao hụt định mức — F-032). Tính 14 ngày tới.
3. **Ngày giao kế tiếp:** theo lịch giao của nhà cung cấp ưu tiên (mặc định ngày mai), hoặc ép tay. Tầm nhìn = đến ngày giao + thời gian giao.
4. **Đề xuất** = max(0, nhu cầu + an toàn (20 % nhu cầu) − khả dụng − đang về (PO `SENT`/`PARTIAL` chưa nhận)), làm tròn **lên** theo gói.
   - **Ngày dự kiến hết** = ngày đầu tiên dự báo cộng dồn vượt khả dụng.
5. **Chưa có lịch sử** → "Không đủ dữ liệu", không đề xuất.

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/admin/inventory/replenishment?nextDeliveryDate=&supplierId=` | Mỗi nguyên liệu: `available, incoming, demand, safety, suggestBase, suggestPacks, runOutDate, runsOutBeforeDelivery, enoughData, supplier` |
| `POST /api/admin/purchase-orders/from-suggestion { supplierId, lines[{ ingredientId, packs }] }` | PO nháp |
| `GET /api/admin/inventory/forecast/{ingredientId}` | `{ history[28 ngày], forecast[14 ngày] }` cho biểu đồ |
| `POST /api/admin/jobs/demand-forecast/run` | Tính lại ngay |

## Acceptance Criteria

- AC-029-01: Tiêu thụ 4 tuần có thứ Bảy cao (300) → dự báo thứ Bảy 300 > thứ Ba 100.
- AC-029-02: Khả dụng 1.000, nhu cầu tới ngày giao 3 ngày × 500 = 1.500, gói 1.000 → đề xuất gốc = 1.500 + 20 % × 1.500 − 1.000 = 800, quy ra 1 gói (làm tròn lên); nguyên liệu được đánh dấu sẽ hết trước ngày giao. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-029-03: Có PO đang về 800 → đề xuất giảm 800.
- AC-029-04: Nguyên liệu chưa có lịch sử → "Không đủ dữ liệu", không đề xuất.

## Bằng chứng

- `tests/inventory-unit.test.js` → "Dự báo nhập hàng": 3 test.
- `tests/inventory2.test.js` → "Dự báo nhập hàng (F-029)".
- E2E "kho nâng cao…" (tab Đề xuất nhập hàng).
