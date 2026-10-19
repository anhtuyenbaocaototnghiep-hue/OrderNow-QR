# FEATURE-041 — Menu engineering

> **Nguồn:** skill `advanced-features` §4 F-041. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-30.

- **Status:** CONFIRMED (ADR-006 D-30) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:** ADMIN (MANAGER → 403).
- **Màn hình:** **Quản lý → Phân tích & menu engineering → tab Menu engineering**
  - Lọc ngày (mặc định 30 ngày), danh mục, nhóm.
  - Biểu đồ phân tán SVG: trục X số lượng bán, trục Y lãi gộp / món, hai đường trung vị chia 4 ô.
  - Bảng:
    - các cột SL, tỉ trọng, doanh thu, giá vốn (`*` = có phần ước tính), lãi gộp, lãi / món;
    - nút **Ghim món này** (nối F-017 — thêm vào danh sách ghim của mục gợi ý; chế độ AUTO chuyển thành BOTH);
    - nút **Tạo khuyến mãi** (mở form khuyến mãi, chọn sẵn món — nối F-016).
- **Dữ liệu:** không thêm bảng. Dùng `OrderItems.CogsAmount` (F-031); đơn `COMPLETED` theo `CompletedAt`.

## Quy tắc (D-30)

1. **Theo món:** chỉ dòng khách chọn — combo tính như một món, không tính thành phần.
   - Doanh thu = Σ SL × đơn giá dòng (đã gồm khuyến mãi dòng + tùy chọn).
   - Giá vốn = Σ `CogsAmount` đã chốt; dòng chưa có giá vốn → ước tính định lượng × giá vốn bình quân hiện tại (cờ `estimatedCogs`).
2. **Phân loại** theo trung vị số lượng và trung vị lãi gộp / món của các món bán ≥ 5 lần trong kỳ (bằng trung vị tính là "cao"):

   | Nhóm | Số lượng | Lãi / món | Gợi ý |
   | --- | --- | --- | --- |
   | `STAR` — Ngôi sao | cao | cao | Giữ giá, ưu tiên gợi ý / ghim |
   | `PLOWHORSE` — Ngựa kéo | cao | thấp | Xem lại định lượng (BOM) hoặc tăng giá nhẹ |
   | `PUZZLE` — Câu đố | thấp | cao | Đẩy khuyến mãi, ghim, gợi ý bán kèm |
   | `DOG` | thấp | thấp | Cân nhắc bỏ hoặc gộp combo |
   | `INSUFFICIENT` | < 5 lần | — | "Chưa đủ dữ liệu" |

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/admin/reports/menu-engineering?from&to&categoryId` | `{ items[{ menuItemId, name, categoryName, qty, revenue, cogs, margin, marginPerUnit, share, class, advice, estimatedQty }], medianQty, medianMarginPerUnit, estimatedCogs }` — không truyền ngày → 30 ngày |
| `POST /api/admin/reports/menu-engineering/pin { menuItemId }` | ghim món vào gợi ý (tối đa 20) |

## Acceptance Criteria

- AC-041-01: Seed 8 món với số liệu biết trước → đúng 4 nhóm; món < 5 lần bán → "Chưa đủ dữ liệu".
- AC-041-02: "Ghim món này" → món được ghim trong mục gợi ý.
- AC-041-03: Trưởng ca gọi → 403.

## Bằng chứng

- `tests/analytics.test.js`: unit phân loại + integration "menu engineering 30 ngày…".
- E2E "phân tích + dashboard…".
