# FEATURE-030 — Nhà cung cấp & đơn đặt hàng (PO)

> **Nguồn:** skill `advanced-features` §4 F-030. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md).

- **Status:** CONFIRMED (ADR-006) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** ADMIN quản lý nhà cung cấp + PO; STAFF nhận hàng theo PO (ma trận D-24).
- **Màn hình:**
  - **S-35 Quản lý → "Nhà cung cấp & đặt hàng":**
    - tab **Nhà cung cấp**: liên hệ, ngày giao trong tuần, thời gian giao, nguyên liệu cung cấp (gói, giá gần nhất, ★ ưu tiên);
    - tab **Đơn đặt hàng**: nháp → **Gửi & in** → nhận từng phần → đủ; Hủy;
    - tab **Giá & giao hàng**: lịch sử giá, tỉ lệ đúng hạn / đủ hàng.
  - **Trang in** `/admin/purchase-orders/{id}/print`: in / lưu PDF, **Chép nội dung** gửi Zalo.
  - **Quầy → Kho & sơ chế → Nhận hàng:** chọn PO đang chờ, điền sẵn số gói còn thiếu, sửa thực nhận, giá, hạn dùng → **Nhập kho**.
- **Dữ liệu:** migration `0023_nha_cung_cap.sql`:
  - `Suppliers`;
  - `SupplierIngredients(PackUnitCode, PackSize, LastPrice, IsPreferred)`;
  - `PurchaseOrders(Status DRAFT|SENT|PARTIAL|RECEIVED|CANCELLED, ExpectedDate, SentAt, ReceivedAt)`;
  - `PurchaseOrderLines(OrderedPacks, OrderedBaseQty, ReceivedBaseQty, UnitPrice)`;
  - `SupplierPriceHistory`;
  - `StockReceipts.PoId/SupplierId`, `StockReceiptLines.PoLineId/ExpiryDate/LotId`.
- **SP:** `sp_ReceiveStock @PoId, @SupplierId, @ConfirmOver`.

## Quy tắc

1. **Gói:** gói đặt hàng theo đơn vị (vd. "hộp1l"); không ghi `PackSize` → tự quy đổi theo `Units` (F-031). Mỗi nguyên liệu tối đa **một** nhà cung cấp ưu tiên.
2. **Sửa PO:** chỉ khi **DRAFT**. **Gửi** = `SENT` (in / PDF / Zalo — không tích hợp EDI).
3. **Nhận hàng** (`SENT` / `PARTIAL`): cộng `ReceivedBaseQty`, chuyển trạng thái:
   - đủ mọi dòng → `RECEIVED`;
   - chưa đủ → `PARTIAL`.

   Cùng transaction: cộng tồn, giá vốn bình quân, lô (F-028), lịch sử giá, `LastPrice`.
4. **Nhận vượt** số đặt → `409 OVER_RECEIPT` (kèm tên), trừ khi `confirmOver = true`.
5. **Hủy:**
   - PO đã nhận một phần / đủ → `409 PO_HAS_RECEIPTS`;
   - PO nháp / đã gửi → `CANCELLED`.
6. **Báo cáo:**
   - đúng hạn = nhận đủ trước / đúng `ExpectedDate`;
   - đủ hàng = Σ nhận / Σ đặt.

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET` / `POST /api/admin/suppliers` · `PUT /api/admin/suppliers/{id}` | ADMIN | Kèm `items[]` |
| `GET /api/admin/purchase-orders?status=` · `GET` / `POST` / `PUT …/{id}` | ADMIN | Dòng `{ ingredientId, orderedPacks, packUnitCode?, packSize?, unitPrice? }` |
| `POST /api/admin/purchase-orders/{id}/send` · `…/cancel` · `…/receive` | ADMIN | |
| `GET /api/receiving/purchase-orders` · `GET …/{id}` · `POST …/{id}/receive` | STAFF+ | `{ confirmOver, lines[{ poLineId, packs \| qty, packPrice?, expiryDate?, lotCode? }] }` |
| `GET /api/admin/reports/suppliers?from&to` | ADMIN | `{ prices[], performance[] }` |

## Acceptance Criteria

- AC-030-01: PO 10 gói, nhận 6 → `PARTIAL`, tồn +6 gói quy đổi; nhận thêm 4 → `RECEIVED`.
- AC-030-02: Nhận vượt → 409 cần xác nhận; có xác nhận → nhận được.
- AC-030-03: Hủy PO đã nhận một phần → 409.
- AC-030-04: Lịch sử giá + tỉ lệ đúng hạn / đủ hàng đúng.

## Bằng chứng

- `tests/inventory2.test.js` → "Nhà cung cấp & đơn đặt hàng": 2 test.
- E2E "kho nâng cao…" (nhận hàng ở quầy, tab Đơn đặt hàng).
