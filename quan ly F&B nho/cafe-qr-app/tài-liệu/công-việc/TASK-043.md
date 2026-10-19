# TASK-043 — Nhà cung cấp & đơn đặt hàng (PO)
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10 (p95 92 ms), lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-030 (AC-030-01…04)
Nguồn: skill `advanced-features` §4 F-030 (chủ dự án giao 17/10/2026) · Quyết định: ADR-006 · Plan: `tài-liệu/kế-hoạch/TASK-035-054-plan.md`

## Mục tiêu
Quản lý danh bạ nhà cung cấp, lập đơn đặt hàng (nháp → gửi → nhận từng phần → đủ), in / chép nội dung gửi Zalo. Quầy nhận hàng theo PO; mỗi lần nhận cộng tồn, giá vốn bình quân, lô, lịch sử giá trong cùng transaction.

## Phạm vi
- Migration `0023_nha_cung_cap.sql` (`Suppliers`, `SupplierIngredients`, `PurchaseOrders`, `PurchaseOrderLines`, `SupplierPriceHistory`; `StockReceipts.PoId/SupplierId`, `StockReceiptLines.PoLineId/ExpiryDate/LotId`).
- SP: `sp_ReceiveStock @PoId, @SupplierId, @ConfirmOver` (nhận vượt → `409 OVER_RECEIPT` trừ khi xác nhận).
- Backend:
  - `purchasingService` / `purchasingRepo`;
  - route `/api/admin/suppliers`, `/api/admin/purchase-orders` (+ `send`, `cancel`, `receive`; hủy PO đã nhận → `409 PO_HAS_RECEIPTS`), `/api/receiving/purchase-orders` (quầy), `GET /api/admin/reports/suppliers`.
- UI:
  - trang mới `/admin/purchasing` "Nhà cung cấp & đặt hàng" (S-35): tab Nhà cung cấp, Đơn đặt hàng, Giá & giao hàng;
  - trang in `/admin/purchase-orders/:id/print` (in / PDF, **Chép nội dung**);
  - quầy Kho & sơ chế → tab **Nhận hàng**.

## Phụ thuộc
TASK-039 (đơn vị gói, giá vốn), TASK-042 (lô khi nhận hàng).

## Validation
`inventory2.test.js` → "Nhà cung cấp & đơn đặt hàng (F-030)" (2 test); E2E "kho nâng cao…" (nhận hàng ở quầy, tab Đơn đặt hàng); chạy lại toàn bộ `npm test`, `npm run test:e2e`, `npm run load`, lint, format — không fail thêm.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-030, ADR-006); hướng dẫn `chức-năng-mới/16-kho-nâng-cao.md`.
